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
  const userDataDir = config.chrome.userDataDir;
  const args = [
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--kiosk',
    initialUrl,
  ];
  if (userDataDir) {
    args.unshift(`--user-data-dir=${userDataDir}`);
  }
  const mode = config.chrome.windowMode ?? 'default';
  if (mode === 'kiosk') {
    args.unshift('--kiosk');
  } else if (mode === 'app') {
    args.pop(); // remove initialUrl from end
    args.unshift(`--app=${initialUrl}`);
  } else if (mode === 'fullscreen') {
    args.unshift('--start-fullscreen');
  }
  const { windowWidth, windowHeight, windowPositionX, windowPositionY } = config.chrome;
  if (windowPositionX !== undefined && windowPositionY !== undefined) {
    args.unshift(`--window-position=${windowPositionX},${windowPositionY}`);
  }
  if (windowWidth !== undefined && windowHeight !== undefined) {
    args.unshift(`--window-size=${windowWidth},${windowHeight}`);
  }
  return args;
}
