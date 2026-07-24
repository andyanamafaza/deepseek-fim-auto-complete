const DEFAULT_TTL_MS = 30_000;
const MAX_TTL_MS = 120_000;
const TTL_BOOST_PER_ACCESS = 5000;

interface CacheEntry {
  value: string;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
}

export class CompletionCache {
  private cache: Map<string, CacheEntry>;
  private capacity: number;
  private ttlMs: number;

  constructor(capacity: number = 500, ttlMs: number = DEFAULT_TTL_MS) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  private normalizeKey(key: string): string {
    return key.replace(/\s+/g, ' ').trim();
  }

  private isValid(entry: CacheEntry): boolean {
    const effectiveTtl = Math.min(
      this.ttlMs + entry.accessCount * TTL_BOOST_PER_ACCESS,
      MAX_TTL_MS
    );
    return Date.now() - entry.timestamp < effectiveTtl;
  }

  private touch(entry: CacheEntry): void {
    entry.accessCount++;
    entry.lastAccess = Date.now();
  }

  get(prefix: string): string | undefined {
    const nk = this.normalizeKey(prefix);
    const entry = this.cache.get(nk);
    if (!entry) return undefined;
    if (!this.isValid(entry)) {
      this.cache.delete(nk);
      return undefined;
    }
    this.touch(entry);
    this.cache.delete(nk);
    this.cache.set(nk, entry);
    return entry.value;
  }

  lookup(input: string): { completion: string; remaining: string } | undefined {
    const ni = this.normalizeKey(input);

    const exactEntry = this.cache.get(ni);
    if (exactEntry) {
      if (!this.isValid(exactEntry)) {
        this.cache.delete(ni);
      } else {
        this.touch(exactEntry);
        this.cache.delete(ni);
        this.cache.set(ni, exactEntry);
        return { completion: exactEntry.value, remaining: '' };
      }
    }

    let bestMatch: string | undefined;
    let bestLength = 0;

    for (const [nk, entry] of this.cache) {
      if (!this.isValid(entry)) {
        this.cache.delete(nk);
        continue;
      }

      if (nk.startsWith(ni) && nk.length > bestLength) {
        bestMatch = nk;
        bestLength = nk.length;
      }
    }

    if (bestMatch) {
      const entry = this.cache.get(bestMatch)!;
      this.touch(entry);
      this.cache.delete(bestMatch);
      this.cache.set(bestMatch, entry);

      const remaining = entry.value.slice(ni.length - bestLength);
      if (remaining && entry.value.startsWith(ni.slice(bestLength))) {
        return { completion: entry.value, remaining };
      }
      return { completion: entry.value, remaining };
    }

    for (const [nk, entry] of this.cache) {
      if (!this.isValid(entry)) continue;

      if (ni.length > 5 && nk.toLowerCase().includes(ni.toLowerCase())) {
        if (!bestMatch || nk.length > bestLength) {
          bestMatch = nk;
          bestLength = nk.length;
        }
      }
    }

    if (bestMatch) {
      const entry = this.cache.get(bestMatch)!;
      this.touch(entry);
      this.cache.delete(bestMatch);
      this.cache.set(bestMatch, entry);
      return { completion: entry.value, remaining: entry.value };
    }

    for (const [nk, entry] of this.cache) {
      if (!this.isValid(entry)) continue;

      if (ni.length >= 3 && this.isSubsequence(ni, nk)) {
        if (!bestMatch || nk.length > bestLength) {
          bestMatch = nk;
          bestLength = nk.length;
        }
      } 
    }

    if (bestMatch) {
      const entry = this.cache.get(bestMatch)!;
      this.touch(entry);
      this.cache.delete(bestMatch);
      this.cache.set(bestMatch, entry);
      return { completion: entry.value, remaining: entry.value };
    }

    return undefined;
  }

  private isSubsequence(input: string, key: string): boolean {
    let ki = 0;
    for (let ii = 0; ii < input.length; ii++) {
      while (ki < key.length && key[ki] !== input[ii]) ki++;
      if (ki >= key.length) return false;
      ki++;
    }
    return true;
  }

  set(prefix: string, value: string): void {
    if (this.capacity <= 0) return;

    const nk = this.normalizeKey(prefix);

    if (this.cache.has(nk)) {
      this.cache.delete(nk);
    } else if (this.cache.size >= this.capacity) {
      this.evictOne();
    }

    this.cache.set(nk, {
      value,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccess: Date.now(),
    });
  }

  private evictOne(): void {
    let oldestKey: string | undefined;
    let oldestAccess = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey) this.cache.delete(oldestKey);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
