import assert from 'assert';
import { extractKeywords, cosineSimilarity, computeIDF } from '../../semanticContext';

suite('SemanticContext', () => {
  test('extractKeywords should return meaningful identifiers', () => {
    const code = 'function getUser(id: string): Promise<User> { return db.find(id) }';
    const keywords = extractKeywords(code);
    assert.ok(keywords.has('getuser'), 'should contain getUser');
    assert.ok(keywords.has('promise'), 'should contain Promise');
    assert.ok(keywords.has('find'), 'should contain find');
    assert.ok(!keywords.has('function'), 'should skip stop words');
    assert.ok(!keywords.has('the'), 'should skip common words');
    assert.ok(!keywords.has('return'), 'should skip stop words');
  });

  test('extractKeywords should handle empty input', () => {
    const keywords = extractKeywords('');
    assert.strictEqual(keywords.size, 0);
  });

  test('extractKeywords should skip short tokens (< 3 chars)', () => {
    const keywords = extractKeywords('const x = y + z');
    assert.ok(!keywords.has('x'), 'single char should be skipped');
    assert.ok(!keywords.has('y'), 'single char should be skipped');
    assert.ok(!keywords.has('z'), 'single char should be skipped');
  });

  test('computeIDF should give higher weight to rare terms', () => {
    const blocks = [
      { startLine: 0, endLine: 5, text: 'function foo() {}', keywords: new Set(['foo', 'bar']) },
      { startLine: 6, endLine: 10, text: 'function baz() {}', keywords: new Set(['baz', 'bar']) },
    ];
    const queryKeywords = new Set(['foo', 'baz']);
    const idf = computeIDF(blocks, queryKeywords);
    assert.ok(idf.get('foo')! > idf.get('baz')!, 'foo appears less -> higher IDF');
  });

  test('cosineSimilarity: identical keyword sets should score 1', () => {
    const idf = new Map([['foo', 1.5], ['bar', 1.2]]);
    const query = new Set(['foo', 'bar']);
    const doc = new Set(['foo', 'bar']);
    const score = cosineSimilarity(query, doc, idf);
    assert.ok(Math.abs(score - 1) < 0.001, 'identical sets should score ~1');
  });

  test('cosineSimilarity: disjoint sets should score 0', () => {
    const idf = new Map([['foo', 1.5], ['bar', 1.2]]);
    const query = new Set(['foo', 'bar']);
    const doc = new Set(['baz', 'qux']);
    const score = cosineSimilarity(query, doc, idf);
    assert.strictEqual(score, 0, 'disjoint sets should score 0');
  });

  test('cosineSimilarity: partial overlap should score between 0 and 1', () => {
    const idf = new Map([['foo', 1.5]]);
    const query = new Set(['foo', 'bar']);
    const doc = new Set(['foo', 'baz']);
    const score = cosineSimilarity(query, doc, idf);
    assert.ok(score > 0 && score < 1, 'partial overlap should give intermediate score');
  });
});
