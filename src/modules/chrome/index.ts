import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';
import type { AppModule } from '../orchestrator';
import { buildChromeArgs } from './args';
import { navigateToUrl as cdpNavigateToUrl } from './cdp';
import { getChromeProcess, killChromeProcess } from './launch';
import { launchChrome } from './launch';
import { readLastUrl } from './lastUrlState';

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
export { getChromeProcess, killChromeProcess } from './launch';
export { readLastUrl, writeLastUrl } from './lastUrlState';
export { waitForDevTools } from './waitDevTools';

export function isChromeAlive(_config: AppConfig): boolean {
  void _config;
  const proc = getChromeProcess();
  return proc != null && proc.exitCode === null;
}

export async function restartChrome(config: AppConfig, logger: Logger): Promise<void> {
  killChromeProcess();
  const port = config.devToolsPort ?? 9222;
  const timeoutMs = config.chromeReadyTimeout ?? 30000;
  const idleUrl = `http://localhost:${config.idlePort}/`;
  const args = buildChromeArgs(config, port, idleUrl);
  await launchChrome(config.chromePath, args, port, timeoutMs, logger);
  const statePath = config.lastUrlStatePath ?? './.last-url';
  const lastUrl = await readLastUrl(statePath);
  await navigateToUrl(lastUrl ?? idleUrl, { config, logger });
}

export async function navigateToUrl(
  url: string,
  deps: { config: AppConfig; logger: Logger }
): Promise<void> {
  if (getChromeProcess() == null) {
    throw new Error('Chrome is not running');
  }
  const port = deps.config.devToolsPort ?? 9222;
  const statePath = deps.config.lastUrlStatePath ?? './.last-url';
  await cdpNavigateToUrl(port, url, statePath, deps.logger);
}
