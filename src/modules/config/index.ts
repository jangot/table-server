import 'reflect-metadata';
import { validateEnv } from './validate';
import { AppConfig } from './types';

let cached: AppConfig | null = null;

/**
 * Return validated config from environment (cached after first call).
 * On validation error: logs to stderr and process.exit(1).
 */
export function getConfig(): AppConfig {
  if (cached === null) {
    try {
      cached = validateEnv();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(msg);
      process.exit(1);
    }
  }
  return cached;
}

/**
 * Reset cached config (for tests only). Next getConfig() will re-validate env.
 */
export function resetConfigForTesting(): void {
  cached = null;
}

export { AppConfig } from './types';
export { validateEnv } from './validate';
