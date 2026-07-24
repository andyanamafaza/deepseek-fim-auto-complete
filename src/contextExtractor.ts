import * as vscode from 'vscode';
import { LANGUAGE_MAP } from './utils';

export interface EnclosingContext {
  functionSignature: string;
  classDeclaration: string;
  decorators: string[];
  returnTypeAnnotation: string;
  imports: string[];
}

const CLASS_KEYWORDS = ['class', 'struct', 'interface', 'trait', 'object', 'enum', 'impl'];
const FUNC_KEYWORDS = ['def', 'function', 'func', 'fn', 'fun', 'async def', 'async function'];

export async function extractContext(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<EnclosingContext> {
  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri
    );
    if (symbols && symbols.length > 0) {
      return extractFromSymbols(symbols, document, position);
    }
  } catch {
  }

  return extractFromRegex(document, position);
}

function extractFromSymbols(
  symbols: vscode.DocumentSymbol[],
  document: vscode.TextDocument,
  position: vscode.Position
): EnclosingContext {
  let functionSignature = '';
  let classDeclaration = '';
  const decorators: string[] = [];
  let returnTypeAnnotation = '';

  function findEnclosing(items: vscode.DocumentSymbol[]): boolean {
    for (const sym of items) {
      if (sym.range.contains(position)) {
        if (
          sym.kind === vscode.SymbolKind.Function ||
          sym.kind === vscode.SymbolKind.Method ||
          sym.kind === vscode.SymbolKind.Constructor
        ) {
          const sig = extractFullSignature(sym, document);
          if (sig && !functionSignature) functionSignature = sig;
          const rta = extractReturnType(sym, document);
          if (rta) returnTypeAnnotation = rta;
          const foundDecorators = extractDecorators(sym, document);
          if (foundDecorators.length > 0) decorators.unshift(...foundDecorators);
        }
        if (
          sym.kind === vscode.SymbolKind.Class ||
          sym.kind === vscode.SymbolKind.Struct ||
          sym.kind === vscode.SymbolKind.Interface ||
          sym.kind === vscode.SymbolKind.Namespace ||
          sym.kind === vscode.SymbolKind.Module
        ) {
          if (!classDeclaration) {
            const decl = extractClassDeclaration(sym, document);
            if (decl) classDeclaration = decl;
          }
        }
        if (sym.children && sym.children.length > 0) {
          if (findEnclosing(sym.children)) return true;
        }
        if (functionSignature && classDeclaration) return true;
      }
    }
    return false;
  }

  findEnclosing(symbols);

  const imports = extractImports(document, position.line);

  return { functionSignature, classDeclaration, decorators, returnTypeAnnotation, imports };
}

function extractFullSignature(sym: vscode.DocumentSymbol, document: vscode.TextDocument): string {
  const startLine = sym.range.start.line;
  const rangeEndLine = sym.range.end.line;
  let endLine = startLine;
  for (let line = startLine; line <= rangeEndLine && line < document.lineCount; line++) {
    const text = document.lineAt(line).text;
    if (text.includes(')') || text.includes('{') || text.includes(':')) {
      endLine = line;
      break;
    }
  }
  const lines: string[] = [];
  for (let line = startLine; line <= endLine && line < document.lineCount; line++) {
    lines.push(document.lineAt(line).text);
  }
  const sig = lines.join('\n').trim().substring(0, 200);
  return sig;
}

function extractReturnType(sym: vscode.DocumentSymbol, document: vscode.TextDocument): string {
  const startLine = sym.selectionRange.start.line;
  const endLine = sym.selectionRange.end.line;
  for (let line = startLine; line <= endLine && line < document.lineCount; line++) {
    const text = document.lineAt(line).text;
    const langId = document.languageId;
    if (langId === 'python') {
      const arrow = text.indexOf('->');
      if (arrow >= 0) {
        const after = text.slice(arrow + 2).trim();
        const colon = after.indexOf(':');
        return (colon >= 0 ? after.slice(0, colon) : after).trim();
      }
    } else if (langId === 'typescript' || langId === 'javascript' || langId.startsWith('typescript') || langId.startsWith('javascript')) {
      const colon = text.indexOf(':');
      if (colon >= 0) {
        const beforeParen = text.lastIndexOf(')', colon);
        if (beforeParen >= 0) {
          return text.slice(beforeParen + 1, colon > beforeParen ? colon : undefined).trim();
        }
      }
      const arrow = text.indexOf('=>');
      if (arrow >= 0) {
        const afterParen = text.indexOf(')', arrow);
        if (afterParen >= 0) {
          return text.slice(afterParen + 1).trim();
        }
      }
    } else if (langId === 'rust' || langId === 'go' || langId === 'kotlin') {
      const arrow = text.indexOf('->');
      if (arrow >= 0) {
        const after = text.slice(arrow + 2).trim();
        const brace = after.indexOf('{');
        return (brace >= 0 ? after.slice(0, brace) : after).trim();
      }
    }
  }
  return '';
}

function extractDecorators(sym: vscode.DocumentSymbol, document: vscode.TextDocument): string[] {
  const result: string[] = [];
  const startLine = sym.range.start.line;
  const langComment = LANGUAGE_MAP[document.languageId]?.comment || '//';

  for (let line = startLine - 1; line >= 0; line--) {
    const text = document.lineAt(line).text.trim();
    if (text.length === 0) break;
    if (text.startsWith(langComment)) break;
    if (text.startsWith('@')) {
      result.unshift(text.substring(0, 100));
    } else if (text.startsWith('#[') || text.startsWith('[')) {
      result.unshift(text.substring(0, 100));
    } else {
      break;
    }
  }

  return result;
}

function extractClassDeclaration(sym: vscode.DocumentSymbol, document: vscode.TextDocument): string {
  const startLine = sym.range.start.line;
  const rangeEndLine = sym.range.end.line;
  let endLine = startLine;
  for (let line = startLine; line <= rangeEndLine && line < document.lineCount; line++) {
    const text = document.lineAt(line).text;
    endLine = line;
    if (text.includes('{') || text.includes(':') || text.includes('implements') || text.includes('extends')) {
      break;
    }
  }
  const lines: string[] = [];
  for (let line = startLine; line <= endLine && line < document.lineCount; line++) {
    lines.push(document.lineAt(line).text);
  }
  return lines.join('\n').trim().substring(0, 150);
}

function extractFromRegex(document: vscode.TextDocument, position: vscode.Position): EnclosingContext {
  const langInfo = LANGUAGE_MAP[document.languageId];
  const comment = langInfo?.comment || '//';

  let functionSignature = '';
  let classDeclaration = '';
  const decorators: string[] = [];
  let returnTypeAnnotation = '';
  let braceDepth = 0;
  let parenDepth = 0;
  let inString = false;
  let stringChar = '';

  for (let line = position.line; line >= 0; line--) {
    const text = document.lineAt(line).text;
    const trimmed = text.trim();

    if (trimmed.length === 0) continue;
    if (trimmed.startsWith(comment)) continue;

    const braceBeforeLine = braceDepth;
    const parenBeforeLine = parenDepth;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === stringChar && (i === 0 || text[i - 1] !== '\\')) {
          inString = false;
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (text.startsWith(comment, i)) break;
      if (ch === '{') braceDepth++;
      if (ch === '}' && (i === 0 || text[i - 1] !== '$')) braceDepth--;
      if (ch === '(') parenDepth++;
      if (ch === ')') parenDepth--;
    }

    if (braceDepth < 0) braceDepth = 0;
    if (parenDepth < 0) parenDepth = 0;

    if (trimmed.startsWith('@') || trimmed.startsWith('#[')) {
      if (!functionSignature && !classDeclaration) {
        decorators.unshift(trimmed.substring(0, 100));
      }
      continue;
    }

    if (!classDeclaration) {
      for (const kw of CLASS_KEYWORDS) {
        const regex = new RegExp(`\\b${kw}\\s+\\w+`);
        if (regex.test(trimmed) && parenBeforeLine === 0 && braceBeforeLine === 0) {
          classDeclaration = trimmed.substring(0, 120);
          break;
        }
      }
    }

    if (!functionSignature) {
      for (const kw of FUNC_KEYWORDS) {
        const escaped = kw.replace(/\s+/g, '\\s+');
        const regex = new RegExp(`\\b${escaped}\\s+\\w+\\(`);
        if (regex.test(trimmed) && parenBeforeLine === 0 && braceBeforeLine === 0) {
          functionSignature = trimmed.substring(0, 120);
          break;
        }
      }
    }

    if (functionSignature && extractReturnTypeFromLine(functionSignature, document.languageId)) {
      returnTypeAnnotation = extractReturnTypeFromLine(functionSignature, document.languageId);
    }

    if (braceDepth === 0 && parenDepth === 0) {
      if (classDeclaration && functionSignature) break;
    }
  }

  const imports = extractImports(document, position.line);

  return { functionSignature, classDeclaration, decorators, returnTypeAnnotation, imports };
}

function extractReturnTypeFromLine(line: string, langId: string): string {
  if (langId === 'typescript' || langId === 'javascript' || langId.startsWith('typescript') || langId.startsWith('javascript')) {
    const paren = line.lastIndexOf(')');
    if (paren >= 0) {
      const after = line.slice(paren + 1).trim();
      const brace = after.indexOf('{');
      return (brace >= 0 ? after.slice(0, brace) : after).trim();
    }
  }
  if (langId === 'python') {
    const arrow = line.indexOf('->');
    if (arrow >= 0) {
      const after = line.slice(arrow + 2).trim();
      const colon = after.indexOf(':');
      return (colon >= 0 ? after.slice(0, colon) : after).trim();
    }
  }
  if (langId === 'rust' || langId === 'go' || langId === 'kotlin') {
    const arrow = line.indexOf('->');
    if (arrow >= 0) {
      const after = line.slice(arrow + 2).trim();
      const brace = after.indexOf('{');
      return (brace >= 0 ? after.slice(0, brace) : after).trim();
    }
  }
  return '';
}

function extractImports(document: vscode.TextDocument, upToLine: number): string[] {
  const imports: string[] = [];
  const maxLines = Math.min(upToLine, 60);

  const importPatterns = [
    /^import\s+/i,
    /^from\s+/i,
    /^#include/,
    /^using\s+/i,
    /^use\s+/i,
    /^require\s+/i,
    /^extern\s+crate/i,
    /^package\s+/i,
    /^namespace\s+/i,
    /^const\s+\w+\s*=\s*(require|import)/,
    /^let\s+\w+\s*=\s*(require|import)/,
  ];

  let inMultilineImport = false;
  let multilineAccum = '';

  for (let line = 0; line < maxLines; line++) {
    const text = document.lineAt(line).text.trimEnd();
    if (text.length === 0) {
      if (inMultilineImport) {
        imports.push(multilineAccum.substring(0, 120));
        inMultilineImport = false;
        multilineAccum = '';
      }
      continue;
    }

    if (importPatterns.some((p) => p.test(text))) {
      if (text.endsWith(';') || text.endsWith(')') || (!text.includes('(') && !text.includes('{'))) {
        imports.push(text.substring(0, 120));
      } else {
        inMultilineImport = true;
        multilineAccum = text;
      }
    } else if (inMultilineImport) {
      multilineAccum += ' ' + text.trim();
      if (text.endsWith(';') || text.endsWith(')') || text.includes('}') || text.endsWith(',')) {
        imports.push(multilineAccum.substring(0, 120));
        inMultilineImport = false;
        multilineAccum = '';
      }
    }
  }

  if (inMultilineImport && multilineAccum) {
    imports.push(multilineAccum.substring(0, 120));
  }

  return imports;
}
