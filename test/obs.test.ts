import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { ChildProcess } from 'node:child_process';
import { buildObsArgs } from '../src/modules/obs/args';
import { waitForObsReady } from '../src/modules/obs/ready';
import {
  getRestartDelayMs,
  shouldThrottleRestart,
} from '../src/modules/obs/restart';
import { createObsModule, isObsAlive, restartObs } from '../src/modules/obs';
import type { AppConfig } from '../src/modules/config/types';
import { createLogger } from '../src/modules/logger';

function baseConfig(obsOverrides: { profilePath?: string; configDir?: string } = {}): AppConfig {
  return {
    logLevel: 'info',
    chrome: { path: '/usr/bin/chrome' },
    obs: { path: '/usr/bin/obs', configDir: '/tmp/obs-config', ...obsOverrides },
    idle: { port: 3000, viewsPath: './views' },
    telegram: {},
    watchdog: {},
  } as unknown as AppConfig;
}

describe('buildObsArgs', () => {
  it('returns [--config-dir, path] when no profilePath', () => {
    const config = baseConfig();
    const args = buildObsArgs(config);
    assert.ok(Array.isArray(args));
    assert.strictEqual(args.length, 2);
    assert.strictEqual(args[0], '--config-dir');
    assert.strictEqual(args[1], '/tmp/obs-config');
  });

  it('returns [--config-dir, path, --profile=...] when both set', () => {
    const config = baseConfig({ profilePath: '/home/user/.config/obs-studio' });
    const args = buildObsArgs(config);
    assert.ok(Array.isArray(args));
    assert.strictEqual(args.length, 3);
    assert.strictEqual(args[0], '--config-dir');
    assert.strictEqual(args[1], '/tmp/obs-config');
    assert.strictEqual(args[2], '--profile=/home/user/.config/obs-studio');
  });

  it('handles path with spaces correctly as separate array element', () => {
    const config = baseConfig({ configDir: '/path/with spaces/obs' });
    const args = buildObsArgs(config);
    assert.strictEqual(args[0], '--config-dir');
    assert.strictEqual(args[1], '/path/with spaces/obs');
  });
});

describe('waitForObsReady', () => {
  it('rejects when process already exited (exitCode !== null)', async () => {
    const proc = { exitCode: 1, killed: false } as ChildProcess;
    await assert.rejects(
      () => waitForObsReady(proc, 5000),
      /OBS process exited before ready/
    );
  });

  it('rejects when process killed', async () => {
    const proc = { exitCode: null, killed: true } as ChildProcess;
    await assert.rejects(
      () => waitForObsReady(proc, 5000),
      /OBS process exited before ready/
    );
  });

  it('rejects on timeout when process stays alive', async () => {
    const proc = { exitCode: null, killed: false } as ChildProcess;
    await assert.rejects(
      () => waitForObsReady(proc, 100),
      /OBS not ready within 100ms/
    );
  });

  it('resolves when process stays alive for one interval', async () => {
    const proc = { exitCode: null, killed: false } as ChildProcess;
    await assert.doesNotReject(() => waitForObsReady(proc, 5000));
  });
});

describe('getRestartDelayMs / shouldThrottleRestart', () => {
  const minIntervalMs = 5000;

  it('getRestartDelayMs: lastRestartAt just now returns minIntervalMs', () => {
    const lastRestartAt = Date.now();
    const delay = getRestartDelayMs(lastRestartAt, minIntervalMs);
    assert.strictEqual(delay, minIntervalMs);
  });

  it('getRestartDelayMs: lastRestartAt long ago returns 0', () => {
    const lastRestartAt = Date.now() - 60000;
    const delay = getRestartDelayMs(lastRestartAt, minIntervalMs);
    assert.strictEqual(delay, 0);
  });

  it('shouldThrottleRestart: true when within min interval', () => {
    const lastRestartAt = Date.now();
    assert.strictEqual(shouldThrottleRestart(lastRestartAt, minIntervalMs), true);
  });

  it('shouldThrottleRestart: false when past min interval', () => {
    const lastRestartAt = Date.now() - 10000;
    assert.strictEqual(
      shouldThrottleRestart(lastRestartAt, minIntervalMs),
      false
    );
  });
});

describe('restartObs', () => {
  it('returns without throwing when OBS is not running and module not started', async () => {
    const config = baseConfig();
    const logger = createLogger('info');
    await assert.doesNotReject(() => restartObs(config, logger));
  });
});

describe('createObsModule', () => {
  it('returns module with name OBS and start function', () => {
    const config = baseConfig();
    const logger = createLogger('info');
    const mod = createObsModule(config, logger);
    assert.strictEqual(mod.name, 'OBS');
    assert.strictEqual(typeof mod.start, 'function');
  });
});

describe('isObsAlive', () => {
  it('returns false when OBS process is not running', () => {
    assert.strictEqual(isObsAlive(), false);
  });
});
