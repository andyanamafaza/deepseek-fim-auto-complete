interface CacheEntry {
  value: string;
  timestamp: number;
}

export class CompletionCache {
  private cache: Map<string, CacheEntry>;
  private capacity: number;

  constructor(capacity: number = 500) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(prefix: string): string | undefined {
    const entry = this.cache.get(prefix);
    if (!entry) return undefined;

    this.cache.delete(prefix);
    this.cache.set(prefix, entry);
    return entry.value;
  }

  lookup(input: string): { completion: string; remaining: string } | undefined {
    let bestMatch: string | undefined;
    let bestLength = 0;

    for (const key of this.cache.keys()) {
      if (input.startsWith(key) && key.length > bestLength) {
        bestMatch = key;
        bestLength = key.length;
      }
    }

    if (!bestMatch) return undefined;

    const entry = this.cache.get(bestMatch)!;
    this.cache.delete(bestMatch);
    this.cache.set(bestMatch, entry);

    if (entry.value.startsWith(input.slice(bestLength))) {
      return {
        completion: entry.value,
        remaining: entry.value.slice(input.length - bestLength),
      };
    }

    return undefined;
  }

  set(prefix: string, value: string): void {
    if (this.capacity <= 0) return;

    if (this.cache.has(prefix)) {
      this.cache.delete(prefix);
    } else if (this.cache.size >= this.capacity) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(prefix, { value, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
