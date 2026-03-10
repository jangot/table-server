import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';
import type { AppModule } from '../orchestrator';
import { buildChromeArgs } from './args';
import { launchChrome } from './launch';

export function createChromeModule(config: AppConfig, logger: Logger): AppModule {
  return {
    name: 'Chrome',
    async start() {
      const port = config.devToolsPort ?? 9222;
      const timeoutMs = config.chromeReadyTimeout ?? 30000;
      const idleUrl = `http://localhost:${config.idlePort}/`;
      const args = buildChromeArgs(config, port, idleUrl);
      await launchChrome(config.chromePath, args, port, timeoutMs, logger);
    },
  };
}

export { buildChromeArgs } from './args';
export { waitForDevTools } from './waitDevTools';
export { getChromeProcess } from './launch';
