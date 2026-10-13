import * as vscode from 'vscode';
import { Config } from './config';
import { StatsTracker } from './statsTracker';

export class StatusBarManager {
  private item: vscode.StatusBarItem;
  private suggestionActive = false;
  private pendingRestore = false;
  private notice: string | undefined;

  constructor(
    private config: Config,
    private stats?: StatsTracker,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'deepseekFim.statusBarMenu';
    this.item.show();
    this.update();
  }

  async update(): Promise<void> {
    if (this.suggestionActive) return;

    const hasKey = !!(await this.config.getApiKey());

    if (!this.config.enabled) {
      this.item.command = 'deepseekFim.toggle';
      this.item.text = '$(circle-slash) DeepSeek';
      this.item.tooltip = this.withNotice('DeepSeek Autocomplete: Disabled (click to enable)');
      this.item.backgroundColor = undefined;
      return;
    }

    if (!hasKey) {
      this.item.command = 'deepseekFim.setApiKey';
      this.item.text = '$(alert) DeepSeek: Set API key';
      this.item.tooltip = this.withNotice('DeepSeek Autocomplete: No API key set — click to add one');
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      return;
    }

    this.item.command = 'deepseekFim.statusBarMenu';
    const mode = this.config.triggerMode === 'manual' ? ' (manual)' : '';
    const statsPart = this.stats ? ` ${this.stats.acceptanceRate}% acc` : '';
    this.item.text = `$(check) DeepSeek${statsPart}${mode}`;
    this.item.tooltip = this.withNotice(this.stats
      ? `DeepSeek Autocomplete: Active\n${this.stats.summary}\n\nClick for options`
      : 'DeepSeek Autocomplete: Active (click for options)');
    this.item.backgroundColor = undefined;
  }

  /** Explain why no completion is shown (skipped file, disabled, etc.). */
  setNotice(notice: string | undefined): void {
    this.notice = notice;
    if (!this.suggestionActive) this.update();
  }

  private withNotice(base: string): string {
    return this.notice ? `${base}\n\n${this.notice}` : base;
  }

  setSuggestionInfo(tokenCount: number, alternatives: number, multiline = false): void {
    this.suggestionActive = true;
    this.item.text = `$(sparkle) DeepSeek ${tokenCount}t${multiline ? ' ·ml' : ''}`;
    this.item.tooltip = `DeepSeek Suggestion: ${tokenCount} tokens | ${alternatives} alternatives${multiline ? ' | multi-line' : ''} | Tab to accept, Esc to dismiss`;
    this.item.backgroundColor = undefined;

    if (this.pendingRestore) {
      this.pendingRestore = false;
    }
  }

  clearSuggestion(): void {
    this.suggestionActive = false;
    this.pendingRestore = true;
    setTimeout(() => {
      if (!this.suggestionActive) {
        this.update();
      }
      this.pendingRestore = false;
    }, 100);
  }

  setLoading(loading: boolean, multiline = false): void {
    if (loading) {
      this.suggestionActive = false;
      this.item.text = `$(sync~spin) DeepSeek${multiline ? ' ·multi-line' : ''}`;
      this.item.tooltip = multiline ? 'Generating multi-line completion...' : 'Generating completion...';
    } else {
      this.update();
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
