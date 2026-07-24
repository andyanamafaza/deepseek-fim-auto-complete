import * as vscode from 'vscode';

const SENSITIVE_PATTERNS = [
  /\.env$/i,
  /\.env\./i,
  /secret/i,
  /credential/i,
  /password/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /\.gitconfig/i,
  /\.netrc/i,
  /\.aws[\\/]/i,
  /[\\/]\.?config\.json$/i,
];

export class SensitiveFileFilter {
  shouldSkip(document: vscode.TextDocument): boolean {
    const filePath = document.uri.fsPath;
    // Normalize backslashes to forward slashes for cross-platform pattern matching
    const normalizedPath = filePath.replace(/\\/g, '/');

    if (SENSITIVE_PATTERNS.some((p) => p.test(normalizedPath))) {
      return true;
    }

    const disablePatterns = vscode.workspace.getConfiguration('deepseekFim')
      .get<string[]>('disableInFiles', []);

    if (disablePatterns.length > 0) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (workspaceFolder) {
        const normalizedWorkspace = workspaceFolder.uri.fsPath.replace(/\\/g, '/');
        const relativePath = normalizedPath.replace(normalizedWorkspace, '').replace(/^[/\\]/, '').replace(/\\/g, '/');
        for (const pattern of disablePatterns) {
          if (this.matchGlob(relativePath, pattern)) return true;
        }
      }
    }

    return false;
  }

  private matchGlob(filePath: string, pattern: string): boolean {
    const regexStr = pattern
      .replace(/[/\\]/g, '[\\\\/]')
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/\\\\]*')
      .replace(/\?/g, '.');

    return new RegExp(`^${regexStr}$`, 'i').test(filePath);
  }
}
