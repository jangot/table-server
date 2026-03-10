import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  getConfig,
  resetConfigForTesting,
  validateEnv,
} from '../src/modules/config';

const REQUIRED = {
  CHROME_PATH: '/usr/bin/chrome',
  OBS_PATH: '/usr/bin/obs',
  IDLE_PORT: '3000',
  IDLE_VIEWS_PATH: './views',
  LOG_LEVEL: 'info',
};

function setEnv(env: Record<string, string>): void {
  for (const [k, v] of Object.entries(env)) {
    process.env[k] = v;
  }
}

function unsetEnv(keys: string[]): void {
  for (const k of keys) {
    delete process.env[k];
  }
}

describe('config', () => {
  before(() => {
    setEnv(REQUIRED);
  });

  after(() => {
    unsetEnv([
      ...Object.keys(REQUIRED),
      'DEVTOOLS_PORT',
      'CHROME_READY_TIMEOUT',
      'OBS_READY_TIMEOUT',
    ]);
    resetConfigForTesting();
  });

  it('happy path: getConfig() returns object with expected fields', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    const config = getConfig();
    assert.strictEqual(config.chromePath, '/usr/bin/chrome');
    assert.strictEqual(config.obsPath, '/usr/bin/obs');
    assert.strictEqual(config.idlePort, 3000);
    assert.strictEqual(config.idleViewsPath, './views');
    assert.strictEqual(config.logLevel, 'info');
    assert.strictEqual(config.devToolsPort, undefined);
  });

  it('optional DEVTOOLS_PORT is parsed', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.DEVTOOLS_PORT = '9222';
    const config = getConfig();
    assert.strictEqual(config.devToolsPort, 9222);
    delete process.env.DEVTOOLS_PORT;
  });

  it('validateEnv throws when required variable is missing', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    delete process.env.CHROME_PATH;
    assert.throws(
      () => validateEnv(),
      /Missing required environment variable: CHROME_PATH/
    );
    setEnv(REQUIRED);
  });

  it('validateEnv throws when IDLE_PORT is not a number', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.IDLE_PORT = 'abc';
    assert.throws(
      () => validateEnv(),
      /Invalid port in IDLE_PORT/
    );
    setEnv(REQUIRED);
  });

  it('validateEnv throws when IDLE_PORT is out of range', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.IDLE_PORT = '0';
    assert.throws(() => validateEnv(), /Invalid port/);
    process.env.IDLE_PORT = '70000';
    assert.throws(() => validateEnv(), /Invalid port/);
    setEnv(REQUIRED);
  });

  it('validateEnv throws when LOG_LEVEL is invalid', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.LOG_LEVEL = 'trace';
    assert.throws(
      () => validateEnv(),
      /Invalid LOG_LEVEL.*expected one of/
    );
    setEnv(REQUIRED);
  });
});
