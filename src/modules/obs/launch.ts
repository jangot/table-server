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
  obsProcess = spawn(obsPath, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  const proc = obsProcess;
  proc.unref();

  const stderrChunks: Buffer[] = [];
  proc.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

  const stdoutChunks: Buffer[] = [];
  proc.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));

  function logObsOutput(context: string): void {
    const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
    const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
    if (stderr) logger.error(`${context} stderr`, { stderr });
    if (stdout) logger.warn(`${context} stdout`, { stdout });
  }

  return new Promise((resolve, reject) => {
    proc.on('error', (err) => {
      obsProcess = null;
      logObsOutput('OBS spawn error');
      logger.error('OBS spawn error', err);
      reject(err);
    });
    proc.on('exit', (code, signal) => {
      logObsOutput('OBS exit');
      logger.warn('OBS process exit captured in launch', { code, signal });
    });
    proc.on('spawn', () => {
      waitForObsReady(proc, timeoutMs)
        .then(() => {
          logger.info('OBS ready');
          resolve();
        })
        .catch((err) => {
          logObsOutput('OBS not ready');
          logger.error('OBS not ready', err);
          proc.kill('SIGTERM');
          obsProcess = null;
          reject(err);
        });
    });
  });
}
