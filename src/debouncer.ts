const MIN_DEBOUNCE = 80;
const MAX_DEBOUNCE = 800;
const INTERVAL_WINDOW = 5;

export class Debouncer {
  private timeoutId: NodeJS.Timeout | undefined;
  private pendingResolve: ((stale: boolean) => void) | undefined;
  private intervals: number[] = [];
  private lastCall = 0;

  private measureInterval(): number {
    const now = Date.now();
    if (this.lastCall > 0) {
      const elapsed = now - this.lastCall;
      if (elapsed < 2000) {
        this.intervals.push(elapsed);
        if (this.intervals.length > INTERVAL_WINDOW) {
          this.intervals.shift();
        }
      }
    }
    this.lastCall = now;
    return this.computeAdaptiveDelay();
  }

  private computeAdaptiveDelay(): number {
    if (this.intervals.length < 2) return 300;
    const avg = this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length;
    const delay = Math.round(avg * 2.5);
    return Math.max(MIN_DEBOUNCE, Math.min(MAX_DEBOUNCE, delay));
  }

  /** Resolve any in-flight wait so a superseded caller can never hang. */
  private settlePending(stale: boolean): void {
    const resolve = this.pendingResolve;
    this.pendingResolve = undefined;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
    resolve?.(stale);
  }

  /**
   * Wait out the debounce window. Resolves `true` when this call was superseded
   * by a newer one (or cleared) — meaning it should stop; `false` when it is the
   * latest call and should proceed. A superseded call always resolves.
   */
  async wait(delayMs: number): Promise<boolean> {
    this.settlePending(true);

    const adaptiveDelay = this.measureInterval();
    const effectiveDelay = Math.max(delayMs, adaptiveDelay);

    return new Promise<boolean>((resolve) => {
      this.pendingResolve = resolve;
      this.timeoutId = setTimeout(() => {
        this.pendingResolve = undefined;
        this.timeoutId = undefined;
        resolve(false);
      }, effectiveDelay);
    });
  }

  clear(): void {
    this.settlePending(true);
  }

  cancel(): void {
    this.settlePending(true);
    this.intervals = [];
  }
}
