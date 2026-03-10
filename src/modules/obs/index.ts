import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';
import type { AppModule } from '../orchestrator';
import { buildObsArgs } from './args';
import { getObsProcess, launchObs } from './launch';
import { getRestartDelayMs } from './restart';

const RESTART_MIN_INTERVAL_MS = 5000;
const MAX_RESTARTS = 10;

export function createObsModule(config: AppConfig, logger: Logger): AppModule {
  let lastRestartAt = 0;
  let restartCount = 0;

  function run(): Promise<void> {
    const args = buildObsArgs(config);
    const timeoutMs = config.obsReadyTimeout ?? 10000;
    return launchObs(config.obsPath, args, timeoutMs, logger);
  }

  function scheduleRestart(): void {
    const proc = getObsProcess();
    if (!proc) return;
    proc.once('exit', (code, signal) => {
      logger.warn('OBS exited', { code, signal });
      restartCount++;
      if (restartCount > MAX_RESTARTS) {
        logger.error('OBS max restarts reached, not restarting');
        return;
      }
      const delay = getRestartDelayMs(lastRestartAt, RESTART_MIN_INTERVAL_MS);
      const doRestart = (): void => {
        lastRestartAt = Date.now();
        run()
          .then(() => scheduleRestart())
          .catch((err) => logger.error('OBS restart failed', err));
      };
      if (delay > 0) setTimeout(doRestart, delay);
      else doRestart();
    });
  }

  return {
    name: 'OBS',
    async start() {
      await run();
      scheduleRestart();
    },
  };
}

export { getObsProcess } from './launch';
