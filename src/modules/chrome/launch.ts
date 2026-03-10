import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { Logger } from '../logger';
import { waitForDevTools } from './waitDevTools';

/** Set by launchChrome for use in task 003 (CDP / close). */
let chromeProcess: ChildProcess | null = null;

export function getChromeProcess(): ChildProcess | null {
  return chromeProcess;
}

/**
 * Launch Chrome with given args, wait for DevTools to be ready, then resolve.
 * On spawn error or timeout: log, reject, and ensure process is not left running on fatal spawn error.
 */
export async function launchChrome(
  chromePath: string,
  args: string[],
  port: number,
  timeoutMs: number,
  logger: Logger
): Promise<void> {
  chromeProcess = spawn(chromePath, args, { stdio: 'ignore', shell: false });
  const proc = chromeProcess;

  return new Promise((resolve, reject) => {
    proc.on('error', (err) => {
      chromeProcess = null;
      logger.error('Chrome spawn error', err);
      reject(err);
    });

    proc.on('spawn', () => {
      waitForDevTools(port, timeoutMs)
        .then(() => {
          logger.info('Chrome DevTools ready');
          resolve();
        })
        .catch((err) => {
          logger.error('Chrome DevTools not ready', err);
          proc.kill('SIGTERM');
          chromeProcess = null;
          reject(err);
        });
    });
  });
}
