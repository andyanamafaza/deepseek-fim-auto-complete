import * as vscode from 'vscode';
import { LANGUAGE_MAP } from './utils';

interface RelatedFile {
  uri: vscode.Uri;
  relevance: number;
  snippets: string[];
}

export async function collectMultiFileContext(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<string[]> {
  const contexts: string[] = [];
  const currentLang = document.languageId;
  const currentFileName = document.fileName.split(/[/\\]/).pop() || '';
  const currentImports = extractImportKeywords(document, position);

  const related = await findRelatedOpenTabs(document, currentLang, currentFileName, currentImports);
  const workspaceFiles = await findRelatedWorkspaceFiles(document, currentLang, currentFileName, currentImports);

  const allRelated = [...related, ...workspaceFiles]
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);

  for (const file of allRelated) {
    const snippet = file.snippets.slice(0, 2).join('\n');
    if (snippet) {
      const fileName = file.uri.fsPath.split(/[/\\]/).pop() || '';
      const langComment = LANGUAGE_MAP[currentLang]?.comment || '//';
      contexts.push(`${langComment} Related in ${fileName}:\n${langComment} ${snippet.replace(/\n/g, '\n' + langComment + ' ')}`);
    }
  }

  return contexts;
}

async function findRelatedOpenTabs(
  document: vscode.TextDocument,
  currentLang: string,
  currentFileName: string,
  currentImports: string[]
): Promise<RelatedFile[]> {
  const related: RelatedFile[] = [];
  const currentDir = document.fileName.substring(0, Math.max(0, document.fileName.lastIndexOf('\\') !== -1 ? document.fileName.lastIndexOf('\\') : document.fileName.lastIndexOf('/')));
  const currentBase = currentFileName.replace(/\.[^.]+$/, '');

  for (const tab of vscode.window.tabGroups.all.flatMap((g) => g.tabs)) {
    const uri = (tab.input as { uri?: vscode.Uri })?.uri;
    if (!uri || uri.toString() === document.uri.toString()) continue;

    const tabFileName = uri.fsPath.split(/[/\\]/).pop() || '';
    const lastSep = Math.max(0, uri.fsPath.lastIndexOf('\\') !== -1 ? uri.fsPath.lastIndexOf('\\') : uri.fsPath.lastIndexOf('/'));
    const tabDir = uri.fsPath.substring(0, lastSep);
    const tabBase = tabFileName.replace(/\.[^.]+$/, '');
    let relevance = 0;

    const sameDir = tabDir === currentDir;
    if (sameDir) relevance += 3;

    if (tabBase === currentBase || currentBase.startsWith(tabBase) || tabBase.startsWith(currentBase)) {
      relevance += 4;
    }

    if (tabFileName.toLowerCase().includes('index') || tabFileName.toLowerCase().includes('main')) {
      relevance += 1;
    }

    if (relevance === 0) continue;

    try {
      const maxBytes = 20000;
      const raw = await vscode.workspace.fs.readFile(uri);
      const content = raw.length > maxBytes ? raw.slice(0, maxBytes).toString() : raw.toString();

      const snippets: string[] = [];
      const lines = content.split('\n');
      const importCount = lines.filter((l: string) =>
        /^\s*(import|from|const\s+\w+\s*=\s*require|use\s+|require\s+)/.test(l)
      ).length;

      if (importCount > 0) relevance += Math.min(importCount, 5);

      for (const imp of currentImports) {
        if (content.includes(imp)) {
          relevance += 3;
          const matchLine = lines.findIndex((l: string) => l.includes(imp));
          if (matchLine >= 0) {
            const snippet = lines.slice(Math.max(0, matchLine - 1), matchLine + 4).join('\n').trim();
            if (snippet) snippets.push(snippet.substring(0, 300));
          }
        }
      }

      if (snippets.length === 0 && content.length > 0) {
        const keyLines = lines
          .map((l: string, i: number) => ({ text: l, idx: i }))
          .filter((l: { text: string }) => /^\s*(export|function|class|def|fn|pub\s+fn|interface|trait|struct|enum)\s/.test(l.text))
          .slice(0, 3);
        for (const kl of keyLines) {
          const snippet = lines.slice(kl.idx, Math.min(kl.idx + 5, lines.length)).join('\n').trim();
          if (snippet) snippets.push(snippet.substring(0, 300));
        }
      }

      if (snippets.length > 0) {
        related.push({ uri, relevance, snippets });
      }
    } catch {
    }
  }

  return related;
}

async function findRelatedWorkspaceFiles(
  document: vscode.TextDocument,
  currentLang: string,
  currentFileName: string,
  currentImports: string[]
): Promise<RelatedFile[]> {
  const related: RelatedFile[] = [];
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) return related;

  const filePatterns: Record<string, string[]> = {
    typescript: ['**/*.ts', '**/*.tsx'],
    javascript: ['**/*.js', '**/*.jsx'],
    python: ['**/*.py'],
    go: ['**/*.go'],
    rust: ['**/*.rs'],
    java: ['**/*.java'],
  };

  const patterns = filePatterns[currentLang] || [`**/*.${currentLang}`];
  patterns.push(`**/${currentFileName}`);

  try {
    const files = await vscode.workspace.findFiles(
      `{${patterns.join(',')}}`,
      '**/node_modules/**',
      5
    );

    for (const uri of files) {
      if (uri.toString() === document.uri.toString()) continue;

      try {
        const maxBytes = 20000;
        const raw = await vscode.workspace.fs.readFile(uri);
        const content = raw.length > maxBytes ? raw.slice(0, maxBytes).toString() : raw.toString();
        const lines = content.split('\n');
        const snippets: string[] = [];
        let relevance = 0;

        for (const imp of currentImports) {
          if (content.includes(imp)) {
            relevance += 3;
            const matchLine = lines.findIndex((l: string) => l.includes(imp));
            if (matchLine >= 0) {
              const snippet = lines.slice(Math.max(0, matchLine - 1), matchLine + 4).join('\n').trim();
              if (snippet) snippets.push(snippet.substring(0, 300));
            }
          }
        }

        if (relevance > 0 || content.includes(currentFileName.replace(/\.[^.]+$/, ''))) {
          if (snippets.length === 0) {
            const keyLines = lines
              .map((l: string, i: number) => ({ text: l, idx: i }))
              .filter((l: { text: string }) => /^\s*(export|function|class|def|fn|pub\s+fn|interface|trait|struct|enum)\s/.test(l.text))
              .slice(0, 3);
            for (const kl of keyLines) {
              const snippet = lines.slice(kl.idx, Math.min(kl.idx + 5, lines.length)).join('\n').trim();
              if (snippet) snippets.push(snippet.substring(0, 300));
            }
          }

          if (snippets.length > 0) {
            related.push({ uri, relevance, snippets });
          }
        }
      } catch {
      }
    }
  } catch {
  }

  return related;
}

function extractImportKeywords(document: vscode.TextDocument, position: vscode.Position): string[] {
  const keywords: string[] = [];
  const maxLines = Math.min(position.line, 40);

  const importPatterns = [
    /^import\s+(\w+)/i,
    /^from\s+(\w+)/i,
    /^use\s+(\w+)/i,
    /^require\s+['"](\w+)/i,
    /^const\s+(\w+)\s*=\s*require/i,
  ];

  for (let line = 0; line < maxLines; line++) {
    const text = document.lineAt(line).text.trim();
    for (const pattern of importPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        keywords.push(match[1]);
      }
    }
  }

  return [...new Set(keywords)];
}
