import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';
import type { AppModule } from '../orchestrator';
import { buildObsArgs } from './args';
import { getObsProcess, launchObs } from './launch';
import { getRestartDelayMs } from './restart';

const RESTART_MIN_INTERVAL_MS = 5000;
const MAX_RESTARTS = 10;

let performRestartRef: (() => void) | null = null;

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
      performRestart();
    });
  }

  function performRestart(): void {
    restartCount++;
    if (restartCount > MAX_RESTARTS) {
      logger.error('OBS max restarts reached, not restarting');
      return;
    }
    const delay = getRestartDelayMs(lastRestartAt, RESTART_MIN_INTERVAL_MS);
    const doRun = (): void => {
      lastRestartAt = Date.now();
      run()
        .then(() => scheduleRestart())
        .catch((err) => logger.error('OBS restart failed', err));
    };
    if (delay > 0) setTimeout(doRun, delay);
    else doRun();
  }

  performRestartRef = performRestart;

  return {
    name: 'OBS',
    async start() {
      await run();
      scheduleRestart();
    },
  };
}

export function isObsAlive(): boolean {
  const proc = getObsProcess();
  return proc != null && proc.exitCode === null;
}

/**
 * Restart OBS if it is not alive. Uses the same performRestart logic as the exit handler.
 * No-op if OBS is already running.
 */
export function restartObs(_config: AppConfig, _logger: Logger): Promise<void> {
  void _config;
  void _logger;
  if (isObsAlive()) return Promise.resolve();
  performRestartRef?.();
  return Promise.resolve();
}

export { getObsProcess } from './launch';
