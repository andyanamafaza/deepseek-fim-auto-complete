import * as vscode from 'vscode';
import { safeLog } from './safeConsole';


export class AcceptanceTracker {
  private onDidChangeTextDocument: vscode.Disposable | undefined;
  private lastCompletion: { text: string; session: string; timestamp: number } | undefined;

  constructor() {
    this.onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
      if (!this.lastCompletion) return;
      if (event.contentChanges.length === 0) return;

      const change = event.contentChanges[0];
      if (change.text === this.lastCompletion.text) {
        const elapsed = Date.now() - this.lastCompletion.timestamp;
        safeLog(`[DeepSeek Autocomplete] Accepted completion (${elapsed}ms delay): "${this.lastCompletion.text.slice(0, 50)}..."`);
        this.lastCompletion = undefined;
      }
    });
  }

  trackShown(text: string): void {
    this.lastCompletion = { text, session: Math.random().toString(36).slice(2), timestamp: Date.now() };
  }

  dispose(): void {
    this.onDidChangeTextDocument?.dispose();
  }
}
