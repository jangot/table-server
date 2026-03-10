import type { AppConfig } from '../config/types';
export interface Logger {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
    debug(msg: string, ...args: unknown[]): void;
}
/**
 * Create a logger that outputs only messages at or above the given level.
 * info/debug -> stdout, warn/error -> stderr.
 */
export declare function createLogger(logLevel: AppConfig['logLevel']): Logger;
//# sourceMappingURL=index.d.ts.map