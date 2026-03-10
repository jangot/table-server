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
export function startWatchdog(
  config: AppConfig,
  logger: Logger,
  deps: WatchdogDeps
): Promise<void> {
  const intervalMs = config.watchdogCheckIntervalMs ?? 0;
  if (intervalMs <= 0) return Promise.resolve();

  const minRestartMs = config.watchdogRestartMinIntervalMs ?? 10000;
  let lastChromeRestartAt = 0;
  let lastObsRestartAt = 0;
  let status: 'ready' | 'degraded' = 'ready';

  const check = async (): Promise<void> => {
    const chromeAlive = deps.isChromeAlive(config);
    const obsAlive = deps.isObsAlive();
    if (chromeAlive && obsAlive) {
      if (status !== 'ready') {
        logger.info('Watchdog status: ready');
        status = 'ready';
      }
      return;
    }
    if (status !== 'degraded') {
      logger.warn('Watchdog status: degraded');
      status = 'degraded';
    }
    if (!chromeAlive) {
      const delay = Math.max(0, minRestartMs - (Date.now() - lastChromeRestartAt));
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      try {
        await deps.restartChrome(config, logger);
        lastChromeRestartAt = Date.now();
      } catch (e) {
        logger.error('Watchdog Chrome restart failed', e);
      }
    }
    if (!deps.isObsAlive()) {
      const delay = Math.max(0, minRestartMs - (Date.now() - lastObsRestartAt));
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      try {
        await deps.restartObs(config, logger);
        lastObsRestartAt = Date.now();
      } catch (e) {
        logger.error('Watchdog OBS restart failed', e);
      }
    }
  };

  setInterval(check, intervalMs).unref();
  void check();
  return Promise.resolve();
}
