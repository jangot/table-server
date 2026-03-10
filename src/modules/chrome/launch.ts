import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { Logger } from '../logger';
import { waitForDevTools } from './waitDevTools';

/**
 * Security: chromePath and args are passed to spawn with shell: false and must
 * contain only values from config (env), never user input — protects against command injection.
 */

/** Set by launchChrome for use in task 003 (CDP / close). */
let chromeProcess: ChildProcess | null = null;

export function getChromeProcess(): ChildProcess | null {
  return chromeProcess;
}

/**
 * Kill the current Chrome process if any. Sets chromeProcess to null.
 * Use before re-launching Chrome (e.g. restart).
 */
export function killChromeProcess(): void {
  if (chromeProcess != null) {
    chromeProcess.kill('SIGTERM');
    chromeProcess = null;
  }
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
