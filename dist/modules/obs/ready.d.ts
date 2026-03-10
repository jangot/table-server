import type { ChildProcess } from 'node:child_process';
/**
 * Wait until OBS process is considered ready (alive for at least one poll interval).
 * Rejects if process exits before ready or if timeout is exceeded.
 */
export declare function waitForObsReady(proc: ChildProcess, timeoutMs: number): Promise<void>;
//# sourceMappingURL=ready.d.ts.map