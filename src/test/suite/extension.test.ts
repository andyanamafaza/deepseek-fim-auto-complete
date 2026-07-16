import * as assert from 'assert';
import * as vscode from 'vscode';
import { Debouncer } from '../../debouncer';
import { CompletionCache } from '../../cache';
import { MultilineClassifier } from '../../multilineClassifier';

suite('DeepSeek Autocomplete Extension', () => {
  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('andyanamafaza.deepseek-fim-auto-complete');
    assert.ok(ext);
    await ext?.activate();
    assert.ok(ext?.isActive);
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes('deepseekFim.enable'), 'enable command');
    assert.ok(commands.includes('deepseekFim.disable'), 'disable command');
    assert.ok(commands.includes('deepseekFim.toggle'), 'toggle command');
    assert.ok(commands.includes('deepseekFim.setApiKey'), 'setApiKey command');
    assert.ok(commands.includes('deepseekFim.showStats'), 'showStats command');
    assert.ok(commands.includes('deepseekFim.showLog'), 'showLog command');
    assert.ok(commands.includes('deepseekFim.selectModel'), 'selectModel command');
  });

  test('Toggle command should work', async () => {
    const before = vscode.workspace.getConfiguration('deepseekFim').get<boolean>('enabled', true);
    await vscode.commands.executeCommand('deepseekFim.toggle');
    const after = vscode.workspace.getConfiguration('deepseekFim').get<boolean>('enabled', true);
    assert.strictEqual(after, !before);
    await vscode.commands.executeCommand('deepseekFim.toggle');
    const restored = vscode.workspace.getConfiguration('deepseekFim').get<boolean>('enabled', true);
    assert.strictEqual(restored, before);
  });

  test('Config defaults should be correct', () => {
    const config = vscode.workspace.getConfiguration('deepseekFim');
    assert.strictEqual(config.get<string>('model'), 'deepseek-v4-flash');
    assert.strictEqual(config.get<number>('debounceMs'), 300);
    assert.strictEqual(config.get<number>('maxTokens'), 256);
    assert.strictEqual(config.get<number>('temperature'), 0.0);
    assert.strictEqual(config.get<number>('cacheSize'), 500);
    assert.strictEqual(config.get<string>('multilineCompletions'), 'auto');
    assert.strictEqual(config.get<string>('triggerMode'), 'automatic');
    assert.strictEqual(config.get<number>('streamingTimeout'), 500);
    assert.strictEqual(config.get<boolean>('debug'), false);
    assert.strictEqual(config.get<string>('baseUrl'), 'https://api.deepseek.com/beta');
    assert.strictEqual(config.get<number>('timeoutMs'), 10000);
    assert.deepStrictEqual(config.get<string[]>('disableInFiles'), []);
    assert.deepStrictEqual(config.get<string[]>('stopSequences'), []);
  });

  test('Debouncer should debounce', async () => {
    const debouncer = new Debouncer();
    const [result1, result2] = await Promise.all([
      debouncer.wait(50),
      debouncer.wait(100),
    ]);
    assert.strictEqual(result1, true, 'First call should be debounced');
    assert.strictEqual(result2, false, 'Last call should proceed');
  });

  test('Cache should store and retrieve', () => {
    const cache = new CompletionCache(10);
    cache.set('def hello(', 'world');
    const hit = cache.get('def hello(');
    assert.strictEqual(hit, 'world');
    const lookup = cache.lookup('def hello(');
    assert.ok(lookup);
    assert.strictEqual(lookup.completion, 'world');
  });

  test('MultilineClassifier should detect triggers', () => {
    const classifier = new MultilineClassifier();
    assert.ok(classifier.shouldSuggestMultiline('if x > 0:'));
    assert.ok(classifier.shouldSuggestMultiline('def fib('));
    assert.ok(classifier.shouldSuggestMultiline('const fn = ('));
    assert.ok(classifier.shouldSuggestMultiline('x = {'));
    assert.ok(!classifier.shouldSuggestMultiline('const x = 5'));
    assert.ok(!classifier.shouldSuggestMultiline(''));
  });
});
