import * as vscode from 'vscode';

export interface CodeBlock {
  startLine: number;
  endLine: number;
  text: string;
  keywords: Set<string>;
}

const SIMILARITY_THRESHOLD = 0.15;
const MAX_BLOCKS = 2;

const codeBlockCache = new Map<string, { blocks: CodeBlock[]; version: number }>();

function getCachedBlocks(document: vscode.TextDocument): CodeBlock[] {
  const key = document.uri.toString();
  const cached = codeBlockCache.get(key);
  if (cached && cached.version === document.version) {
    return cached.blocks;
  }
  const blocks = extractCodeBlocks(document);
  codeBlockCache.set(key, { blocks, version: document.version });
  return blocks;
}

export function findSimilarCode(
  document: vscode.TextDocument,
  prefix: string
): string[] {
  const fileBlocks = getCachedBlocks(document);
  if (fileBlocks.length === 0) return [];

  const queryKeywords = extractKeywords(prefix);
  if (queryKeywords.size < 2) return [];

  const idf = computeIDF(fileBlocks, queryKeywords);

  const scored = fileBlocks.map((block) => ({
    block,
    score: cosineSimilarity(queryKeywords, block.keywords, idf),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored
    .filter((s) => s.score > SIMILARITY_THRESHOLD)
    .slice(0, MAX_BLOCKS)
    .map((s) => s.block.text.substring(0, 500));
}

function extractCodeBlocks(document: vscode.TextDocument): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const lineCount = document.lineCount;

  const blockStarts = [
    /^\s*(function|class|def|fn|pub\s+fn|interface|trait|struct|enum|impl|async\s+function|async\s+def)\b/,
    /^\s*(public|private|protected|static|export)\s+(function|class|def|fn|interface|trait|struct|enum|async)/,
    /^\s*(it|describe|test|it\.should)\b/,
  ];

  let i = 0;
  while (i < lineCount) {
    const line = document.lineAt(i).text;
    if (blockStarts.some((p) => p.test(line))) {
      const startLine = i;
      let braceCount = 0;
      let foundOpen = false;
      let j = i;

      while (j < lineCount) {
        const text = document.lineAt(j).text;
        for (const ch of text) {
          if (ch === '{') { braceCount++; foundOpen = true; }
          if (ch === '}') braceCount--;
        }
        if (foundOpen && braceCount === 0) {
          break;
        }
        j++;
      }

      const endLine = Math.min(j, lineCount - 1);
      const textLines: string[] = [];
      for (let k = startLine; k <= endLine; k++) {
        textLines.push(document.lineAt(k).text);
      }
      const text = textLines.join('\n');
      if (text.trim().length > 20) {
        blocks.push({
          startLine,
          endLine,
          text,
          keywords: extractKeywords(text),
        });
      }
      i = endLine + 1;
    } else {
      i++;
    }
  }

  return blocks;
}

export function extractKeywords(text: string): Set<string> {
  const keywords = new Set<string>();

  const tokens = text.split(/[^a-zA-Z_$][^a-zA-Z0-9_$]*[a-zA-Z_$]|[^a-zA-Z_$]+/);

  const skipWords = new Set([
    'the', 'this', 'that', 'and', 'or', 'for', 'with', 'from',
    'function', 'class', 'def', 'fn', 'var', 'let', 'const',
    'return', 'if', 'else', 'while', 'for', 'import', 'export',
    'public', 'private', 'protected', 'static', 'async', 'await',
    'try', 'catch', 'throw', 'new', 'typeof', 'instanceof',
    'true', 'false', 'null', 'undefined', 'void', 'null',
  ]);

  for (const token of tokens) {
    const trimmed = token.trim();
    if (trimmed.length < 3 || trimmed.length > 30) continue;
    if (/^\d/.test(trimmed)) continue;
    if (skipWords.has(trimmed.toLowerCase())) continue;
    if (/^[A-Z_]+$/.test(trimmed)) continue;

    keywords.add(trimmed.toLowerCase());
  }

  return keywords;
}

export function computeIDF(
  blocks: CodeBlock[],
  queryKeywords: Set<string>
): Map<string, number> {
  const docCount = blocks.length || 1;
  const df = new Map<string, number>();

  for (const kw of queryKeywords) {
    let count = 0;
    for (const block of blocks) {
      if (block.keywords.has(kw)) count++;
    }
    df.set(kw, count);
  }

  const idf = new Map<string, number>();
  for (const [kw, freq] of df) {
    idf.set(kw, Math.log((docCount + 1) / (freq + 1)) + 1);
  }

  return idf;
}

export function cosineSimilarity(
  query: Set<string>,
  doc: Set<string>,
  idf: Map<string, number>
): number {
  let dotProduct = 0;
  let queryMagnitude = 0;
  let docMagnitude = 0;

  const allKeys = new Set([...query, ...doc]);

  for (const kw of allKeys) {
    const w = idf.get(kw) || 1;
    const inQuery = query.has(kw) ? 1 : 0;
    const inDoc = doc.has(kw) ? 1 : 0;

    dotProduct += inQuery * inDoc * w * w;
    queryMagnitude += inQuery * w * w;
    docMagnitude += inDoc * w * w;
  }

  if (queryMagnitude === 0 || docMagnitude === 0) return 0;
  return dotProduct / (Math.sqrt(queryMagnitude) * Math.sqrt(docMagnitude));
}

export function clearCache(): void {
  codeBlockCache.clear();
}
