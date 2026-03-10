import type { AppConfig } from '../config/types';

/**
 * Build Chrome CLI args for remote debugging and single-window mode.
 * Only config and local idle URL are used; user-provided URLs are never
 * passed here (they go via CDP in navigateToUrl). Safe to pass to spawn(argv).
 */
export function buildChromeArgs(
  config: AppConfig,
  devToolsPort: number,
  initialUrl: string
): string[] {
  const port = String(devToolsPort);
  const userDataDir = config.chromeUserDataDir;
  const args = [
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    initialUrl,
  ];
  if (userDataDir) {
    args.unshift(`--user-data-dir=${userDataDir}`);
  }
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
