import * as vscode from 'vscode';

interface CompletionStats {
  shown: number;
  accepted: number;
  totalTokensUsed: number;
  estimatedCost: number;
}

const STATS_KEY = 'deepseekFim.stats';

export class StatsTracker {
  private stats: CompletionStats;
  private onDidChangeTextDocument: vscode.Disposable | undefined;
  private lastShownText: string | undefined;

  constructor(private globalState: vscode.Memento) {
    this.stats = this.globalState.get<CompletionStats>(STATS_KEY) || {
      shown: 0,
      accepted: 0,
      totalTokensUsed: 0,
      estimatedCost: 0,
    };

    this.onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
      if (!this.lastShownText) return;
      if (event.contentChanges.length === 0) return;

      const change = event.contentChanges[0];
      if (change.text === this.lastShownText) {
        this.stats.accepted++;
        this.persist();
        this.lastShownText = undefined;
      }
    });
  }

  trackShown(text: string): void {
    this.stats.shown++;
    this.lastShownText = text;
    this.persist();
  }

  addTokensUsed(count: number): void {
    this.stats.totalTokensUsed += count;
    this.stats.estimatedCost += (count / 1_000_000) * 0.28;
    this.persist();
  }

  get acceptanceRate(): number {
    if (this.stats.shown === 0) return 0;
    return Math.round((this.stats.accepted / this.stats.shown) * 100);
  }

  get summary(): string {
    return [
      `Shown: ${this.stats.shown}`,
      `Accepted: ${this.stats.accepted}`,
      `Rate: ${this.acceptanceRate}%`,
      `Tokens: ${this.stats.totalTokensUsed}`,
      `Cost: $${this.stats.estimatedCost.toFixed(4)}`,
    ].join(' | ');
  }

  private persist(): void {
    this.globalState.update(STATS_KEY, this.stats);
  }

  dispose(): void {
    this.onDidChangeTextDocument?.dispose();
  }
}
