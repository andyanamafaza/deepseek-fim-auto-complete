let consoleBroken = false;

export function safeWarn(...args: unknown[]): void {
  if (consoleBroken) return;
  try {
    console.warn(...args);
  } catch {
    consoleBroken = true;
  }
}

export function safeError(...args: unknown[]): void {
  if (consoleBroken) return;
  try {
    console.error(...args);
  } catch {
    consoleBroken = true;
  }
}

export function safeLog(...args: unknown[]): void {
  if (consoleBroken) return;
  try {
    console.log(...args);
  } catch {
    consoleBroken = true;
  }
}
