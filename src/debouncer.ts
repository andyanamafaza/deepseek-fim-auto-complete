export class Debouncer {
  private timeoutId: NodeJS.Timeout | undefined;
  private currentRequestId = 0;
  private instanceCounter = 0;

  async wait(delayMs: number): Promise<boolean> {
    const requestId = ++this.instanceCounter;
    this.currentRequestId = requestId;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    return new Promise<boolean>((resolve) => {
      this.timeoutId = setTimeout(() => {
        resolve(this.currentRequestId !== requestId);
      }, delayMs);
    });
  }

  cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
    this.currentRequestId = -1;
  }
}
