import * as vscode from 'vscode';
import { exec } from 'child_process';
import { Config } from './config';
import { StatusBarManager } from './statusBar';
import { Debouncer } from './debouncer';
import { CompletionCache } from './cache';
import { DeepSeekClient, FimRequest } from './deepseekClient';
import { PromptBuilder } from './promptBuilder';
import { MultilineClassifier } from './multilineClassifier';
import { SensitiveFileFilter } from './sensitiveFileFilter';
import { DebugChannel } from './debugChannel';
import { StatsTracker } from './statsTracker';
import { isWhitespaceOrEmpty, isRepetitive, LANGUAGE_MAP } from './utils';
import { extractContext } from './contextExtractor';
import { collectMultiFileContext } from './multiFileContext';
import { findSimilarCode } from './semanticContext';

export class CompletionProvider implements vscode.InlineCompletionItemProvider {
  private debouncer = new Debouncer();
  private cache: CompletionCache;
  private client: DeepSeekClient;
  private promptBuilder = new PromptBuilder();
  private multilineClassifier = new MultilineClassifier();
  private apiKeyWarningShown = false;

  private activeSuggestion: { prefix: string; fullText: string; overlapChars: number; documentUri: string; documentVersion: number } | null = null;
  private acceptedAt = 0;
  private readonly ACCEPT_GUARD_MS = 400;
  private lastFailureNotify = 0;
  private lastMultiline = false;
  private alternativesCache: Array<{ text: string; temperature: number }> = [];
  private gitDiffCache = new Map<string, { result: string; timestamp: number }>();
  private readonly GIT_DIFF_TTL = 30_000;
  private readonly MAX_ALTERNATIVES = 10;
  private readonly MAX_GIT_DIFF_CACHE = 50;
  private prefetchTimeout: NodeJS.Timeout | null = null;

  private contextCache: {
    docUri: string;
    docVersion: number;
    contextHeader: string;
    computedAt: number;
  } | null = null;

  constructor(
    private config: Config,
    private statusBar?: StatusBarManager,
    private sensitiveFilter?: SensitiveFileFilter,
    private debug?: DebugChannel,
    private stats?: StatsTracker,
  ) {
    this.cache = new CompletionCache(config.cacheSize);
    this.client = new DeepSeekClient((message) => this.debug?.log(message));
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    if (!this.config.enabled) return undefined;

    if (this.sensitiveFilter?.shouldSkip(document)) {
      this.debug?.log(`Skipped sensitive file: ${document.uri.fsPath}`);
      this.statusBar?.setNotice('Completions are off for this file (sensitive file or deepseekFim.disableInFiles).');
      return undefined;
    }

    // Suppress re-triggering right after the user accepted a suggestion.
    if (Date.now() - this.acceptedAt < this.ACCEPT_GUARD_MS) return undefined;

    const result = this.tryAdaptiveGhostText(document, position);
    if (result) return result;

    if (context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke) {
      this.debouncer.clear();
      this.contextCache = null;
      const apiKey = await this.config.getApiKey();
      if (!apiKey) { this.showApiKeyWarning(); return undefined; }
      return this.provideInlineForInvoke(document, position, token, apiKey);
    }

    if (this.config.triggerMode === 'manual') return undefined;

    const alwaysShow = this.config.get<boolean>('alwaysShowCompletions', false);

    if (!alwaysShow) {
      const isStale = await this.debouncer.wait(this.config.debounceMs);
      if (isStale || token.isCancellationRequested) return undefined;
    }

    const apiKey = await this.config.getApiKey();
    if (!apiKey) {
      this.showApiKeyWarning();
      return undefined;
    }

    const rawPrefix = this.promptBuilder.getRawPrefix(document, position, this.config.maxPrefixLines, this.config.maxPrefixChars);

    const cacheHit = this.cache.lookup(rawPrefix);
    if (cacheHit && !isWhitespaceOrEmpty(cacheHit.remaining)) {
      this.debug?.log(`Cache hit: "${cacheHit.remaining.slice(0, 40)}..."`);
      this.stats?.trackShown(cacheHit.remaining);
      this.activeSuggestion = { prefix: rawPrefix, fullText: cacheHit.remaining, overlapChars: 0, documentUri: document.uri.toString(), documentVersion: document.version };
      const tokenEstimate = Math.ceil(cacheHit.remaining.length / 4);
      this.statusBar?.setSuggestionInfo(tokenEstimate, 1);
      return [this.makeInlineItem(document, position, cacheHit.remaining)];
    }

    const fimContext = this.promptBuilder.build(
      document,
      position,
      this.config.maxPrefixLines,
      this.config.maxSuffixLines,
      this.config.maxPrefixChars,
      this.config.maxSuffixChars,
    );

    if (isWhitespaceOrEmpty(fimContext.prefix)) return undefined;

    this.statusBar?.setLoading(true, this.wantMultiline(fimContext.prefix));

    try {
      const builtPrompt = await this.buildPrompt(
        fimContext.prefix, fimContext.suffix, document.languageId,
        document.uri.fsPath, document, position
      );

      const text = await this.completionStream(
        fimContext.prefix, fimContext.suffix, apiKey, document.languageId,
        token, document.uri.fsPath, undefined, document, position, builtPrompt
      );

      if (!text) return undefined;

      this.cache.set(rawPrefix, text);
      this.stats?.trackShown(text);
      this.alternativesCache = [{ text, temperature: this.config.temperature }].slice(-this.MAX_ALTERNATIVES);

      this.activeSuggestion = { prefix: rawPrefix, fullText: text, overlapChars: 0, documentUri: document.uri.toString(), documentVersion: document.version };

      const tokenEstimate = Math.ceil(text.length / 4);
      this.statusBar?.setSuggestionInfo(tokenEstimate, 1, this.lastMultiline);

      return [this.makeInlineItem(document, position, text)];
    } finally {
      this.statusBar?.setLoading(false);
    }
  }

  private requestCount = 0;
  private lastRequestTime = 0;

  private wantMultiline(prefix: string): boolean {
    return this.config.multilineCompletions === 'always' ||
      (this.config.multilineCompletions === 'auto' && this.multilineClassifier.shouldSuggestMultiline(prefix));
  }

  private getAdaptiveStreamingTimeout(): number {
    const base = this.config.streamingTimeout;
    if (this.requestCount < 3 || Date.now() - this.lastRequestTime > 30000) {
      return Math.max(base, 4000);
    }
    return base;
  }

  private clearActiveSuggestion(): void {
    this.activeSuggestion = null;
    this.statusBar?.clearSuggestion();
  }

  private tryAdaptiveGhostText(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.InlineCompletionItem[] | undefined {
    if (!this.activeSuggestion) return undefined;
    if (document.uri.toString() !== this.activeSuggestion.documentUri) {
      this.clearActiveSuggestion();
      return undefined;
    }

    const rawPrefix = this.promptBuilder.getRawPrefix(document, position, this.config.maxPrefixLines, this.config.maxPrefixChars);

    if (!rawPrefix.startsWith(this.activeSuggestion.prefix)) {
      this.clearActiveSuggestion();
      return undefined;
    }

    const newlyTyped = rawPrefix.slice(this.activeSuggestion.prefix.length);
    if (!newlyTyped) return undefined;

    const ghostText = this.activeSuggestion.fullText.slice(this.activeSuggestion.overlapChars);

    if (!ghostText.startsWith(newlyTyped)) {
      this.clearActiveSuggestion();
      return undefined;
    }

    const remaining = this.activeSuggestion.fullText.slice(this.activeSuggestion.overlapChars + newlyTyped.length);
    if (isWhitespaceOrEmpty(remaining)) {
      this.clearActiveSuggestion();
      return undefined;
    }

    this.activeSuggestion = { ...this.activeSuggestion, prefix: rawPrefix, fullText: remaining, overlapChars: 0 };
    this.debug?.log(`Adaptive ghost text: "${remaining.slice(0, 40)}..."`);
    const tokenEstimate = Math.ceil(remaining.length / 4);
    this.statusBar?.setSuggestionInfo(tokenEstimate, this.alternativesCache.length || 1);
    return [this.makeInlineItem(document, position, remaining)];
  }

  private async generateMultiCompletions(
    prefix: string,
    suffix: string,
    apiKey: string,
    languageId: string,
    filePath: string,
    token: vscode.CancellationToken,
    temperatures: number[],
    document?: vscode.TextDocument,
    position?: vscode.Position,
    prebuiltPrompt?: { prompt: string; suffix: string },
  ): Promise<Array<{ text: string; temperature: number }> | undefined> {
    const builtPrompt = prebuiltPrompt ?? await this.buildPrompt(prefix, suffix, languageId, filePath, document, position);

    const results = await Promise.all(
      temperatures.map(async (temp) => {
        const text = await this.completionStream(
          prefix, suffix, apiKey, languageId, token, filePath, temp, document, position, builtPrompt
        );
        return text ? { text, temperature: temp } : null;
      })
    );

    const valid = results.filter((r): r is { text: string; temperature: number } => {
      if (!r) return false;
      if (isWhitespaceOrEmpty(r.text) || isRepetitive(r.text)) return false;
      return true;
    });

    if (valid.length === 0) return undefined;

    const seen = new Set<string>();
    const unique: Array<{ text: string; temperature: number }> = [];
    for (const r of valid) {
      const key = r.text.slice(0, 80).trim();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }

    return unique;
  }

  private async provideInlineForInvoke(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    apiKey: string,
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    const fimContext = this.promptBuilder.build(
      document,
      position,
      this.config.maxPrefixLines,
      this.config.maxSuffixLines,
      this.config.maxPrefixChars,
      this.config.maxSuffixChars,
    );

    if (isWhitespaceOrEmpty(fimContext.prefix)) return undefined;

    this.statusBar?.setLoading(true, this.wantMultiline(fimContext.prefix));
    this.debug?.log('Invoke: generating alternatives at different temperatures');

    try {
      const builtPrompt = await this.buildPrompt(
        fimContext.prefix, fimContext.suffix, document.languageId,
        document.uri.fsPath, document, position
      );

      const temperatures = [0.0, 0.3, 0.6];
      const results = await this.generateMultiCompletions(
        fimContext.prefix, fimContext.suffix, apiKey, document.languageId,
        document.uri.fsPath, token, temperatures, document, position, builtPrompt
      );

      if (!results || results.length === 0) return undefined;

      for (const r of results) {
        this.stats?.trackShown(r.text);
      }

      this.alternativesCache = results.slice().slice(-this.MAX_ALTERNATIVES);

      const items = results.map((r) => this.makeInlineItem(document, position, r.text));

      this.debug?.log(`Invoke: returning ${items.length} alternatives`);
      return items;
    } finally {
      this.statusBar?.setLoading(false);
    }
  }

  private async buildPrompt(prefix: string, suffix: string, languageId: string, filePath: string, document?: vscode.TextDocument, position?: vscode.Position): Promise<{ prompt: string; suffix: string }> {
    const langComment = LANGUAGE_MAP[languageId]?.comment || '//';
    const fileName = filePath ? filePath.split(/[/\\]/).pop() || '' : '';
    let contextHeader = fileName
      ? `${langComment} File: ${fileName}\n${langComment} Language: ${languageId}\n\n`
      : '';

    const enrich = this.config.contextEnrichment;
    const docId = document ? `${document.uri.toString()}:${document.version}` : '';
    const cacheValid = enrich
      && this.contextCache
      && docId
      && this.contextCache.docUri === document?.uri.toString()
      && this.contextCache.docVersion === document?.version
      && (Date.now() - this.contextCache.computedAt < 800);

    if (cacheValid) {
      contextHeader = this.contextCache!.contextHeader;
    } else if (enrich && document && position) {
      const enrichmentTasks: Promise<string | undefined>[] = [];

      const extractPromise = extractContext(document, position);
      const diagPromise = Promise.resolve(this.getDiagnosticsContext(document, position));
      const gitPromise = this.getGitContext(filePath);

      enrichmentTasks.push(
        (async () => {
          const ctx = await extractPromise;
          const parts: string[] = [];
          if (ctx.decorators.length > 0) {
            parts.push(ctx.decorators.map((d) => `${langComment} Decorator: ${d}`).join('\n'));
          }
          if (ctx.classDeclaration) {
            parts.push(`${langComment} In class: ${ctx.classDeclaration}`);
          }
          if (ctx.functionSignature) {
            parts.push(`${langComment} In function: ${ctx.functionSignature}`);
          }
          if (ctx.returnTypeAnnotation) {
            parts.push(`${langComment} Returns: ${ctx.returnTypeAnnotation}`);
          }
          if (ctx.imports.length > 0) {
            parts.push(ctx.imports.slice(-4).map((imp) => `${langComment} Import: ${imp}`).join('\n') + '\n');
          }
          return parts.length > 0 ? parts.join('\n') + '\n' : '\n';
        })()
      );

      enrichmentTasks.push(diagPromise);
      enrichmentTasks.push(gitPromise);

      if (document && position) {
        enrichmentTasks.push(
          (async () => {
            try {
              const similarBlocks = await Promise.resolve().then(() => findSimilarCode(document!, prefix));
              if (similarBlocks.length > 0) {
                return similarBlocks.map((block) =>
                  `${langComment} Similar pattern:\n${langComment} ${block.replace(/\n/g, '\n' + langComment + ' ')}`
                ).join('\n') + '\n\n';
              }
            } catch {
              // similar-code matching is best-effort
            }
            return undefined;
          })()
        );
        enrichmentTasks.push(
          (async () => {
            try {
              const relatedContexts = await collectMultiFileContext(document!, position);
              if (relatedContexts.length > 0) {
                return relatedContexts.join('\n') + '\n\n';
              }
            } catch {
              // cross-file context is best-effort
            }
            return undefined;
          })()
        );
      }

      const results = await Promise.all(enrichmentTasks);
      for (const r of results) {
        if (r) contextHeader += r;
      }

      this.contextCache = {
        docUri: document.uri.toString(),
        docVersion: document.version,
        contextHeader,
        computedAt: Date.now(),
      };
    }

    const comment = this.hasCommentAbove(prefix, languageId);
    const commentHint = comment
      ? `${langComment} Complete the code for: ${comment}\n`
      : '';

    return {
      prompt: contextHeader + commentHint + prefix,
      suffix,
    };
  }

  private getDiagnosticsContext(document?: vscode.TextDocument, position?: vscode.Position): string | undefined {
    if (!document || !position) return undefined;
    const langComment = LANGUAGE_MAP[document.languageId]?.comment || '//';

    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const nearCursor = diagnostics.filter((d) => {
      const dLine = d.range.start.line;
      return dLine >= position.line - 3 && dLine <= position.line + 1;
    });

    if (nearCursor.length === 0) return undefined;

    const lines: string[] = [`${langComment} Diagnostics near cursor:`];
    for (const d of nearCursor.slice(0, 3)) {
      const line = d.range.start.line;
      const msg = d.message.replace(/\n/g, ' ').substring(0, 80);
      const tag = d.severity === vscode.DiagnosticSeverity.Error ? 'Error' : 'Warning';
      lines.push(`${langComment}   L${line}: [${tag}] ${msg}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  private async getGitContext(filePath: string): Promise<string | undefined> {
    if (!filePath) return undefined;

    const cached = this.gitDiffCache.get(filePath);
    if (cached && Date.now() - cached.timestamp < this.GIT_DIFF_TTL) {
      return cached.result;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return undefined;

    const repoRoot = workspaceFolders[0].uri.fsPath;
    const absPath = filePath.replace(/\\/g, '/');
    const relative = absPath.startsWith(repoRoot.replace(/\\/g, '/'))
      ? absPath.slice(repoRoot.length).replace(/^\//, '')
      : '';

    if (!relative) return undefined;

    try {
      const result = await new Promise<string>((resolve, reject) => {
        exec(`git diff --unified=3 HEAD -- "${relative}"`, {
          cwd: repoRoot,
          timeout: 2000,
        }, (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        });
      });

      const trimmed = result.trim();
      if (!trimmed) {
        this.gitDiffCache.set(filePath, { result: undefined as unknown as string, timestamp: Date.now() });
        return undefined;
      }

      const lines = trimmed.split('\n').filter((l: string) => l.startsWith('+') || l.startsWith('-'));
      if (lines.length === 0) {
        this.gitDiffCache.set(filePath, { result: undefined as unknown as string, timestamp: Date.now() });
        return undefined;
      }

      const snippet = lines.slice(0, 8).join('\n');
      const langComment = LANGUAGE_MAP[
        Object.keys(LANGUAGE_MAP).find((k) => filePath.endsWith(`.${k}`)) || ''
      ]?.comment || '//';

      const output = `${langComment} Recent changes (${lines.length} lines changed):\n${langComment} ${snippet.replace(/\n/g, '\n' + langComment + ' ')}\n\n`;
      if (this.gitDiffCache.size >= this.MAX_GIT_DIFF_CACHE) {
        const oldest = this.gitDiffCache.entries().next().value;
        if (oldest) this.gitDiffCache.delete(oldest[0]);
      }
      this.gitDiffCache.set(filePath, { result: output, timestamp: Date.now() });
      return output;
    } catch {
      this.gitDiffCache.set(filePath, { result: undefined as unknown as string, timestamp: Date.now() });
      return undefined;
    }
  }

  private hasCommentAbove(prefix: string, languageId: string): string | undefined {
    const langInfo = LANGUAGE_MAP[languageId];
    if (!langInfo) return undefined;
    const lines = prefix.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed.length === 0) continue;
      if (trimmed.startsWith(langInfo.comment)) {
        return trimmed.replace(langInfo.comment, '').trim();
      }
      return undefined;
    }
    return undefined;
  }

  private async completionStream(
    prefix: string,
    suffix: string,
    apiKey: string,
    languageId: string,
    token: vscode.CancellationToken,
    filePath: string,
    temperatureOverride?: number,
    document?: vscode.TextDocument,
    position?: vscode.Position,
    prebuiltPrompt?: { prompt: string; suffix: string },
  ): Promise<string | undefined> {
    const temperature = temperatureOverride ?? this.config.temperature;
    const needMultiline = this.wantMultiline(prefix);
    this.lastMultiline = needMultiline;

    const effectiveModel = this.config.model;

    const userStops = this.config.stopSequences || [];
    const stop = [...new Set(['\n\n\n', ...userStops])];

    const userMax = this.config.maxTokens;
    const effectiveMaxTokens = needMultiline ? Math.max(userMax, 1024) : userMax;

    const { prompt, suffix: suf } = prebuiltPrompt ?? await this.buildPrompt(prefix, suffix, languageId, filePath, document, position);

    const req: FimRequest = {
      prompt,
      suffix: suf,
      maxTokens: effectiveMaxTokens,
      temperature,
      topP: 0.95,
      model: effectiveModel,
      apiKey,
      baseUrl: this.config.baseUrl,
      timeoutMs: this.config.timeoutMs,
      stop,
    };

    this.debug?.log(`Request (${this.config.streaming ? 'stream' : 'single'}): prefix=${prompt.length}ch, suffix=${suf.length}ch, temp=${temperature}, model=${req.model}, multiline=${needMultiline}`);

    let text = '';
    let hasContent = false;
    let wasCancelled = false;
    const startTime = Date.now();
    const streamingTimeout = this.config.streaming && !needMultiline ? this.getAdaptiveStreamingTimeout() : 0;

    if (this.config.streaming) {
      const stream = this.client.streamComplete(req, token);
      try {
        for await (const chunk of stream) {
          if (token.isCancellationRequested) {
            wasCancelled = true;
            break;
          }

          text += chunk;
          if (chunk.trim().length > 0) hasContent = true;

          if (!needMultiline && this.hasCompleteStatement(text)) {
            break;
          }

          if (streamingTimeout > 0 && Date.now() - startTime > streamingTimeout) {
            this.debug?.log('Streaming timeout reached, showing partial result');
            break;
          }
        }
      } catch (err) {
        this.debug?.log(`Stream error after ${text.length} chars: ${err}`);
      }
    } else {
      const res = await this.client.complete(req, token);
      if (res?.text) {
        text = res.text;
        hasContent = text.trim().length > 0;
      }
    }

    this.requestCount++;
    this.lastRequestTime = Date.now();

    if (!hasContent) {
      if (!wasCancelled && !token.isCancellationRequested) this.reportRequestFailure();
      return undefined;
    }

    const partial = wasCancelled || (streamingTimeout > 0 && Date.now() - startTime > streamingTimeout);

    if (!partial) {
      if (isWhitespaceOrEmpty(text) || isRepetitive(text)) return undefined;
    } else if (text.trim().length < 5) {
      return undefined;
    }

    const trimmed = this.trimOverlapWithSuffix(text, suffix);
    if (isWhitespaceOrEmpty(trimmed)) return undefined;

    this.debug?.log(`Completion: ${trimmed.length}ch${partial ? ' (partial)' : ''}`);
    return trimmed;
  }

  private hasCompleteStatement(text: string): boolean {
    const trimmed = text.trimEnd();
    const hasNewline = text.includes('\n');
    if (hasNewline) return false;
    if (trimmed.endsWith(';') && trimmed.length > 20) return true;
    if (trimmed.length > 120) return true;
    return false;
  }

  private showApiKeyWarning(): void {
    if (this.apiKeyWarningShown) return;
    this.apiKeyWarningShown = true;
    vscode.window.showWarningMessage(
      'DeepSeek Autocomplete: Set your API key to enable completions.',
      'Set API Key'
    ).then((action) => {
      if (action === 'Set API Key') {
        vscode.commands.executeCommand('deepseekFim.setApiKey');
      }
    });
  }

  private trimOverlapWithSuffix(text: string, suffix: string): string {
    if (!suffix) return text;
    let trimmed = text.trimEnd();

    const suffixTrimmed = suffix.trimStart();
    const suffixLines = suffixTrimmed.split('\n');

    for (const suffixLine of suffixLines) {
      const line = suffixLine.trim();
      if (line.length <= 3) continue;
      if (trimmed.endsWith(line)) {
        trimmed = trimmed.slice(0, -line.length).trimEnd();
      }
    }

    const suffixStart = suffixTrimmed.slice(0, 30);
    if (suffixStart && (trimmed.endsWith(suffixStart) || trimmed.endsWith(suffixStart.trim()))) {
      trimmed = trimmed.slice(0, -suffixStart.length).trimEnd();
    }

    return trimmed;
  }

  private createInlineItem(text: string, range: vscode.Range): vscode.InlineCompletionItem {
    if (this.config.get<boolean>('snippetSupport', false)) {
      const hasSnippetTabstop = /\$[1-9]\d*\b/.test(text) || /\$\{\d+[^}]*\}/.test(text);
      if (hasSnippetTabstop) {
        return new vscode.InlineCompletionItem(new vscode.SnippetString(text), range);
      }
    }
    return new vscode.InlineCompletionItem(text, range);
  }

  /**
   * Build an inline item that replaces from the cursor to the end of the current
   * line with `completionText` followed by the existing line tail. VS Code diffs
   * the replaced range against the inserted text and renders only the new part as
   * ghost text, so a Fill-in-the-Middle response that echoes the suffix no longer
   * duplicates or deletes code when accepted.
   */
  private makeInlineItem(
    document: vscode.TextDocument,
    position: vscode.Position,
    completionText: string,
  ): vscode.InlineCompletionItem {
    const lineEnd = document.lineAt(position.line).range.end;
    const range = new vscode.Range(position, lineEnd);
    const lineTail = document.getText(range);

    const insertText = lineTail.length > 0 && !completionText.endsWith(lineTail)
      ? completionText + lineTail
      : completionText;

    const item = this.createInlineItem(insertText, range);
    // Executed by VS Code after the item is accepted — the reliable accept signal.
    item.command = { command: 'deepseekFim._accepted', title: '' };
    this.statusBar?.setNotice(undefined);
    return item;
  }

  markAccepted(): void {
    this.acceptedAt = Date.now();
  }

  private reportRequestFailure(): void {
    const err = this.client.lastError;
    if (!err) {
      // A successful response that yielded nothing usable is not an error.
      this.debug?.log('Request returned no usable completion.');
      return;
    }

    const failure = this.describeFailure(err);
    this.debug?.log(`Request failed: ${failure.message}`);

    // Notify at most once a minute so a burst of keystrokes can't spam the user.
    const now = Date.now();
    if (now - this.lastFailureNotify < 60_000) return;
    this.lastFailureNotify = now;

    vscode.window
      .showErrorMessage(`DeepSeek Autocomplete: ${failure.message}`, ...failure.actions)
      .then((choice) => {
        if (choice === 'Open Log') this.debug?.show();
        else if (choice === 'Set API Key') vscode.commands.executeCommand('deepseekFim.setApiKey');
      });
  }

  private describeFailure(err: string): { message: string; actions: string[] } {
    const e = (err || '').toLowerCase();
    if (e.includes('401') || e.includes('invalid api key') || e.includes('authentication')) {
      return { message: 'invalid API key. Set a valid key to enable completions.', actions: ['Set API Key', 'Open Log'] };
    }
    if (e.includes('402') || e.includes('insufficient') || e.includes('balance') || e.includes('quota')) {
      return { message: 'account is out of credits.', actions: ['Open Log'] };
    }
    if (e.includes('429')) {
      return { message: 'rate limited by DeepSeek. Try again shortly.', actions: ['Open Log'] };
    }
    if (e.includes('etimedout') || e.includes('timeout') || e.includes('aborted')) {
      return { message: 'request timed out. Raise "deepseekFim.timeoutMs" for long completions.', actions: ['Open Log'] };
    }
    if (e.includes('enotfound') || e.includes('econnreset') || e.includes('could not reach')) {
      return { message: 'could not reach the DeepSeek API. Check your network.', actions: ['Open Log'] };
    }
    const short = err.length > 120 ? `${err.slice(0, 120)}…` : err;
    return { message: `request failed (${short}).`, actions: ['Open Log'] };
  }

  get currentAlternatives(): { text: string; temperature: number }[] {
    return this.alternativesCache;
  }

  prefetchNextCompletion(): void {
    if (this.prefetchTimeout) {
      clearTimeout(this.prefetchTimeout);
      this.prefetchTimeout = null;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const position = editor.selection.active;

    const rawPrefix = this.promptBuilder.getRawPrefix(document, position, this.config.maxPrefixLines, this.config.maxPrefixChars);

    const cached = this.cache.get(rawPrefix);
    if (cached) return;

    const fimContext = this.promptBuilder.build(
      document,
      position,
      this.config.maxPrefixLines,
      this.config.maxSuffixLines,
      this.config.maxPrefixChars,
      this.config.maxSuffixChars,
    );

    if (isWhitespaceOrEmpty(fimContext.prefix)) return;

    this.prefetchTimeout = setTimeout(() => {
      Promise.resolve().then(async () => {
        const apiKey = await this.config.getApiKey();
        if (!apiKey) return;

        const cancellation = new vscode.CancellationTokenSource();
        try {
          const text = await this.completionStream(
            fimContext.prefix, fimContext.suffix, apiKey, document.languageId,
            cancellation.token, document.uri.fsPath, undefined, document, position
          );

          if (text) {
            this.cache.set(rawPrefix, text);
            this.debug?.log(`Pre-fetched: ${text.slice(0, 40)}...`);
          }
        } catch (err) {
          this.debug?.log(`Pre-fetch error: ${err}`);
        } finally {
          cancellation.dispose();
        }
      });
    }, 100);
  }

  dispose(): void {
    this.debouncer.cancel();
    this.activeSuggestion = null;
    this.alternativesCache = [];
    this.gitDiffCache.clear();
    if (this.prefetchTimeout) {
      clearTimeout(this.prefetchTimeout);
      this.prefetchTimeout = null;
    }
  }
}
