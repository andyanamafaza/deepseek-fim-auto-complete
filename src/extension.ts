import * as vscode from 'vscode';
import { CompletionProvider } from './completionProvider';
import { StatusBarManager } from './statusBar';
import { Config } from './config';
import { DebugChannel } from './debugChannel';
import { StatsTracker } from './statsTracker';
import { SensitiveFileFilter } from './sensitiveFileFilter';
import { DeepSeekClient } from './deepseekClient';
import { validateConfig } from './configValidator';
import { safeLog } from './safeConsole';

let providerDisposable: vscode.Disposable | undefined;
let statusBar: StatusBarManager | undefined;
let provider: CompletionProvider | undefined;
let debugChannel: DebugChannel | undefined;
let statsTracker: StatsTracker | undefined;

const MODELS = [
  { label: 'deepseek-v4-flash', description: 'Fast, 2500 concurrent, $0.28/M tokens', default: true },
  { label: 'deepseek-v4-pro', description: 'High quality, 500 concurrent, $0.87/M tokens' },
  { label: 'deepseek-chat', description: 'Legacy — maps to v4-flash non-thinking (deprecated Jul 24)' },
  { label: 'deepseek-reasoner', description: 'Legacy — maps to v4-flash thinking (deprecated Jul 24)' },
];

export async function activate(context: vscode.ExtensionContext) {
  const config = new Config(context.secrets);
  const isDebug = config.get<boolean>('debug', false);

  debugChannel = new DebugChannel('DeepSeek Autocomplete', isDebug);
  statsTracker = new StatsTracker(
    context.globalState,
    () => config.model,
    (rate) => {
      const action = 'Try v4-pro';
      vscode.window.showInformationMessage(
        `Acceptance rate is ${rate}% with v4-flash. Switch to v4-pro for better quality?`,
        action
      ).then((a) => {
        if (a === action) {
          config.update('model', 'deepseek-v4-pro');
          statusBar?.update();
          debugChannel?.log('Auto-switched to v4-pro due to low acceptance rate');
        }
      });
    },
  );
  statusBar = new StatusBarManager(config, statsTracker);

  const sensitiveFilter = new SensitiveFileFilter();

  provider = new CompletionProvider(config, statusBar, sensitiveFilter, debugChannel, statsTracker);
  statsTracker.onAcceptance = (acceptedText) => provider?.prefetchNextCompletion(acceptedText);

  providerDisposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    provider
  );
  context.subscriptions.push(providerDisposable);

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.enable', () => {
      config.update('enabled', true);
      statusBar?.update();
      debugChannel?.log('Completions enabled');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.disable', () => {
      config.update('enabled', false);
      statusBar?.update();
      debugChannel?.log('Completions disabled');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.toggle', async () => {
      const enabled = config.get<boolean>('enabled', true);
      await config.update('enabled', !enabled);
      statusBar?.update();
      debugChannel?.log(`Completions toggled to ${!enabled}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.selectModel', async () => {
      const current = config.model;
      const selection = await vscode.window.showQuickPick(MODELS, {
        placeHolder: `Current model: ${current}`,
        title: 'Select DeepSeek Model',
      });

      if (selection) {
        await config.update('model', selection.label);
        statusBar?.update();
        vscode.window.showInformationMessage(`Model set to: ${selection.label}`);
        debugChannel?.log(`Model changed to: ${selection.label}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.setTemperature', async () => {
      const current = config.temperature;
      const TEMPS = [
        { label: '0.0', description: 'Deterministic — most predictable', detail: current === 0 ? 'current' : undefined },
        { label: '0.1', description: 'Very conservative', detail: current === 0.1 ? 'current' : undefined },
        { label: '0.2', description: 'Slightly creative', detail: current === 0.2 ? 'current' : undefined },
        { label: '0.3', description: 'Balanced', detail: current === 0.3 ? 'current' : undefined },
        { label: '0.5', description: 'Moderate creativity', detail: current === 0.5 ? 'current' : undefined },
        { label: '0.7', description: 'Creative', detail: current === 0.7 ? 'current' : undefined },
        { label: '1.0', description: 'Very creative', detail: current === 1.0 ? 'current' : undefined },
      ];

      const selection = await vscode.window.showQuickPick(TEMPS, {
        placeHolder: `Current temperature: ${current}`,
        title: 'Set Completion Temperature',
      });

      if (selection) {
        await config.update('temperature', parseFloat(selection.label));
        vscode.window.showInformationMessage(`Temperature set to ${selection.label}`);
        debugChannel?.log(`Temperature changed to ${selection.label}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.setMaxTokens', async () => {
      const current = config.maxTokens;
      const TOKEN_OPTIONS = [
        { label: '64', description: 'Very short — single expressions' },
        { label: '128', description: 'Short — single line', detail: current === 128 ? 'current' : undefined },
        { label: '256', description: 'Default — good for most cases', detail: current === 256 ? 'current' : undefined },
        { label: '512', description: 'Long — multi-line blocks', detail: current === 512 ? 'current' : undefined },
        { label: '1024', description: 'Very long — full functions', detail: current === 1024 ? 'current' : undefined },
        { label: '2048', description: 'Maximum practical — entire methods', detail: current === 2048 ? 'current' : undefined },
      ];

      const selection = await vscode.window.showQuickPick(TOKEN_OPTIONS, {
        placeHolder: `Current max tokens: ${current}`,
        title: 'Set Max Tokens per Completion',
      });

      if (selection) {
        await config.update('maxTokens', parseInt(selection.label, 10));
        vscode.window.showInformationMessage(`Max tokens set to ${selection.label}`);
        debugChannel?.log(`Max tokens changed to ${selection.label}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.setApiKey', async () => {
      const currentKey = await config.getApiKey();
      const hasKey = !!currentKey;

      const value = await vscode.window.showInputBox({
        prompt: hasKey ? 'Change your DeepSeek API key (leave empty to keep current)' : 'Enter your DeepSeek API key',
        placeHolder: 'sk-...',
        password: true,
        ignoreFocusOut: true,
        validateInput: (input: string) => {
          if (input && input.length > 0 && !input.startsWith('sk-')) {
            return 'API key should start with "sk-"';
          }
          return null;
        },
      });

      if (value === undefined) return;

      const isEmpty = value.trim() === '';

      if (isEmpty && hasKey) {
        const confirm = await vscode.window.showWarningMessage(
          'Remove saved API key? Completions will stop working.',
          'Remove',
          'Cancel'
        );
        if (confirm !== 'Remove') return;

        await config.setApiKey('');
        vscode.window.showInformationMessage('API key removed from OS keychain.');
        debugChannel?.log('API key removed');
        statusBar?.update();
        return;
      }

      if (!value) return;

      await config.setApiKey(value);
      debugChannel?.log('API key saved. Validating...');

      const client = new DeepSeekClient();
      const validation = await client.validateApiKey(value);

      if (!validation.valid) {
        const action = await vscode.window.showWarningMessage(
          `API key saved but validation returned: ${validation.message}`,
          'Try Again',
          'Ignore'
        );
        if (action === 'Try Again') {
          vscode.commands.executeCommand('deepseekFim.setApiKey');
          return;
        }
      } else {
        vscode.window.showInformationMessage('API key saved and verified in OS keychain.');
        debugChannel?.log('API key validated and saved');
      }

      statusBar?.update();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.deleteApiKey', async () => {
      const hasKey = !!(await config.getApiKey());
      if (!hasKey) {
        vscode.window.showInformationMessage('No API key stored.');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        'Remove DeepSeek API key from OS keychain? Completions will be disabled.',
        'Remove',
        'Cancel'
      );

      if (confirm !== 'Remove') return;

      await config.setApiKey('');
      vscode.window.showInformationMessage('API key removed from OS keychain.');
      debugChannel?.log('API key deleted');
      statusBar?.update();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.benchmarkModels', async () => {
      const apiKey = await config.getApiKey();
      if (!apiKey) {
        vscode.window.showErrorMessage('Set an API key first.');
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Open a file to benchmark against.');
        return;
      }

      const doc = editor.document;
      const pos = editor.selection.active;
      const prefix = doc.getText(new vscode.Range(Math.max(0, pos.line - 10), 0, pos.line, pos.character));
      const suffix = doc.getText(new vscode.Range(pos.line, pos.character, Math.min(doc.lineCount - 1, pos.line + 5), doc.lineAt(Math.min(doc.lineCount - 1, pos.line + 5)).text.length));

      if (!prefix.trim()) {
        vscode.window.showErrorMessage('Need code context around cursor for benchmark.');
        return;
      }

      const client = new DeepSeekClient();
      const results: string[] = [];
      const models = ['deepseek-v4-flash', 'deepseek-v4-pro'];

      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Benchmarking models...' }, async () => {
        for (const model of models) {
          const start = Date.now();
          const result = await client.complete({
            model,
            prompt: prefix,
            suffix,
            maxTokens: 128,
            temperature: 0,
            apiKey,
            stop: ['\n\n\n'],
          }, new vscode.CancellationTokenSource().token);
          const elapsed = Date.now() - start;

          if (result) {
            const preview = result.text.replace(/\n/g, '\\n').slice(0, 60);
            results.push(`${model}: ${elapsed}ms — "${preview}"`);
          } else {
            results.push(`${model}: failed`);
          }
        }
      });

      vscode.window.showInformationMessage(results.join(' | '), 'Copy').then((a) => {
        if (a === 'Copy') vscode.env.clipboard.writeText(results.join('\n'));
      });
      debugChannel?.log('Benchmark: ' + results.join(' | '));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.showStats', () => {
      if (statsTracker) {
        vscode.window.showInformationMessage(statsTracker.summary);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.showLog', () => {
      debugChannel?.show();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.acceptNextWord', async () => {
      try {
        const handled = await vscode.commands.executeCommand<boolean>('editorAction.inlineCompletion.acceptNextWord');
        if (!handled) {
          await vscode.commands.executeCommand('editor.action.inlineCompletion.accept');
        }
      } catch {
        await vscode.commands.executeCommand('editor.action.inlineCompletion.accept');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.nextSuggestion', () => {
      vscode.commands.executeCommand('editorAction.inlineCompletion.showNextInlineCompletion');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.previousSuggestion', () => {
      vscode.commands.executeCommand('editorAction.inlineCompletion.showPreviousInlineCompletion');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekFim.acceptOnEnter', async () => {
      const acceptOnEnter = vscode.workspace.getConfiguration('deepseekFim').get<boolean>('acceptOnEnter', false);
      if (!acceptOnEnter) {
        await vscode.commands.executeCommand('type', { source: 'keyboard', text: '\n' });
        return;
      }
      await vscode.commands.executeCommand('editor.action.inlineCompletion.accept');
    })
  );

  const hoverDisposable = vscode.languages.registerHoverProvider({ pattern: '**' }, {
    provideHover(document, position) {
      if (!provider || !vscode.window.activeTextEditor) return undefined;

      const editor = vscode.window.activeTextEditor;
      const cursor = editor.selection.active;
      if (Math.abs(position.line - cursor.line) > 1) return undefined;
      if (Math.abs(position.character - cursor.character) > 20) return undefined;

      const alts = provider.currentAlternatives;
      if (alts.length < 2) return undefined;

      const md = alts.slice(0, 5).map((alt, i) => {
        const preview = alt.text.replace(/\n/g, '↵').substring(0, 80);
        return `**Alt ${i + 1}** (t=${alt.temperature}): \`${preview}\``;
      }).join('\n\n---\n\n');

      return new vscode.Hover(new vscode.MarkdownString(md ? `Alternatives available:\n\n${md}` : ''));
    }
  });
  context.subscriptions.push(hoverDisposable);

  if (context.globalState.get('deepseekFim.firstActivation') !== true) {
    context.globalState.update('deepseekFim.firstActivation', true);
    const apiKey = await config.getApiKey();
    if (!apiKey) {
      const setup = await vscode.window.showInformationMessage(
        'Welcome to DeepSeek Autocomplete! Set your API key to get started.',
        'Set API Key'
      );
      if (setup === 'Set API Key') {
        vscode.commands.executeCommand('deepseekFim.setApiKey');
      }
    }
  }

  statusBar.update();
  debugChannel?.log('Extension activated');

  const configWarnings = validateConfig(config);
  for (const w of configWarnings) {
    debugChannel?.log(`Config warning: ${w.setting} — ${w.message}`);
  }
  if (configWarnings.length > 0) {
    debugChannel?.show();
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('deepseekFim')) return;
      statusBar?.update();
      const warnings = validateConfig(config);
      for (const w of warnings) {
        debugChannel?.log(`Config re-check: ${w.setting} — ${w.message}`);
      }
    })
  );

  safeLog('DeepSeek Autocomplete activated');
}

export function deactivate() {
  provider?.dispose();
  providerDisposable?.dispose();
  statusBar?.dispose();
  debugChannel?.dispose();
  statsTracker?.dispose();
}
