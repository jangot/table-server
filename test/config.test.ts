import 'reflect-metadata';
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
  OBS_HOST: 'localhost',
  OBS_PORT: '4455',
  OBS_PASSWORD: '',
  IDLE_PORT: '3000',
  IDLE_VIEWS_PATH: './views',
  LOG_LEVEL: 'info',
  TELEGRAM_BOT_TOKEN: 'test-token',
  ALLOWED_TELEGRAM_USERS: 'test-user',
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
      'CHROME_WINDOW_MODE',
      'CHROME_WINDOW_WIDTH',
      'CHROME_WINDOW_HEIGHT',
      'CHROME_WINDOW_POSITION_X',
      'CHROME_WINDOW_POSITION_Y',
      'OBS_READY_TIMEOUT',
      'OBS_PROFILE_PATH',
      'SCENES_CONFIG_PATH',
      'OBS_HOST',
      'OBS_PORT',
      'OBS_PASSWORD',
      'TELEGRAM_BOT_TOKEN',
      'ALLOWED_TELEGRAM_USERS',
    ]);
    resetConfigForTesting();
  });

  it('happy path: getConfig() returns object with expected fields', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    const config = getConfig();
    assert.strictEqual(config.chrome.path, '/usr/bin/chrome');
    assert.strictEqual(config.obs.path, '/usr/bin/obs');
    assert.strictEqual(config.idle.port, 3000);
    assert.strictEqual(config.idle.viewsPath, './views');
    assert.strictEqual(config.logLevel, 'info');
    assert.strictEqual(config.chrome.devToolsPort, undefined);
  });

  it('optional DEVTOOLS_PORT is parsed', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.DEVTOOLS_PORT = '9222';
    const config = getConfig();
    assert.strictEqual(config.chrome.devToolsPort, 9222);
    delete process.env.DEVTOOLS_PORT;
  });

  it('validateEnv throws when required variable is missing', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    delete process.env.CHROME_PATH;
    assert.throws(
      () => validateEnv(),
      /chrome\.path/
    );
    setEnv(REQUIRED);
  });

  it('validateEnv throws when IDLE_PORT is not a number', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.IDLE_PORT = 'abc';
    assert.throws(
      () => validateEnv(),
      /idle\.port/
    );
    setEnv(REQUIRED);
  });

  it('validateEnv throws when IDLE_PORT is out of range', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.IDLE_PORT = '0';
    assert.throws(() => validateEnv(), /idle\.port/);
    process.env.IDLE_PORT = '70000';
    assert.throws(() => validateEnv(), /idle\.port/);
    setEnv(REQUIRED);
  });

  it('validateEnv throws when LOG_LEVEL is invalid', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.LOG_LEVEL = 'trace';
    assert.throws(
      () => validateEnv(),
      /logLevel/
    );
    setEnv(REQUIRED);
  });

  it('optional OBS_PROFILE_PATH is passed through', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.OBS_PROFILE_PATH = ' /home/user/.config/obs-studio ';
    const config = getConfig();
    assert.strictEqual(config.obs.profilePath, '/home/user/.config/obs-studio');
    delete process.env.OBS_PROFILE_PATH;
  });

  it('optional SCENES_CONFIG_PATH is in config when set', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.SCENES_CONFIG_PATH = ' /path/to/scenes.json ';
    const config = getConfig();
    assert.strictEqual(config.scenesConfigPath, '/path/to/scenes.json');
    delete process.env.SCENES_CONFIG_PATH;
  });

  it('TELEGRAM_BOT_TOKEN and ALLOWED_TELEGRAM_USERS are in config when set', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.TELEGRAM_BOT_TOKEN = ' 123:ABC  ';
    process.env.ALLOWED_TELEGRAM_USERS = ' 123456789 , johndoe ';
    const cfg = validateEnv();
    assert.strictEqual(cfg.telegram.botToken, '123:ABC');
    assert.deepStrictEqual(cfg.telegram.allowedUsers, ['123456789', 'johndoe']);
    unsetEnv(['TELEGRAM_BOT_TOKEN', 'ALLOWED_TELEGRAM_USERS']);
  });

  it('validateEnv throws when TELEGRAM_BOT_TOKEN not set', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    delete process.env.TELEGRAM_BOT_TOKEN;
    assert.throws(() => validateEnv(), /telegram\.botToken/);
    setEnv(REQUIRED);
  });

  it('validateEnv throws when ALLOWED_TELEGRAM_USERS is empty string', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.ALLOWED_TELEGRAM_USERS = '';
    assert.throws(() => validateEnv(), /allowedUsers/);
    setEnv(REQUIRED);
  });

  it('ALLOWED_TELEGRAM_USERS with spaces and commas parses to array without empty elements', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.ALLOWED_TELEGRAM_USERS = ' a , , b ,  ';
    const cfg = validateEnv();
    assert.deepStrictEqual(cfg.telegram.allowedUsers, ['a', 'b']);
    unsetEnv(['ALLOWED_TELEGRAM_USERS']);
  });

  it('CHROME_WINDOW_* env: all four set, config has numeric values', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.CHROME_WINDOW_WIDTH = '1280';
    process.env.CHROME_WINDOW_HEIGHT = '720';
    process.env.CHROME_WINDOW_POSITION_X = '100';
    process.env.CHROME_WINDOW_POSITION_Y = '200';
    const cfg = validateEnv();
    assert.strictEqual(cfg.chrome.windowWidth, 1280);
    assert.strictEqual(cfg.chrome.windowHeight, 720);
    assert.strictEqual(cfg.chrome.windowPositionX, 100);
    assert.strictEqual(cfg.chrome.windowPositionY, 200);
    unsetEnv(['CHROME_WINDOW_WIDTH', 'CHROME_WINDOW_HEIGHT', 'CHROME_WINDOW_POSITION_X', 'CHROME_WINDOW_POSITION_Y']);
  });

  it('CHROME_WINDOW_* env: not set, config fields are undefined', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    const cfg = validateEnv();
    assert.strictEqual(cfg.chrome.windowWidth, undefined);
    assert.strictEqual(cfg.chrome.windowHeight, undefined);
    assert.strictEqual(cfg.chrome.windowPositionX, undefined);
    assert.strictEqual(cfg.chrome.windowPositionY, undefined);
  });

  it('CHROME_WINDOW_WIDTH/HEIGHT boundary: 1 and 7680 are valid', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.CHROME_WINDOW_WIDTH = '1';
    process.env.CHROME_WINDOW_HEIGHT = '7680';
    const cfg = validateEnv();
    assert.strictEqual(cfg.chrome.windowWidth, 1);
    assert.strictEqual(cfg.chrome.windowHeight, 7680);
    unsetEnv(['CHROME_WINDOW_WIDTH', 'CHROME_WINDOW_HEIGHT']);
  });

  it('validateEnv throws when CHROME_WINDOW_WIDTH is 0', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.CHROME_WINDOW_WIDTH = '0';
    process.env.CHROME_WINDOW_HEIGHT = '720';
    assert.throws(() => validateEnv(), /windowWidth|chrome/);
    unsetEnv(['CHROME_WINDOW_WIDTH', 'CHROME_WINDOW_HEIGHT']);
  });

  it('validateEnv throws when CHROME_WINDOW_WIDTH exceeds 7680', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.CHROME_WINDOW_WIDTH = '7690';
    process.env.CHROME_WINDOW_HEIGHT = '720';
    assert.throws(() => validateEnv(), /windowWidth|chrome/);
    unsetEnv(['CHROME_WINDOW_WIDTH', 'CHROME_WINDOW_HEIGHT']);
  });

  it('CHROME_WINDOW_POSITION negative: valid for multi-monitor', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.CHROME_WINDOW_POSITION_X = '-100';
    process.env.CHROME_WINDOW_POSITION_Y = '50';
    const cfg = validateEnv();
    assert.strictEqual(cfg.chrome.windowPositionX, -100);
    assert.strictEqual(cfg.chrome.windowPositionY, 50);
    unsetEnv(['CHROME_WINDOW_POSITION_X', 'CHROME_WINDOW_POSITION_Y']);
  });

  it('OBS_HOST, OBS_PORT, OBS_PASSWORD when set are in config', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.OBS_HOST = 'localhost';
    process.env.OBS_PORT = '4455';
    process.env.OBS_PASSWORD = 'secret';
    const cfg = validateEnv();
    assert.strictEqual(cfg.obs.host, 'localhost');
    assert.strictEqual(cfg.obs.port, 4455);
    assert.strictEqual(cfg.obs.password, 'secret');
    unsetEnv(['OBS_HOST', 'OBS_PORT', 'OBS_PASSWORD']);
  });

  it('OBS_HOST trimmed; OBS_PORT parsed as number', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.OBS_HOST = '  myhost  ';
    process.env.OBS_PORT = ' 4455 ';
    process.env.OBS_PASSWORD = 'pwd';
    const cfg = validateEnv();
    assert.strictEqual(cfg.obs.host, 'myhost');
    assert.strictEqual(cfg.obs.port, 4455);
    unsetEnv(['OBS_HOST', 'OBS_PORT', 'OBS_PASSWORD']);
  });

  it('validateEnv throws when OBS WebSocket env not set', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    delete process.env.OBS_HOST;
    delete process.env.OBS_PORT;
    delete process.env.OBS_PASSWORD;
    assert.throws(() => validateEnv(), /obs\.(host|port|password)/);
    setEnv(REQUIRED);
  });

  it('OBS_PORT boundary: 1 and 65535 are valid', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.OBS_HOST = 'localhost';
    process.env.OBS_PASSWORD = 'p';
    process.env.OBS_PORT = '1';
    const cfg1 = validateEnv();
    assert.strictEqual(cfg1.obs.port, 1);
    process.env.OBS_PORT = '65535';
    resetConfigForTesting();
    const cfg2 = validateEnv();
    assert.strictEqual(cfg2.obs.port, 65535);
    unsetEnv(['OBS_HOST', 'OBS_PORT', 'OBS_PASSWORD']);
  });

  it('validateEnv throws when OBS_PORT is 0 and OBS WebSocket env set', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.OBS_HOST = 'localhost';
    process.env.OBS_PORT = '0';
    process.env.OBS_PASSWORD = 'p';
    assert.throws(() => validateEnv(), /port|obs/);
    unsetEnv(['OBS_HOST', 'OBS_PORT', 'OBS_PASSWORD']);
  });

  it('validateEnv throws when OBS_PORT is 65536 and OBS WebSocket env set', () => {
    resetConfigForTesting();
    setEnv(REQUIRED);
    process.env.OBS_HOST = 'localhost';
    process.env.OBS_PORT = '65536';
    process.env.OBS_PASSWORD = 'p';
    assert.throws(() => validateEnv(), /port|obs/);
    unsetEnv(['OBS_HOST', 'OBS_PORT', 'OBS_PASSWORD']);
  });
});
