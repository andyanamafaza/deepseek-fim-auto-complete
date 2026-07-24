const MIN_DEBOUNCE = 80;
const MAX_DEBOUNCE = 800;
const INTERVAL_WINDOW = 5;

export class Debouncer {
  private timeoutId: NodeJS.Timeout | undefined;
  private currentRequestId = 0;
  private instanceCounter = 0;
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

  async wait(delayMs: number): Promise<boolean> {
    const requestId = ++this.instanceCounter;
    this.currentRequestId = requestId;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    const adaptiveDelay = this.measureInterval();
    const effectiveDelay = Math.max(delayMs, adaptiveDelay);

    return new Promise<boolean>((resolve) => {
      this.timeoutId = setTimeout(() => {
        const isStale = this.currentRequestId !== requestId;
        resolve(isStale);
      }, effectiveDelay);
    });
  }

  isStale(): boolean {
    return this.currentRequestId !== this.instanceCounter;
  }

  clear(): void {
    this.currentRequestId = -1;
    this.instanceCounter++;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }

  cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
    this.currentRequestId = -1;
    this.intervals = [];
  }
}
