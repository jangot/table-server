import type { ChildProcess } from 'node:child_process';

/**
 * Wait until OBS process is considered ready (alive for at least one poll interval).
 * Rejects if process exits before ready or if timeout is exceeded.
 */
export function waitForObsReady(
  proc: ChildProcess,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  const intervalMs = 250;
  return new Promise((resolve, reject) => {
    function tick(): void {
      if (proc.exitCode !== null || proc.killed) {
        reject(new Error('OBS process exited before ready'));
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        reject(new Error(`OBS not ready within ${timeoutMs}ms`));
        return;
      }
      if (Date.now() - start >= intervalMs) {
        resolve();
        return;
      }
      setTimeout(tick, intervalMs);
    }
    setTimeout(tick, intervalMs);
  });
}
