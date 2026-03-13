import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ObsWebSocketClient } from './client';
import type { Logger } from '../logger';

type ExecFileFn = (cmd: string, args: string[]) => Promise<{ stdout: string }>;

const defaultExecFile: ExecFileFn = promisify(execFile) as ExecFileFn;

const RETRY_INTERVAL_MS = 500;
const TIMEOUT_MS = 10_000;

export async function bindChromeWindow(
  client: ObsWebSocketClient,
  sourceName: string,
  logger: Logger,
  execFileFn: ExecFileFn = defaultExecFile,
  timeoutMs: number = TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    let stdout: string;
    try {
      ({ stdout } = await execFileFn('xdotool', ['search', '--onlyvisible', '--class', 'chrome']));
    } catch {
      // xdotool returns exit code 1 if no windows found — wait for next iteration
      await sleep(RETRY_INTERVAL_MS);
      continue;
    }

    const xid = stdout.trim().split('\n')[0];
    if (!xid) {
      await sleep(RETRY_INTERVAL_MS);
      continue;
    }

    logger.info(`obs_chrome_bind action=found xid=${xid} source=${sourceName}`);
    try {
      await client.setInputSettings(sourceName, { capture_window: xid });
      logger.info(`obs_chrome_bind action=bound xid=${xid} source=${sourceName}`);
    } catch (err) {
      logger.warn(
        `obs_chrome_bind action=set_input_settings_failed source=${sourceName} error=${err instanceof Error ? err.message : String(err)}`
      );
    }
    return;
  }

  logger.warn(`obs_chrome_bind action=timeout source=${sourceName} timeout_ms=${timeoutMs}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
