import type { AppConfig } from '../config/types';

/**
 * Build CLI arguments for OBS (path is passed separately to spawn).
 * Only config values are used; no user input is substituted. Safe to pass to spawn.
 */
export function buildObsArgs(config: AppConfig): string[] {
  const args: string[] = [];
  if (config.obsProfilePath) {
    args.push(`--profile=${config.obsProfilePath}`);
  }
  return args;
}
