import * as vscode from 'vscode';

export class DebugChannel {
  private channel: vscode.OutputChannel;

  constructor(name: string) {
    this.channel = vscode.window.createOutputChannel(name);
  }

  get enabled(): boolean {
    return vscode.workspace.getConfiguration('deepseekFim').get<boolean>('debug', true);
  }

  log(message: string): void {
    if (!this.enabled) return;
    const timestamp = new Date().toISOString().slice(11, 23);
    this.channel.appendLine(`[${timestamp}] ${message}`);
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
