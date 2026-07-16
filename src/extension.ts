import * as vscode from 'vscode';
import { CompletionProvider } from './completionProvider';
import { StatusBarManager } from './statusBar';
import { Config } from './config';
import { DebugChannel } from './debugChannel';
import { StatsTracker } from './statsTracker';
import { SensitiveFileFilter } from './sensitiveFileFilter';
import { DeepSeekClient } from './deepseekClient';
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
  statsTracker = new StatsTracker(context.globalState, () => config.model);
  statusBar = new StatusBarManager(config, statsTracker);

  const sensitiveFilter = new SensitiveFileFilter();

  provider = new CompletionProvider(config, statusBar, sensitiveFilter, debugChannel, statsTracker);

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
    vscode.commands.registerCommand('deepseekFim.setApiKey', async () => {
      const currentKey = await config.getApiKey();
      const hasKey = !!currentKey;

      const value = await vscode.window.showInputBox({
        prompt: hasKey ? 'Change your DeepSeek API key (leave empty to keep current)' : 'Enter your DeepSeek API key',
        placeHolder: 'sk-...',
        password: !hasKey,
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
  safeLog('DeepSeek Autocomplete activated');
}

export function deactivate() {
  provider?.dispose();
  providerDisposable?.dispose();
  statusBar?.dispose();
  debugChannel?.dispose();
  statsTracker?.dispose();
}
