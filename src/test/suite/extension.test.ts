import assert from 'assert';
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
    assert.ok(commands.includes('deepseekFim.deleteApiKey'), 'deleteApiKey command');
    assert.ok(commands.includes('deepseekFim.setTemperature'), 'setTemperature command');
    assert.ok(commands.includes('deepseekFim.setMaxTokens'), 'setMaxTokens command');
    assert.ok(commands.includes('deepseekFim.benchmarkModels'), 'benchmarkModels command');
    assert.ok(commands.includes('deepseekFim.acceptNextWord'), 'acceptNextWord command');
    assert.ok(commands.includes('deepseekFim.nextSuggestion'), 'nextSuggestion command');
    assert.ok(commands.includes('deepseekFim.previousSuggestion'), 'previousSuggestion command');
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
    assert.strictEqual(config.get<boolean>('acceptOnEnter'), false);
    assert.strictEqual(config.get<boolean>('alwaysShowCompletions'), false);
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

  test('Debouncer clear should reset state', async () => {
    const debouncer = new Debouncer();
    const p1 = debouncer.wait(100);
    debouncer.clear();
    const p2 = debouncer.wait(50);
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.strictEqual(r1, true, 'Cleared request should be stale');
    assert.strictEqual(r2, false, 'Current request should proceed');
  });

  test('Cache should store and retrieve', () => {
    const cache = new CompletionCache(10);
    cache.set('def hello(', 'world');
    const hit = cache.get('def hello(');
    assert.strictEqual(hit, 'world');
    const lookup = cache.lookup('def hello(');
    assert.ok(lookup);
    assert.strictEqual(lookup!.completion, 'world');
  });

  test('Cache should evict oldest when at capacity', () => {
    const cache = new CompletionCache(2);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    assert.strictEqual(cache.get('a'), undefined, 'a should be evicted');
    assert.ok(cache.get('b') || cache.get('c'), 'b or c should survive');
  });

  test('MultilineClassifier should detect triggers', () => {
    const classifier = new MultilineClassifier();
    assert.ok(classifier.shouldSuggestMultiline('if x > 0:'));
    assert.ok(classifier.shouldSuggestMultiline('def fib('));
    assert.ok(classifier.shouldSuggestMultiline('const fn = ('));
    assert.ok(classifier.shouldSuggestMultiline('x = {'));
    assert.ok(!classifier.shouldSuggestMultiline('const x = 5'));
    assert.ok(!classifier.shouldSuggestMultiline(''));
    assert.ok(classifier.shouldSuggestMultiline('try:'));
    assert.ok(classifier.shouldSuggestMultiline('except Exception as e:'));
    assert.ok(classifier.shouldSuggestMultiline('for item in items:'));
  });

  test('MultilineClassifier should trigger on previous line', () => {
    const classifier = new MultilineClassifier();
    assert.ok(classifier.shouldSuggestMultiline('if x:\n'));
    assert.ok(classifier.shouldSuggestMultiline('def foo():\n'));
    assert.ok(!classifier.shouldSuggestMultiline('\n'));
  });
});
