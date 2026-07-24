import * as vscode from 'vscode';

const COST_PER_MTOKEN: Record<string, number> = {
  'deepseek-v4-flash': 0.28,
  'deepseek-v4-pro': 0.87,
  'deepseek-chat': 0.28,
  'deepseek-reasoner': 0.28,
};

interface CompletionStats {
  shown: number;
  accepted: number;
  totalTokensUsed: number;
  estimatedCost: number;
}

const STATS_KEY = 'deepseekFim.stats';
const DEFAULT_STATS: CompletionStats = {
  shown: 0,
  accepted: 0,
  totalTokensUsed: 0,
  estimatedCost: 0,
};

function isValidStats(value: unknown): value is CompletionStats {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.shown === 'number' &&
    typeof obj.accepted === 'number' &&
    typeof obj.totalTokensUsed === 'number' &&
    typeof obj.estimatedCost === 'number' &&
    !isNaN(obj.shown) &&
    !isNaN(obj.accepted) &&
    !isNaN(obj.totalTokensUsed) &&
    !isNaN(obj.estimatedCost)
  );
}

export class StatsTracker {
  private stats: CompletionStats;
  private onDidChangeTextDocument: vscode.Disposable | undefined;
  private lastShownTexts: Set<string> = new Set();
  private readonly MAX_SHOWN_TEXTS = 100;
  private suggestionShown = false;

  constructor(
    private globalState: vscode.Memento,
    private getModel?: () => string,
    private onLowAcceptance?: (rate: number) => void,
    public onAcceptance?: (acceptedText: string) => void,
  ) {
    const stored = this.globalState.get<unknown>(STATS_KEY);
    this.stats = isValidStats(stored) ? stored : { ...DEFAULT_STATS };

    this.onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
      if (this.lastShownTexts.size === 0) return;
      if (event.contentChanges.length === 0) return;

      const change = event.contentChanges[0];
      if (this.lastShownTexts.has(change.text)) {
        this.stats.accepted++;
        this.persist();
        const accepted = change.text;
        this.lastShownTexts.clear();
        this.checkAcceptanceRate();
        this.onAcceptance?.(accepted);
      }
    });
  }

  private checkAcceptanceRate(): void {
    if (this.suggestionShown) return;
    if (this.stats.shown < 30) return;
    if (this.acceptanceRate > 25) return;
    this.suggestionShown = true;

    const model = this.getModel?.() || 'deepseek-v4-flash';
    if (model === 'deepseek-v4-flash') {
      this.onLowAcceptance?.(this.acceptanceRate);
    }
  }

  trackShown(text: string, exactTokens?: number): void {
    this.stats.shown++;

    const tokens = exactTokens ?? Math.ceil(text.length / 4);
    this.stats.totalTokensUsed += tokens;

    const model = this.getModel?.() || 'deepseek-v4-flash';
    const rate = COST_PER_MTOKEN[model] || 0.28;
    this.stats.estimatedCost += (tokens / 1_000_000) * rate;

    this.lastShownTexts.add(text);
    while (this.lastShownTexts.size > this.MAX_SHOWN_TEXTS) {
      const firstKey = this.lastShownTexts.values().next().value;
      if (firstKey) this.lastShownTexts.delete(firstKey);
    }
    this.persist();
  }

  addTokensUsed(count: number): void {
    this.stats.totalTokensUsed += count;
    const model = this.getModel?.() || 'deepseek-v4-flash';
    const rate = COST_PER_MTOKEN[model] || 0.28;
    this.stats.estimatedCost += (count / 1_000_000) * rate;
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
      `Cost: $${this.stats.estimatedCost.toFixed(5)}`,
    ].join(' | ');
  }

  private persist(): void {
    this.globalState.update(STATS_KEY, this.stats);
  }

  dispose(): void {
    this.onDidChangeTextDocument?.dispose();
    this.lastShownTexts.clear();
  }
}
