import * as vscode from 'vscode';

const SENSITIVE_PATTERNS = [
  /\.env/i,
  /\.env\./i,
  /secret/i,
  /credential/i,
  /password/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /\.gitconfig/i,
  /\.netrc/i,
  /\.aws\//i,
  /config\.json$/i,
];

export class SensitiveFileFilter {
  shouldSkip(document: vscode.TextDocument): boolean {
    const filePath = document.uri.fsPath;

    if (SENSITIVE_PATTERNS.some((p) => p.test(filePath))) {
      return true;
    }

    const disablePatterns = vscode.workspace.getConfiguration('deepseekFim')
      .get<string[]>('disableInFiles', []);

    if (disablePatterns.length > 0) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (workspaceFolder) {
        const relativePath = document.uri.fsPath.replace(workspaceFolder.uri.fsPath, '').replace(/^[/\\]/, '');
        for (const pattern of disablePatterns) {
          if (this.matchGlob(relativePath, pattern)) return true;
        }
      }
    }

    return false;
  }

  private matchGlob(filePath: string, pattern: string): boolean {
    const regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');

    return new RegExp(`^${regexStr}$`, 'i').test(filePath);
  }
}
