let consoleBroken = false;
let consoleBrokenTimer: ReturnType<typeof setTimeout> | null = null;

function markBroken(): void {
  consoleBroken = true;
  if (consoleBrokenTimer) clearTimeout(consoleBrokenTimer);
  consoleBrokenTimer = setTimeout(() => {
    consoleBroken = false;
    consoleBrokenTimer = null;
  }, 10000);
}

export function safeWarn(...args: unknown[]): void {
  if (consoleBroken) return;
  try {
    console.warn(...args);
  } catch {
    markBroken();
  }
}

export function safeError(...args: unknown[]): void {
  if (consoleBroken) return;
  try {
    console.error(...args);
  } catch {
    markBroken();
  }
}

export function safeLog(...args: unknown[]): void {
  if (consoleBroken) return;
  try {
    console.log(...args);
  } catch {
    markBroken();
  }
}
