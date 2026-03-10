import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';
import type { AppModule } from '../orchestrator';
export declare function createChromeModule(config: AppConfig, logger: Logger): AppModule;
export { buildChromeArgs } from './args';
export { waitForDevTools } from './waitDevTools';
export { getChromeProcess } from './launch';
//# sourceMappingURL=index.d.ts.map