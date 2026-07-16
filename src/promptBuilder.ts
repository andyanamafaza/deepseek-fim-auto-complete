import * as vscode from 'vscode';

const CHARS_PER_TOKEN = 4;

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
    maxPrefixTokens?: number,
    maxSuffixTokens?: number,
  ): FimContext {
    let prefix = this.getPrefix(document, position, maxPrefixLines);
    let suffix = this.getSuffix(document, position, maxSuffixLines);

    if (maxPrefixTokens && maxPrefixTokens > 0) {
      prefix = this.pruneByTokenBudget(prefix, maxPrefixTokens, true);
    }

    if (maxSuffixTokens && maxSuffixTokens > 0) {
      suffix = this.pruneByTokenBudget(suffix, maxSuffixTokens, false);
    }

    return { prefix, suffix };
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

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  private pruneByTokenBudget(text: string, budget: number, fromStart: boolean): string {
    if (this.estimateTokens(text) <= budget) return text;

    const lines = text.split('\n');

    if (fromStart) {
      const result: string[] = [];
      let tokenCount = 0;

      for (let i = lines.length - 1; i >= 0; i--) {
        const lineTokens = this.estimateTokens(lines[i]);
        if (tokenCount + lineTokens > budget) break;
        result.unshift(lines[i]);
        tokenCount += lineTokens;
      }

      return result.join('\n');
    } else {
      const result: string[] = [];
      let tokenCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const lineTokens = this.estimateTokens(lines[i]);
        if (tokenCount + lineTokens > budget) break;
        result.push(lines[i]);
        tokenCount += lineTokens;
      }

      return result.join('\n');
    }
  }
}
