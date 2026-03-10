import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';
export interface WatchdogDeps {
    isChromeAlive: (config: AppConfig) => boolean;
    restartChrome: (config: AppConfig, logger: Logger) => Promise<void>;
    isObsAlive: () => boolean;
    restartObs: (config: AppConfig, logger: Logger) => Promise<void>;
}
/**
 * Start the watchdog loop: periodically check Chrome and OBS liveness,
 * restart when dead with backoff. Resolves immediately if watchdog is disabled.
 */
export declare function startWatchdog(config: AppConfig, logger: Logger, deps: WatchdogDeps): Promise<void>;
//# sourceMappingURL=index.d.ts.map