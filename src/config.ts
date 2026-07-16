import * as vscode from 'vscode';

const SECRET_API_KEY = 'deepseekFim.apiKey';

export class Config {
  private readonly section = 'deepseekFim';

  constructor(private secrets: vscode.SecretStorage) {}

  get<T>(key: string, defaultValue: T): T {
    return vscode.workspace.getConfiguration(this.section).get<T>(key, defaultValue);
  }

  update(key: string, value: unknown): Thenable<void> {
    return vscode.workspace.getConfiguration(this.section).update(key, value, vscode.ConfigurationTarget.Global);
  }

  async getApiKey(): Promise<string> {
    return (await this.secrets.get(SECRET_API_KEY)) || '';
  }

  async setApiKey(key: string): Promise<void> {
    if (key) {
      await this.secrets.store(SECRET_API_KEY, key);
    } else {
      await this.secrets.delete(SECRET_API_KEY);
    }
  }

  get model(): string {
    return this.get<string>('model', 'deepseek-v4-flash');
  }

  get enabled(): boolean {
    return this.get<boolean>('enabled', true);
  }

  get triggerMode(): string {
    return this.get<string>('triggerMode', 'automatic');
  }

  get baseUrl(): string {
    return this.get<string>('baseUrl', 'https://api.deepseek.com/beta');
  }

  get debounceMs(): number {
    return this.get<number>('debounceMs', 300);
  }

  get maxTokens(): number {
    return this.get<number>('maxTokens', 256);
  }

  get temperature(): number {
    return this.get<number>('temperature', 0.0);
  }

  get timeoutMs(): number {
    return this.get<number>('timeoutMs', 10000);
  }

  get maxPrefixLines(): number {
    return this.get<number>('maxPrefixLines', 100);
  }

  get maxSuffixLines(): number {
    return this.get<number>('maxSuffixLines', 50);
  }

  get maxPrefixChars(): number {
    return this.get<number>('maxPrefixChars', 6000);
  }

  get maxSuffixChars(): number {
    return this.get<number>('maxSuffixChars', 2000);
  }

  get cacheSize(): number {
    return this.get<number>('cacheSize', 500);
  }

  get multilineCompletions(): string {
    return this.get<string>('multilineCompletions', 'auto');
  }

  get streamingTimeout(): number {
    return this.get<number>('streamingTimeout', 500);
  }

  get stopSequences(): string[] {
    return this.get<string[]>('stopSequences', []);
  }
}
