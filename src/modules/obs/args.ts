import type { AppConfig } from '../config/types';

/**
 * Build CLI arguments for OBS (path is passed separately to spawn).
 * Uses only config values, no user input substitution.
 */
export function buildObsArgs(config: AppConfig): string[] {
  const args: string[] = [];
  if (config.obsProfilePath) {
    args.push(`--profile=${config.obsProfilePath}`);
  }
  return args;
}
