import * as vscode from 'vscode';

export class MultilineClassifier {
  classify(document: vscode.TextDocument, position: vscode.Position): boolean {
    const line = document.lineAt(position.line).text;
    const textBeforeCursor = line.slice(0, position.character).trimEnd();

    if (textBeforeCursor.length > 0 && this.isMultilineTrigger(textBeforeCursor, line)) return true;

    if (position.line > 0 && textBeforeCursor.length === 0) {
      const prevLine = document.lineAt(position.line - 1).text;
      const prevTrimmed = prevLine.trimEnd();
      if (prevTrimmed.length > 0 && this.isMultilineTrigger(prevTrimmed, prevLine)) return true;
    }

    return false;
  }

  shouldSuggestMultiline(prefix: string): boolean {
    if (!prefix) return false;

    const lines = prefix.split('\n');
    const lastLine = lines[lines.length - 1] || '';
    const trimmed = lastLine.trimEnd();

    if (trimmed.length > 0 && this.isMultilineTrigger(trimmed, lastLine)) return true;

    if (lines.length >= 2 && trimmed.trim().length === 0) {
      const prevLine = lines[lines.length - 2] || '';
      const prevTrimmed = prevLine.trimEnd();
      if (prevTrimmed.length > 0 && this.isMultilineTrigger(prevTrimmed, prevLine)) return true;
    }

    if (lines.length >= 2) {
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.length === 0) continue;
        if (this.lineIsCodeStart(line)) return true;
        break;
      }
    }

    return false;
  }

  private lineIsCodeStart(line: string): boolean {
    return /\b(class|def|async\s+def|function|async\s+function|if|elif|else|for|while|with|try|except|finally|switch|case)\b/.test(line);
  }

  private isMultilineTrigger(textBeforeCursor: string, fullLine: string): boolean {
    const triggerPatterns = [
      /[[({]\s*$/,
      /:\s*$/,
      /->\s*$/,
      /=>\s*$/,
      /,\s*$/,
    ];

    if (triggerPatterns.some((p) => p.test(textBeforeCursor))) return true;

    const keywordTriggers = [
      /\b(if|elif|else|for|while|with|try|except|finally)\s*.*:\s*$/,
      /\b(class|def|async\s+def|function|async\s+function)\s/,
      /\b(switch|case|catch|finally|do)\s/,
      /\b(public|private|protected|static|async)\s/,
    ];

    if (keywordTriggers.some((p) => p.test(fullLine))) return true;

    return false;
  }
}
