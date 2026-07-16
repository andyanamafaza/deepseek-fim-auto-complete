import * as vscode from 'vscode';

export class DebugChannel {
  private channel: vscode.OutputChannel;
  private enabled: boolean;

  constructor(name: string, enabled: boolean) {
    this.channel = vscode.window.createOutputChannel(name);
    this.enabled = enabled;
  }

  log(message: string): void {
    if (!this.enabled) return;
    const timestamp = new Date().toISOString().slice(11, 23);
    this.channel.appendLine(`[${timestamp}] ${message}`);
  }

  error(message: string, err?: unknown): void {
    this.log(`ERROR: ${message}${err ? ` — ${err instanceof Error ? err.message : String(err)}` : ''}`);
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
