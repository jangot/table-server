import type { ChildProcess } from 'node:child_process';
import type { Logger } from '../logger';
export declare function getObsProcess(): ChildProcess | null;
/**
 * Launch OBS process, wait for ready (process alive for one interval), then resolve.
 * On spawn error or timeout: log, reject, and kill process on ready timeout.
 */
export declare function launchObs(obsPath: string, args: string[], timeoutMs: number, logger: Logger): Promise<void>;
//# sourceMappingURL=launch.d.ts.map