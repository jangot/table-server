import { describe, it } from 'node:test';
import assert from 'node:assert';
import { startWatchdog } from '../src/modules/watchdog';
import type { AppConfig } from '../src/modules/config/types';
import { createLogger } from '../src/modules/logger';

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    chromePath: '/usr/bin/chrome',
    obsPath: '/usr/bin/obs',
    idlePort: 3000,
    idleViewsPath: './views',
    logLevel: 'info',
    ...overrides,
  };
}

describe('startWatchdog', () => {
  it('resolves immediately when watchdogCheckIntervalMs is undefined', async () => {
    const config = baseConfig();
    const logger = createLogger('info');
    const deps = {
      isChromeAlive: () => true,
      restartChrome: async () => {},
      isObsAlive: () => true,
      restartObs: async () => {},
    };
    await assert.doesNotReject(() => startWatchdog(config, logger, deps));
  });

  it('resolves immediately when watchdogCheckIntervalMs is 0', async () => {
    const config = baseConfig({ watchdogCheckIntervalMs: 0 });
    const logger = createLogger('info');
    const deps = {
      isChromeAlive: () => true,
      restartChrome: async () => {},
      isObsAlive: () => true,
      restartObs: async () => {},
    };
    await assert.doesNotReject(() => startWatchdog(config, logger, deps));
  });

  it('runs check and calls restartChrome when Chrome is dead', async () => {
    const config = baseConfig({ watchdogCheckIntervalMs: 10000 });
    const logger = createLogger('info');
    let chromeRestartCalls = 0;
    const deps = {
      isChromeAlive: () => false,
      restartChrome: async () => {
        chromeRestartCalls++;
      },
      isObsAlive: () => true,
      restartObs: async () => {},
    };
    startWatchdog(config, logger, deps);
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(chromeRestartCalls, 1);
  });

  it('runs check and calls restartObs when OBS is dead', async () => {
    const config = baseConfig({ watchdogCheckIntervalMs: 10000 });
    const logger = createLogger('info');
    let obsRestartCalls = 0;
    const deps = {
      isChromeAlive: () => true,
      restartChrome: async () => {},
      isObsAlive: () => false,
      restartObs: async () => {
        obsRestartCalls++;
      },
    };
    startWatchdog(config, logger, deps);
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(obsRestartCalls, 1);
  });

  it('does not call restart when both Chrome and OBS are alive', async () => {
    const config = baseConfig({ watchdogCheckIntervalMs: 10000 });
    const logger = createLogger('info');
    let chromeRestartCalls = 0;
    let obsRestartCalls = 0;
    const deps = {
      isChromeAlive: () => true,
      restartChrome: async () => {
        chromeRestartCalls++;
      },
      isObsAlive: () => true,
      restartObs: async () => {
        obsRestartCalls++;
      },
    };
    startWatchdog(config, logger, deps);
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(chromeRestartCalls, 0);
    assert.strictEqual(obsRestartCalls, 0);
  });
});
