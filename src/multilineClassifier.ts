import * as vscode from 'vscode';

export class MultilineClassifier {
  classify(document: vscode.TextDocument, position: vscode.Position): boolean {
    const line = document.lineAt(position.line).text;
    const textBeforeCursor = line.slice(0, position.character).trimEnd();

    if (textBeforeCursor.length === 0) return false;
    return this.isMultilineTrigger(textBeforeCursor, line);
  }

  shouldSuggestMultiline(prefix: string): boolean {
    if (!prefix) return false;

    const lastLine = prefix.split('\n').pop() || '';
    const trimmed = lastLine.trimEnd();

    if (trimmed.length === 0) return false;
    return this.isMultilineTrigger(trimmed, lastLine);
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
