import assert from 'assert';
import { CompletionCache } from '../../cache';

suite('CompletionCache', () => {
  test('should store and retrieve by exact key', () => {
    const cache = new CompletionCache(10);
    cache.set('def hello(', 'world');
    assert.strictEqual(cache.get('def hello('), 'world');
    assert.strictEqual(cache.get('nonexistent'), undefined);
  });

  test('lookup should find longest matching prefix', () => {
    const cache = new CompletionCache(10);
    cache.set('def hello', 'world');
    cache.set('def hello_world', 'bigger');
    const result = cache.lookup('def hello_world_extra');
    assert.ok(result);
    assert.strictEqual(result!.completion, 'bigger');
  });

  test('fuzzy matching: whitespace normalized keys', () => {
    const cache = new CompletionCache(10);
    cache.set('function  foo', 'bar');
    assert.strictEqual(cache.get('function foo'), 'bar');
    assert.strictEqual(cache.get('function   foo'), 'bar');
  });

  test('fuzzy matching: case-insensitive substring', () => {
    const cache = new CompletionCache(10);
    cache.set('HelloWorldFunction', 'result');
    const result = cache.lookup('helloworld');
    assert.ok(result);
  });

  test('fuzzy matching: subsequence matching', () => {
    const cache = new CompletionCache(10);
    cache.set('getUserById', 'function body');
    const result = cache.lookup('gUId');
    assert.ok(result);
  });

  test('lookup should return remaining text', () => {
    const cache = new CompletionCache(10);
    cache.set('def fib', 'onacci(n):\n  return n');
    const result = cache.lookup('def fib');
    assert.ok(result);
    assert.strictEqual(result!.remaining, 'onacci(n):\n  return n');
  });

  test('eviction: should drop oldest when over capacity', () => {
    const cache = new CompletionCache(3);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('d', '4');
    assert.strictEqual(cache.get('a'), undefined, 'a should be evicted');
    assert.strictEqual(cache.get('d'), '4', 'd should be present');
  });

  test('adaptive TTL: frequent access extends lifetime', async () => {
    const cache = new CompletionCache(100, 50);
    cache.set('hot', 'value');
    for (let i = 0; i < 5; i++) {
      cache.get('hot');
    }
    await new Promise((r) => setTimeout(r, 60));
    assert.strictEqual(cache.get('hot'), 'value', 'Hot entry should survive extended TTL');
  });

  test('clear should empty cache', () => {
    const cache = new CompletionCache(10);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    assert.strictEqual(cache.size, 0);
    assert.strictEqual(cache.get('a'), undefined);
  });

  test('eviction with smart scoring should keep frequently used', () => {
    const cache = new CompletionCache(3);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.get('a');
    cache.get('a');
    cache.get('b');
    cache.set('d', '4');
    assert.strictEqual(cache.get('c'), undefined, 'c should be evicted (least accessed)');
    assert.strictEqual(cache.get('a'), '1', 'a should survive (most accessed)');
    assert.strictEqual(cache.get('b'), '2', 'b should survive');
    assert.strictEqual(cache.get('d'), '4', 'd should survive');
  });

  test('capacity of 0 disables cache', () => {
    const cache = new CompletionCache(0);
    cache.set('a', '1');
    assert.strictEqual(cache.size, 0);
    assert.strictEqual(cache.get('a'), undefined);
  });
});
