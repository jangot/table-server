/**
 * Helpers for throttling OBS restarts (min interval between restarts).
 */
export function getRestartDelayMs(
  lastRestartAt: number,
  minIntervalMs: number
): number {
  const elapsed = Date.now() - lastRestartAt;
  return Math.max(0, minIntervalMs - elapsed);
}

export function shouldThrottleRestart(
  lastRestartAt: number,
  minIntervalMs: number
): boolean {
  return getRestartDelayMs(lastRestartAt, minIntervalMs) > 0;
}
