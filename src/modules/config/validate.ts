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
    allowedRaw === undefined || allowedRaw.trim() === ''
      ? undefined
      : allowedRaw.split(',').map((s) => s.trim()).filter(Boolean);

  const plain = {
    logLevel: getEnv('LOG_LEVEL')?.toLowerCase().trim(),
    lastUrlStatePath: getEnv('LAST_URL_STATE_PATH')?.trim() || undefined,
    chrome: plainToInstance(ChromeConfig, {
      path: getEnv('CHROME_PATH')?.trim(),
      devToolsPort: parseOptionalInt(getEnv('DEVTOOLS_PORT')),
      readyTimeout: parseOptionalInt(getEnv('CHROME_READY_TIMEOUT')),
      windowMode: getEnv('CHROME_WINDOW_MODE')?.toLowerCase().trim() || 'default',
      userDataDir: getEnv('CHROME_USER_DATA_DIR')?.trim() || undefined,
    }),
    obs: plainToInstance(ObsConfig, {
      path: getEnv('OBS_PATH')?.trim(),
      readyTimeout: parseOptionalInt(getEnv('OBS_READY_TIMEOUT')),
      profilePath: getEnv('OBS_PROFILE_PATH')?.trim() || undefined,
    }),
    telegram: plainToInstance(TelegramConfig, {
      botToken: getEnv('TELEGRAM_BOT_TOKEN')?.trim() || undefined,
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
