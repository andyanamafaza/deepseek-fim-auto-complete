import * as vscode from 'vscode';
import { Config } from './config';
import { StatsTracker } from './statsTracker';

export class StatusBarManager {
  private item: vscode.StatusBarItem;

  constructor(
    private config: Config,
    private stats?: StatsTracker,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'deepseekFim.toggle';
    this.item.show();
    this.update();
  }

  async update(): Promise<void> {
    const hasKey = !!(await this.config.getApiKey());

    if (!this.config.enabled) {
      this.item.text = '$(circle-slash) DeepSeek';
      this.item.tooltip = 'DeepSeek Autocomplete: Disabled (click to enable)';
      this.item.backgroundColor = undefined;
      return;
    }

    if (!hasKey) {
      this.item.text = '$(alert) DeepSeek';
      this.item.tooltip = 'DeepSeek Autocomplete: No API key set';
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      return;
    }

    const mode = this.config.triggerMode === 'manual' ? ' (manual)' : '';
    const statsPart = this.stats ? ` ${this.stats.acceptanceRate}% acc` : '';
    this.item.text = `$(check) DeepSeek${statsPart}${mode}`;
    this.item.tooltip = this.stats
      ? `DeepSeek Autocomplete: Active\n${this.stats.summary}\n\nClick to toggle`
      : 'DeepSeek Autocomplete: Active (click to toggle)';
    this.item.backgroundColor = undefined;
  }

  setLoading(loading: boolean): void {
    if (loading) {
      this.item.text = '$(sync~spin) DeepSeek';
      this.item.tooltip = 'Generating completion...';
    } else {
      this.update();
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
