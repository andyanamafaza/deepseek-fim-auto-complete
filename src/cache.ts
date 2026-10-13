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

    // 1. Prefer the longest cached key that is a prefix of (or equal to) the
    //    input: the user may have typed further into a prefix we already know.
    let prefKey: string | undefined;
    let prefLength = 2;
    for (const [nk, entry] of this.cache) {
      if (!this.isValid(entry)) {
        this.cache.delete(nk);
        continue;
      }
      if (nk.length > prefLength && ni.startsWith(nk)) {
        prefKey = nk;
        prefLength = nk.length;
      }
    }
    if (prefKey) {
      const entry = this.cache.get(prefKey)!;
      this.touch(entry);
      this.cache.delete(prefKey);
      this.cache.set(prefKey, entry);
      // Drop the characters already typed past the cached prefix.
      return { completion: entry.value, remaining: entry.value.slice(ni.length - prefKey.length) };
    }

    // 2. Case-insensitive substring match.
    let fuzzyKey: string | undefined;
    let fuzzyLength = 0;
    for (const [nk, entry] of this.cache) {
      if (!this.isValid(entry)) continue;
      if (ni.length > 5 && nk.length > fuzzyLength && nk.toLowerCase().includes(ni.toLowerCase())) {
        fuzzyKey = nk;
        fuzzyLength = nk.length;
      }
    }
    if (fuzzyKey) {
      return this.take(fuzzyKey);
    }

    // 3. Subsequence match.
    for (const [nk, entry] of this.cache) {
      if (!this.isValid(entry)) continue;
      if (ni.length >= 3 && nk.length > fuzzyLength && this.isSubsequence(ni, nk)) {
        fuzzyKey = nk;
        fuzzyLength = nk.length;
      }
    }
    if (fuzzyKey) {
      return this.take(fuzzyKey);
    }

    return undefined;
  }

  private take(key: string): { completion: string; remaining: string } {
    const entry = this.cache.get(key)!;
    this.touch(entry);
    this.cache.delete(key);
    this.cache.set(key, entry);
    return { completion: entry.value, remaining: entry.value };
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
