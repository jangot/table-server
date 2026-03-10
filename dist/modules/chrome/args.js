"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildChromeArgs = buildChromeArgs;
/**
 * Build Chrome CLI args for remote debugging and single-window mode.
 * Uses only config values (no user input). Safe to pass to spawn(argv).
 */
function buildChromeArgs(config, devToolsPort, initialUrl) {
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
    }
    else if (mode === 'app') {
        args.pop(); // remove initialUrl from end
        args.unshift(`--app=${initialUrl}`);
    }
    else if (mode === 'fullscreen') {
        args.unshift('--start-fullscreen');
    }
    return args;
}
//# sourceMappingURL=args.js.map