import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { Logger } from '../logger';
import { waitForObsReady } from './ready';

/**
 * Security: obsPath and args are passed to spawn with shell: false and must
 * contain only values from config (env), never user input — protects against command injection.
 */

let obsProcess: ChildProcess | null = null;

export function getObsProcess(): ChildProcess | null {
  return obsProcess;
}

/**
 * Launch OBS process, wait for ready (process alive for one interval), then resolve.
 * On spawn error or timeout: log, reject, and kill process on ready timeout.
 */
export async function launchObs(
  obsPath: string,
  args: string[],
  timeoutMs: number,
  logger: Logger
): Promise<void> {
  obsProcess = spawn(obsPath, args, { stdio: 'ignore', shell: false });
  const proc = obsProcess;

  return new Promise((resolve, reject) => {
    proc.on('error', (err) => {
      obsProcess = null;
      logger.error('OBS spawn error', err);
      reject(err);
    });
    proc.on('spawn', () => {
      waitForObsReady(proc, timeoutMs)
        .then(() => {
          logger.info('OBS ready');
          resolve();
        })
        .catch((err) => {
          logger.error('OBS not ready', err);
          proc.kill('SIGTERM');
          obsProcess = null;
          reject(err);
        });
    });
  });
}
