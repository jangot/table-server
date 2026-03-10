import type { AppConfig } from './types';

const LOG_LEVELS: AppConfig['logLevel'][] = ['info', 'warn', 'error', 'debug'];

const CHROME_WINDOW_MODES: AppConfig['chromeWindowMode'][] = [
  'kiosk',
  'app',
  'fullscreen',
  'default',
];

function getEnv(name: string): string | undefined {
  return process.env[name];
}

function requireEnv(name: string): string {
  const value = getEnv(name);
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function parsePort(name: string, value: string): number {
  const num = parseInt(value, 10);
  if (Number.isNaN(num) || num < 1 || num > 65535) {
    throw new Error(`Invalid port in ${name}: "${value}" (expected 1-65535)`);
  }
  return num;
}

function parseLogLevel(name: string, value: string): AppConfig['logLevel'] {
  const normalized = value.toLowerCase().trim();
  if (!LOG_LEVELS.includes(normalized as AppConfig['logLevel'])) {
    throw new Error(`Invalid ${name}: "${value}" (expected one of: ${LOG_LEVELS.join(', ')})`);
  }
  return normalized as AppConfig['logLevel'];
}

function parseOptionalPort(name: string, value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const num = parseInt(value.trim(), 10);
  if (Number.isNaN(num) || num < 1 || num > 65535) {
    throw new Error(`Invalid port in ${name}: "${value}" (expected 1-65535)`);
  }
  return num;
}

function parseOptionalPositiveInt(
  name: string,
  value: string | undefined
): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const num = parseInt(value.trim(), 10);
  if (Number.isNaN(num) || num < 1) {
    throw new Error(`Invalid ${name}: "${value}" (expected positive integer)`);
  }
  return num;
}

function parseChromeWindowMode(
  name: string,
  value: string | undefined
): AppConfig['chromeWindowMode'] | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const normalized = value.toLowerCase().trim() as AppConfig['chromeWindowMode'];
  if (!CHROME_WINDOW_MODES.includes(normalized)) {
    throw new Error(
      `Invalid ${name}: "${value}" (expected one of: ${CHROME_WINDOW_MODES.join(', ')})`
    );
  }
  return normalized;
}

/**
 * Read and validate environment variables, return typed config.
 * On validation error: throws Error with a clear message.
 */
export function validateEnv(): AppConfig {
  const chromePath = requireEnv('CHROME_PATH');
  const obsPath = requireEnv('OBS_PATH');
  const idlePort = parsePort('IDLE_PORT', requireEnv('IDLE_PORT'));
  const idleViewsPath = requireEnv('IDLE_VIEWS_PATH');
  const logLevel = parseLogLevel('LOG_LEVEL', requireEnv('LOG_LEVEL'));

  const devToolsPort = parseOptionalPort('DEVTOOLS_PORT', getEnv('DEVTOOLS_PORT'));
  const chromeReadyTimeout = parseOptionalPositiveInt(
    'CHROME_READY_TIMEOUT',
    getEnv('CHROME_READY_TIMEOUT')
  );
  const obsReadyTimeout = parseOptionalPositiveInt(
    'OBS_READY_TIMEOUT',
    getEnv('OBS_READY_TIMEOUT')
  );
  const chromeWindowMode = parseChromeWindowMode(
    'CHROME_WINDOW_MODE',
    getEnv('CHROME_WINDOW_MODE')
  );

  const lastUrlStatePath = getEnv('LAST_URL_STATE_PATH')?.trim();
  const chromeUserDataDir = getEnv('CHROME_USER_DATA_DIR')?.trim();

  return {
    chromePath,
    obsPath,
    idlePort,
    idleViewsPath,
    logLevel,
    devToolsPort,
    chromeReadyTimeout,
    chromeWindowMode: chromeWindowMode ?? 'default',
    obsReadyTimeout,
    lastUrlStatePath: lastUrlStatePath || undefined,
    chromeUserDataDir: chromeUserDataDir || undefined,
  };
}
