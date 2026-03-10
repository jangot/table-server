import * as fs from 'fs';
import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';

async function checkExecutable(
  path: string,
  name: string,
  logger: Logger
): Promise<void> {
  try {
    await fs.promises.access(path, fs.constants.X_OK);
  } catch {
    logger.error(`${name} not found at ${path}`);
    process.exit(1);
  }
}

/**
 * Verify Chrome and OBS executables exist and are executable.
 * On failure: logs and process.exit(1).
 */
export async function checkChromeAndObs(config: AppConfig, logger: Logger): Promise<void> {
  await checkExecutable(config.chromePath, 'Chrome', logger);
  await checkExecutable(config.obsPath, 'OBS', logger);
}
