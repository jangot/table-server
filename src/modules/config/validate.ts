import 'reflect-metadata';
import { validateSync, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AppConfig,
  ChromeConfig,
  ObsConfig,
  TelegramConfig,
  IdleConfig,
  WatchdogConfig,
} from './types';

function getEnv(name: string): string | undefined {
  return process.env[name];
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = parseInt(value.trim(), 10);
  return Number.isNaN(n) ? undefined : n;
}

function parseOptionalFloat(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = parseFloat(value.trim());
  return Number.isNaN(n) ? undefined : n;
}

/** Рекурсивно собирает текстовые сообщения из массива ValidationError */
function collectMessages(errors: ValidationError[], prefix = ''): string[] {
  const messages: string[] = [];
  for (const err of errors) {
    const path = prefix ? `${prefix}.${err.property}` : err.property;
    if (err.constraints) {
      messages.push(...Object.values(err.constraints).map((m) => `${path}: ${m}`));
    }
    if (err.children?.length) {
      messages.push(...collectMessages(err.children, path));
    }
  }
  return messages;
}

/**
 * Read and validate environment variables, return typed config.
 * On validation error: throws Error listing all validation issues.
 */
export function validateEnv(): AppConfig {
  const allowedRaw = getEnv('ALLOWED_TELEGRAM_USERS');
  const allowedTelegramUsers =
    allowedRaw != null
      ? allowedRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

  const plain = {
    logLevel: getEnv('LOG_LEVEL')?.toLowerCase().trim(),
    lastUrlStatePath: getEnv('LAST_URL_STATE_PATH')?.trim() || undefined,
    scenesConfigPath: getEnv('SCENES_CONFIG_PATH')?.trim() || undefined,
    chromeScriptsDir: getEnv('CHROME_SCRIPTS_DIR')?.trim() || undefined,
    chromeScriptsMap: getEnv('CHROME_SCRIPTS_MAP')?.trim() || undefined,
    chrome: plainToInstance(ChromeConfig, {
      path: getEnv('CHROME_PATH')?.trim(),
      devToolsPort: parseOptionalInt(getEnv('DEVTOOLS_PORT')),
      readyTimeout: parseOptionalInt(getEnv('CHROME_READY_TIMEOUT')),
      windowMode: getEnv('CHROME_WINDOW_MODE')?.toLowerCase().trim() || 'default',
      userDataDir: getEnv('CHROME_USER_DATA_DIR')?.trim() || undefined,
      windowWidth: parseOptionalInt(getEnv('CHROME_WINDOW_WIDTH')),
      windowHeight: parseOptionalInt(getEnv('CHROME_WINDOW_HEIGHT')),
      windowPositionX: parseOptionalInt(getEnv('CHROME_WINDOW_POSITION_X')),
      windowPositionY: parseOptionalInt(getEnv('CHROME_WINDOW_POSITION_Y')),
      deviceScaleFactor: parseOptionalFloat(getEnv('CHROME_DEVICE_SCALE_FACTOR')),
      kiosk: (() => {
        const raw = getEnv('CHROME_KIOSK')?.toLowerCase().trim();
        if (raw === 'true' || raw === '1') return true;
        if (raw === 'false' || raw === '0') return false;
        return undefined;
      })(),
      ozonePlatform: getEnv('CHROME_OZONE_PLATFORM')?.toLowerCase().trim() || undefined,
    }),
    obs: plainToInstance(ObsConfig, {
      path: getEnv('OBS_PATH')?.trim(),
      readyTimeout: parseOptionalInt(getEnv('OBS_READY_TIMEOUT')),
      profilePath: getEnv('OBS_PROFILE_PATH')?.trim() || undefined,
      configDir: getEnv('OBS_CONFIG_DIR')?.trim(),
      host: getEnv('OBS_HOST')?.trim(),
      port: parseOptionalInt(getEnv('OBS_PORT')),
      password: getEnv('OBS_PASSWORD'),
      projectorMonitorName: getEnv('OBS_PROJECTOR_MONITOR_NAME')?.trim() || undefined,
      projectorSceneName: getEnv('OBS_PROJECTOR_SCENE_NAME')?.trim() || undefined,
      outputSceneName: getEnv('OBS_OUTPUT_SCENE_NAME')?.trim() || undefined,
      chromeSourceName: getEnv('OBS_CHROME_SOURCE_NAME')?.trim() || undefined,
    }),
    telegram: plainToInstance(TelegramConfig, {
      botToken: getEnv('TELEGRAM_BOT_TOKEN')?.trim(),
      allowedUsers: allowedTelegramUsers,
    }),
    idle: plainToInstance(IdleConfig, {
      port: parseOptionalInt(getEnv('IDLE_PORT')),
      viewsPath: getEnv('IDLE_VIEWS_PATH')?.trim(),
    }),
    watchdog: plainToInstance(WatchdogConfig, {
      checkIntervalMs: parseOptionalInt(getEnv('WATCHDOG_CHECK_INTERVAL_MS')),
      restartMinIntervalMs: parseOptionalInt(getEnv('WATCHDOG_RESTART_MIN_INTERVAL_MS')),
    }),
  };

  const instance = plainToInstance(AppConfig, plain);
  const errors = validateSync(instance, { whitelist: false });

  if (errors.length > 0) {
    const messages = collectMessages(errors);
    throw new Error(`Config validation failed:\n${messages.join('\n')}`);
  }

  return instance;
}
