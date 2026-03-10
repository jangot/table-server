import type { AppConfig } from './types';
/**
 * Return validated config from environment (cached after first call).
 * On validation error: logs to stderr and process.exit(1).
 */
export declare function getConfig(): AppConfig;
/**
 * Reset cached config (for tests only). Next getConfig() will re-validate env.
 */
export declare function resetConfigForTesting(): void;
export type { AppConfig } from './types';
export { validateEnv } from './validate';
//# sourceMappingURL=index.d.ts.map