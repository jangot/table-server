/**
 * Helpers for throttling OBS restarts (min interval between restarts).
 */
export declare function getRestartDelayMs(lastRestartAt: number, minIntervalMs: number): number;
export declare function shouldThrottleRestart(lastRestartAt: number, minIntervalMs: number): boolean;
//# sourceMappingURL=restart.d.ts.map