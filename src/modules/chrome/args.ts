import type { AppConfig } from '../config/types';

/**
 * Build Chrome CLI args for remote debugging and single-window mode.
 * Uses only config values (no user input). Safe to pass to spawn(argv).
 */
export function buildChromeArgs(
  config: AppConfig,
  devToolsPort: number,
  initialUrl: string
): string[] {
  const port = String(devToolsPort);
  const args = [
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    initialUrl,
  ];
  const mode = config.chromeWindowMode ?? 'default';
  if (mode === 'kiosk') {
    args.unshift('--kiosk');
  } else if (mode === 'app') {
    args.pop(); // remove initialUrl from end
    args.unshift(`--app=${initialUrl}`);
  } else if (mode === 'fullscreen') {
    args.unshift('--start-fullscreen');
  }
  return args;
}
