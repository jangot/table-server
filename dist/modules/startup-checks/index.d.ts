import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';
/**
 * Verify Chrome and OBS executables exist and are executable.
 * On failure: logs and process.exit(1).
 */
export declare function checkChromeAndObs(config: AppConfig, logger: Logger): Promise<void>;
//# sourceMappingURL=index.d.ts.map