import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';
import type { AppModule } from '../orchestrator';
export declare function createChromeModule(config: AppConfig, logger: Logger): AppModule;
export { buildChromeArgs } from './args';
export { getChromeProcess, killChromeProcess } from './launch';
export { readLastUrl, writeLastUrl } from './lastUrlState';
export { waitForDevTools } from './waitDevTools';
export declare function isChromeAlive(_config: AppConfig): boolean;
export declare function restartChrome(config: AppConfig, logger: Logger): Promise<void>;
export declare function navigateToUrl(url: string, deps: {
    config: AppConfig;
    logger: Logger;
}): Promise<void>;
//# sourceMappingURL=index.d.ts.map