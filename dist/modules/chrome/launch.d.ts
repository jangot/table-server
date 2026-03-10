import type { ChildProcess } from 'node:child_process';
import type { Logger } from '../logger';
export declare function getChromeProcess(): ChildProcess | null;
/**
 * Launch Chrome with given args, wait for DevTools to be ready, then resolve.
 * On spawn error or timeout: log, reject, and ensure process is not left running on fatal spawn error.
 */
export declare function launchChrome(chromePath: string, args: string[], port: number, timeoutMs: number, logger: Logger): Promise<void>;
//# sourceMappingURL=launch.d.ts.map