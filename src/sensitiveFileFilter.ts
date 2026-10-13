import * as vscode from 'vscode';

/**
 * Matched against the file *name* only (not the full path), so files like
 * `passwordValidator.ts` or `secrets-manager.ts` are no longer skipped.
 */
const SENSITIVE_BASENAME_PATTERNS: RegExp[] = [
  /^\.env(\..+)?$/i,                 // .env, .env.local, .env.production
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /^\.git-credentials$/i,
  /^\.gitconfig$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /\.(pem|key|pfx|p12|keystore|jks)$/i,
  /^credentials\.json$/i,
  /^service-account.*\.json$/i,
  /^secrets?\.(json|ya?ml|toml|ini|env)$/i,
];

/**
 * Matched against the normalized full path for well-known secret directories.
 */
const SENSITIVE_PATH_SEGMENTS: RegExp[] = [
  /\/\.aws\//i,
  /\/\.ssh\//i,
  /\/\.gnupg\//i,
];

export class SensitiveFileFilter {
  shouldSkip(document: vscode.TextDocument): boolean {
    const filePath = document.uri.fsPath;
    // Normalize backslashes to forward slashes for cross-platform pattern matching
    const normalizedPath = filePath.replace(/\\/g, '/');
    const basename = normalizedPath.split('/').pop() || '';

    if (SENSITIVE_BASENAME_PATTERNS.some((p) => p.test(basename))) {
      return true;
    }

    if (SENSITIVE_PATH_SEGMENTS.some((p) => p.test(normalizedPath))) {
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
