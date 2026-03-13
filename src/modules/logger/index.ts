import type { AppConfig } from '../config/types';

const LEVEL_ORDER: Record<AppConfig['logLevel'], number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}

function shouldLog(level: AppConfig['logLevel'], messageLevel: AppConfig['logLevel']): boolean {
  return LEVEL_ORDER[messageLevel] >= LEVEL_ORDER[level];
}

function formatMessage(level: string, msg: string, args: unknown[]): string {
  const prefix = `[${new Date().toISOString()}] ${level.toUpperCase()}`;
  if (args.length === 0) return `${prefix} ${msg}`;
  const rest = args.map((a) => (a instanceof Error ? a.message : JSON.stringify(a))).join(' ');
  return `${prefix} ${msg} ${rest}`;
}

/**
 * Create a logger that outputs only messages at or above the given level.
 * info/debug -> stdout, warn/error -> stderr.
 */
export function createLogger(logLevel: AppConfig['logLevel']): Logger {
  return {
    info(msg: string, ...args: unknown[]) {
      if (shouldLog(logLevel, 'info')) {
        console.log(formatMessage('info', msg, args));
      }
    },
    warn(msg: string, ...args: unknown[]) {
      if (shouldLog(logLevel, 'warn')) {
        console.warn(formatMessage('warn', msg, args));
      }
    },
    error(msg: string, ...args: unknown[]) {
      if (shouldLog(logLevel, 'error')) {
        console.error(formatMessage('error', msg, args));
      }
    },
    debug(msg: string, ...args: unknown[]) {
      if (shouldLog(logLevel, 'debug')) {
        console.log(formatMessage('debug', msg, args));
      }
    },
  };
}
