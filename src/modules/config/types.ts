/**
 * Application configuration (stage 001: idle server and executable checks).
 * Extended in later stages: botToken, allowedUsers, restart policy, etc.
 */
export type ChromeWindowMode = 'kiosk' | 'app' | 'fullscreen' | 'default';

export interface AppConfig {
  chromePath: string;
  obsPath: string;
  idlePort: number;
  idleViewsPath: string;
  logLevel: 'info' | 'warn' | 'error' | 'debug';
  devToolsPort?: number;
  chromeReadyTimeout?: number;
  chromeWindowMode?: ChromeWindowMode;
  obsReadyTimeout?: number;
  /** Optional path to OBS profile/config directory (env: OBS_PROFILE_PATH). */
  obsProfilePath?: string;
  /** Optional path to file storing last navigated URL for recovery after restart. */
  lastUrlStatePath?: string;
  /** Optional path for Chrome user data directory (env: CHROME_USER_DATA_DIR). */
  chromeUserDataDir?: string;
  /** Interval (ms) for watchdog status checks. If not set, watchdog is disabled. */
  watchdogCheckIntervalMs?: number;
  /** Min interval (ms) between watchdog-triggered restarts. */
  watchdogRestartMinIntervalMs?: number;
  /** Telegram Bot API token (env: TELEGRAM_BOT_TOKEN). If not set, bot is not started. */
  telegramBotToken?: string;
  /** Allowed Telegram user ids or usernames without @ (env: ALLOWED_TELEGRAM_USERS, comma-separated). */
  allowedTelegramUsers?: string[];
}
