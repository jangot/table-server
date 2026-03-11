import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildChromeArgs } from '../src/modules/chrome/args';
import {
  navigateToUrl,
  readLastUrl,
  writeLastUrl,
  isChromeAlive,
} from '../src/modules/chrome';
import { waitForDevTools } from '../src/modules/chrome/waitDevTools';
import type { AppConfig } from '../src/modules/config/types';
import type { ChromeWindowMode } from '../src/modules/config/types';
import { createLogger } from '../src/modules/logger';

function baseConfig(
  chromeOverrides: {
    windowMode?: ChromeWindowMode;
    userDataDir?: string;
    windowWidth?: number;
    windowHeight?: number;
    windowPositionX?: number;
    windowPositionY?: number;
    deviceScaleFactor?: number;
  } = {}
): AppConfig {
  return {
    logLevel: 'info',
    chrome: {
      path: '/usr/bin/chrome',
      ...chromeOverrides,
    },
    obs: { path: '/usr/bin/obs' },
    idle: { port: 3000, viewsPath: './views' },
    telegram: {},
    watchdog: {},
  } as unknown as AppConfig;
}

describe('buildChromeArgs', () => {
  it('returns array with --remote-debugging-port and initial URL', () => {
    const config = baseConfig();
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(Array.isArray(args));
    assert.ok(args.includes('--remote-debugging-port=9222'));
    assert.ok(args.includes('http://localhost:3000/'));
  });

  it('chromeWindowMode kiosk: --kiosk present', () => {
    const config = baseConfig({ windowMode: 'kiosk' });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(args.includes('--kiosk'));
    assert.ok(args.includes('--remote-debugging-port=9222'));
  });

  it('chromeWindowMode fullscreen: --start-fullscreen at start', () => {
    const config = baseConfig({ windowMode: 'fullscreen' });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.strictEqual(args[0], '--start-fullscreen');
    assert.ok(args.includes('--remote-debugging-port=9222'));
  });

  it('chromeWindowMode app: URL only in --app=, not at end', () => {
    const config = baseConfig({ windowMode: 'app' });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(args.some((a) => a === '--app=http://localhost:3000/'));
    assert.strictEqual(args[args.length - 1], '--disable-default-apps');
    assert.ok(!args.includes('http://localhost:3000/'));
  });

  it('chromeWindowMode default: no kiosk/fullscreen/app prefix', () => {
    const config = baseConfig({ windowMode: 'default' });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.strictEqual(args[0], '--remote-debugging-port=9222');
    assert.ok(!args.includes('--kiosk'));
    assert.ok(!args.includes('--start-fullscreen'));
    assert.ok(!args.some((a) => a.startsWith('--app=')));
  });

  it('undefined chromeWindowMode defaults to default', () => {
    const config = baseConfig();
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.strictEqual(args[0], '--remote-debugging-port=9222');
  });

  it('chromeUserDataDir: adds --user-data-dir at start when set', () => {
    const config = baseConfig({ userDataDir: '/tmp/chrome-profile' });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.strictEqual(args[0], '--user-data-dir=/tmp/chrome-profile');
    assert.ok(args.includes('--remote-debugging-port=9222'));
  });

  it('chromeUserDataDir undefined: no --user-data-dir arg', () => {
    const config = baseConfig();
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(!args.some((a) => a.startsWith('--user-data-dir=')));
  });

  it('window size when both width and height set: adds --window-size=WIDTH,HEIGHT', () => {
    const config = baseConfig({ windowWidth: 1280, windowHeight: 720 });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(args.includes('--window-size=1280,720'));
  });

  it('window size not set: no --window-size arg', () => {
    const config = baseConfig();
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(!args.some((a) => a.startsWith('--window-size=')));
  });

  it('window size only width: no --window-size arg', () => {
    const config = baseConfig({ windowWidth: 1280 });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(!args.some((a) => a.startsWith('--window-size=')));
  });

  it('window position when both X and Y set: adds --window-position=X,Y', () => {
    const config = baseConfig({ windowPositionX: 100, windowPositionY: 200 });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(args.includes('--window-position=100,200'));
  });

  it('window position not set: no --window-position arg', () => {
    const config = baseConfig();
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(!args.some((a) => a.startsWith('--window-position=')));
  });

  it('window position only X: no --window-position arg', () => {
    const config = baseConfig({ windowPositionX: 50 });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(!args.some((a) => a.startsWith('--window-position=')));
  });

  it('window size and position together: both args present', () => {
    const config = baseConfig({
      windowWidth: 1920,
      windowHeight: 1080,
      windowPositionX: 100,
      windowPositionY: 200,
    });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(args.includes('--window-size=1920,1080'));
    assert.ok(args.includes('--window-position=100,200'));
  });

  it('window size/position with userDataDir and windowMode default: all expected args present', () => {
    const config = baseConfig({
      userDataDir: '/tmp/chrome-profile',
      windowMode: 'default',
      windowWidth: 800,
      windowHeight: 600,
      windowPositionX: 0,
      windowPositionY: 0,
    });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(args.includes('--user-data-dir=/tmp/chrome-profile'));
    assert.ok(args.includes('--window-size=800,600'));
    assert.ok(args.includes('--window-position=0,0'));
    assert.ok(args.includes('--remote-debugging-port=9222'));
  });

  it('deviceScaleFactor set: adds --force-device-scale-factor arg', () => {
    const config = baseConfig({ deviceScaleFactor: 1 });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(args.includes('--force-device-scale-factor=1'));
  });

  it('deviceScaleFactor 2: adds --force-device-scale-factor=2', () => {
    const config = baseConfig({ deviceScaleFactor: 2 });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(args.includes('--force-device-scale-factor=2'));
  });

  it('deviceScaleFactor undefined: no --force-device-scale-factor arg', () => {
    const config = baseConfig();
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(!args.some((a) => a.startsWith('--force-device-scale-factor=')));
  });

  it('kiosk mode: includes --noerrdialogs and --disable-infobars', () => {
    const config = baseConfig({ windowMode: 'kiosk' });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(args.includes('--noerrdialogs'));
    assert.ok(args.includes('--disable-infobars'));
  });

  it('fullscreen mode: does NOT include --noerrdialogs', () => {
    const config = baseConfig({ windowMode: 'fullscreen' });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(!args.includes('--noerrdialogs'));
    assert.ok(!args.includes('--disable-infobars'));
  });

  it('default mode: does NOT include --noerrdialogs', () => {
    const config = baseConfig({ windowMode: 'default' });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(!args.includes('--noerrdialogs'));
  });

  it('kiosk + deviceScaleFactor: all three extra flags present', () => {
    const config = baseConfig({ windowMode: 'kiosk', deviceScaleFactor: 1 });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(args.includes('--kiosk'));
    assert.ok(args.includes('--noerrdialogs'));
    assert.ok(args.includes('--disable-infobars'));
    assert.ok(args.includes('--force-device-scale-factor=1'));
  });

  it('initialUrl appears only as single arg (no shell injection); user URL never in spawn', () => {
    const config = baseConfig();
    const dangerousUrl = 'http://localhost:3000/"; echo pwned #';
    const args = buildChromeArgs(config, 9222, dangerousUrl);
    assert.ok(
      !args.some((a) => a === 'echo' || a === 'pwned' || a === ';'),
      'no shell payload as separate argv elements'
    );
    const last = args[args.length - 1];
    const hasApp = args.some((a) => a.startsWith('--app='));
    if (hasApp) {
      const appArg = args.find((a) => a.startsWith('--app='));
      assert.ok(appArg === `--app=${dangerousUrl}`, 'initialUrl only in --app=');
    } else {
      assert.strictEqual(last, dangerousUrl, 'initialUrl only as last element');
    }
  });
});

describe('waitForDevTools', () => {
  it('rejects with timeout message when port is not available', async () => {
    // Use a port that is very unlikely to have DevTools (e.g. 1 or a high port with short timeout)
    const port = 31999;
    const timeoutMs = 500;
    await assert.rejects(
      () => waitForDevTools(port, timeoutMs),
      /Chrome DevTools not ready within 500ms/
    );
  });
});

describe('lastUrlState', () => {
  it('writes and reads URL from file', async () => {
    const tmp = join(tmpdir(), `last-url-${Date.now()}`);
    await writeLastUrl(tmp, 'https://example.com');
    const read = await readLastUrl(tmp);
    assert.strictEqual(read, 'https://example.com');
  });

  it('returns null when file does not exist', async () => {
    const read = await readLastUrl('/nonexistent/path');
    assert.strictEqual(read, null);
  });

  it('overwrites previous value on write', async () => {
    const tmp = join(tmpdir(), `last-url-${Date.now()}`);
    await writeLastUrl(tmp, 'https://first.com');
    await writeLastUrl(tmp, 'https://second.com');
    const read = await readLastUrl(tmp);
    assert.strictEqual(read, 'https://second.com');
  });
});

describe('navigateToUrl', () => {
  it('throws when Chrome process is not running', async () => {
    const config = baseConfig();
    const logger = createLogger('info');
    await assert.rejects(
      () => navigateToUrl('http://example.com', { config, logger }),
      /Chrome is not running/
    );
  });
});

describe('isChromeAlive', () => {
  it('returns false when Chrome process is not running', () => {
    const config = baseConfig();
    assert.strictEqual(isChromeAlive(config), false);
  });
});
