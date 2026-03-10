import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';
import type { AppModule } from '../orchestrator';
export declare function createObsModule(config: AppConfig, logger: Logger): AppModule;
export declare function isObsAlive(): boolean;
/**
 * Restart OBS if it is not alive. Uses the same performRestart logic as the exit handler.
 * No-op if OBS is already running.
 */
export declare function restartObs(_config: AppConfig, _logger: Logger): Promise<void>;
export { getObsProcess } from './launch';
//# sourceMappingURL=index.d.ts.map