import * as vscode from 'vscode';
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
import { isWhitespaceOrEmpty, isRepetitive, getStopTokensForLanguage, LANGUAGE_MAP } from './utils';

export class CompletionProvider implements vscode.InlineCompletionItemProvider {
  private debouncer = new Debouncer();
  private cache: CompletionCache;
  private client: DeepSeekClient;
  private promptBuilder = new PromptBuilder();
  private multilineClassifier = new MultilineClassifier();
  private apiKeyWarningShown = false;

  constructor(
    private config: Config,
    private statusBar?: StatusBarManager,
    private sensitiveFilter?: SensitiveFileFilter,
    private debug?: DebugChannel,
    private stats?: StatsTracker,
  ) {
    this.cache = new CompletionCache(config.cacheSize);
    this.client = new DeepSeekClient();
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    if (!this.config.enabled) return undefined;

    const apiKey = await this.config.getApiKey();
    if (!apiKey) {
      this.showApiKeyWarning();
      return undefined;
    }

    if (this.sensitiveFilter?.shouldSkip(document)) {
      this.debug?.log(`Skipped sensitive file: ${document.uri.fsPath}`);
      return undefined;
    }

    if (context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke) {
      return this.provideInlineForInvoke(document, position, token, apiKey);
    }

    if (this.config.triggerMode === 'manual') return undefined;

    const shouldDebounce = await this.debouncer.wait(this.config.debounceMs);
    if (shouldDebounce || token.isCancellationRequested) return undefined;

    const rawPrefix = this.promptBuilder.getRawPrefix(document, position, this.config.maxPrefixLines, this.config.maxPrefixChars);
    const cacheHit = this.cache.lookup(rawPrefix);
    if (cacheHit && !isWhitespaceOrEmpty(cacheHit.remaining)) {
      const range = this.getCompletionRange(document, position, cacheHit.remaining);
      this.debug?.log(`Cache hit: "${cacheHit.remaining.slice(0, 40)}..."`);
      this.stats?.trackShown(cacheHit.remaining);
      return [this.createInlineItem(cacheHit.remaining, range)];
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

    this.statusBar?.setLoading(true);

    try {
      const text = await this.completionStream(
        fimContext.prefix, fimContext.suffix, apiKey, document.languageId, token, document.uri.fsPath
      );
      if (!text) return undefined;

      this.cache.set(rawPrefix, text);
      this.stats?.trackShown(text);

      const range = this.getCompletionRange(document, position, text);
      return [this.createInlineItem(text, range)];
    } finally {
      this.statusBar?.setLoading(false);
    }
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

    this.statusBar?.setLoading(true);
    this.debug?.log('Invoke: generating 3 alternatives');

    try {
      const results = await Promise.all(
        [0.0, 0.3, 0.6].map(async (temp) => {
          const text = await this.completionStream(
            fimContext.prefix, fimContext.suffix, apiKey, document.languageId, token, document.uri.fsPath, temp
          );
          return text;
        })
      );

      const items = results
        .filter((t): t is string => {
          if (!t || isWhitespaceOrEmpty(t) || isRepetitive(t)) return false;
          this.stats?.trackShown(t);
          return true;
        })
        .map((text) => {
          const range = this.getCompletionRange(document, position, text);
          return this.createInlineItem(text, range);
        });

      this.debug?.log(`Invoke: returning ${items.length} alternatives`);
      return items.length > 0 ? items : undefined;
    } finally {
      this.statusBar?.setLoading(false);
    }
  }

  private buildPrompt(prefix: string, suffix: string, languageId: string, filePath: string): { prompt: string; suffix: string } {
    const langComment = LANGUAGE_MAP[languageId]?.comment || '//';
    const fileName = filePath ? filePath.split(/[/\\]/).pop() || '' : '';
    const contextHeader = fileName
      ? `${langComment} File: ${fileName}\n${langComment} Language: ${languageId}\n\n`
      : '';

    return {
      prompt: contextHeader + prefix,
      suffix,
    };
  }

  private async completionStream(
    prefix: string,
    suffix: string,
    apiKey: string,
    languageId: string,
    token: vscode.CancellationToken,
    filePath: string,
    temperatureOverride?: number,
  ): Promise<string | undefined> {
    const temperature = temperatureOverride ?? this.config.temperature;
    const needMultiline = this.config.multilineCompletions === 'always' ||
      (this.config.multilineCompletions === 'auto' && this.multilineClassifier.shouldSuggestMultiline(prefix));

    const { prompt, suffix: suf } = this.buildPrompt(prefix, suffix, languageId, filePath);

    const langStops = getStopTokensForLanguage(languageId);
    const userStops = this.config.stopSequences || [];

    const req: FimRequest = {
      prompt,
      suffix: suf,
      maxTokens: this.config.maxTokens,
      temperature,
      topP: 0.95,
      model: this.config.model,
      apiKey,
      baseUrl: this.config.baseUrl,
      timeoutMs: this.config.timeoutMs,
      stop: [...langStops, ...userStops],
    };

    this.debug?.log(`Streaming: prefix=${prompt.length}ch, suffix=${suf.length}ch, temp=${temperature}, model=${req.model}, timeout=${req.timeoutMs}ms`);

    const stream = this.client.streamComplete(req, token);
    let text = '';
    let fulfilled = false;

    const chunkTimeout = setTimeout(() => {
      fulfilled = true;
    }, this.config.streamingTimeout);

    for await (const chunk of stream) {
      if (token.isCancellationRequested) return undefined;
      text += chunk;

      if (needMultiline && text.includes('\n')) {
        clearTimeout(chunkTimeout);
        fulfilled = true;
        break;
      }

      if (!needMultiline && this.hasCompleteStatement(text)) {
        clearTimeout(chunkTimeout);
        fulfilled = true;
        break;
      }
    }

    if (!fulfilled) {
      clearTimeout(chunkTimeout);
    }

    if (!text) return undefined;
    if (isWhitespaceOrEmpty(text) || isRepetitive(text)) return undefined;

    const trimmed = this.trimOverlapWithSuffix(text, suffix);
    if (isWhitespaceOrEmpty(trimmed)) return undefined;

    this.debug?.log(`Completion: ${trimmed.length}ch, reason=${fulfilled ? 'fulfilled' : 'timeout'}`);
    return trimmed;
  }

  private hasCompleteStatement(text: string): boolean {
    const trimmed = text.trimEnd();
    if (trimmed.endsWith(';') || trimmed.endsWith('}') || trimmed.endsWith('{') || trimmed.endsWith(')')) return true;
    if (trimmed.endsWith(':') || trimmed.endsWith(',') || trimmed.endsWith('`') || trimmed.endsWith('"') || trimmed.endsWith("'")) return true;
    if (trimmed.length > 80) return true;
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
    const trimmed = text.trimEnd();

    const suffixLines = suffix.trimStart().split('\n');
    const firstSuffixLine = suffixLines[0]?.trim() || '';

    if (firstSuffixLine && firstSuffixLine.length > 3) {
      if (trimmed.endsWith(firstSuffixLine)) {
        return trimmed.slice(0, -firstSuffixLine.length).trimEnd();
      }
    }

    const suffixStart = suffix.trimStart().slice(0, 30);
    if (!suffixStart) return trimmed;
    if (trimmed.endsWith(suffixStart) || trimmed.endsWith(suffixStart.trim())) {
      return trimmed.slice(0, -suffixStart.length).trimEnd();
    }

    return trimmed;
  }

  private createInlineItem(text: string, range: vscode.Range): vscode.InlineCompletionItem {
    if (this.config.get<boolean>('snippetSupport', false) && (text.includes('$1') || text.includes('${'))) {
      return new vscode.InlineCompletionItem(new vscode.SnippetString(text), range);
    }
    return new vscode.InlineCompletionItem(text, range);
  }

  private getCompletionRange(
    document: vscode.TextDocument,
    position: vscode.Position,
    completionText: string
  ): vscode.Range {
    const currentLine = document.lineAt(position.line).text;
    const beforeCursor = currentLine.slice(
      Math.max(0, position.character - 30),
      position.character
    );

    for (let len = beforeCursor.length; len > 0; len--) {
      const partial = beforeCursor.slice(-len);
      if (completionText.startsWith(partial)) {
        return new vscode.Range(
          position.line,
          position.character - len,
          position.line,
          position.character
        );
      }
    }

    return new vscode.Range(position, position);
  }

  dispose(): void {
    this.debouncer.cancel();
  }
}
