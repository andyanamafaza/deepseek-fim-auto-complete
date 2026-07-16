import * as vscode from 'vscode';

export interface FimContext {
  prefix: string;
  suffix: string;
}

export class PromptBuilder {
  build(
    document: vscode.TextDocument,
    position: vscode.Position,
    maxPrefixLines: number,
    maxSuffixLines: number,
    maxPrefixChars?: number,
    maxSuffixChars?: number,
  ): FimContext {
    let prefix = this.getPrefix(document, position, maxPrefixLines);
    let suffix = this.getSuffix(document, position, maxSuffixLines);

    if (maxPrefixChars && maxPrefixChars > 0 && prefix.length > maxPrefixChars) {
      prefix = prefix.slice(-maxPrefixChars);
    }

    if (maxSuffixChars && maxSuffixChars > 0 && suffix.length > maxSuffixChars) {
      suffix = suffix.slice(0, maxSuffixChars);
    }

    return { prefix, suffix };
  }

  getRawPrefix(
    document: vscode.TextDocument,
    position: vscode.Position,
    maxPrefixLines: number,
    maxPrefixChars?: number,
  ): string {
    let prefix = this.getPrefix(document, position, maxPrefixLines);
    if (maxPrefixChars && maxPrefixChars > 0 && prefix.length > maxPrefixChars) {
      prefix = prefix.slice(-maxPrefixChars);
    }
    return prefix;
  }

  private getPrefix(document: vscode.TextDocument, position: vscode.Position, maxLines: number): string {
    const startLine = Math.max(0, position.line - maxLines);
    const prefixRange = new vscode.Range(startLine, 0, position.line, position.character);
    return document.getText(prefixRange);
  }

  private getSuffix(document: vscode.TextDocument, position: vscode.Position, maxLines: number): string {
    const lastLine = document.lineCount - 1;
    const endLine = Math.min(lastLine, position.line + maxLines);
    const endCharacter = document.lineAt(endLine).text.length;
    const suffixRange = new vscode.Range(position.line, position.character, endLine, endCharacter);
    return document.getText(suffixRange);
  }
}
