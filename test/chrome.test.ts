import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildChromeArgs } from '../src/modules/chrome/args';
import { waitForDevTools } from '../src/modules/chrome/waitDevTools';
import type { AppConfig } from '../src/modules/config/types';

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    chromePath: '/usr/bin/chrome',
    obsPath: '/usr/bin/obs',
    idlePort: 3000,
    idleViewsPath: './views',
    logLevel: 'info',
    ...overrides,
  };
}

describe('buildChromeArgs', () => {
  it('returns array with --remote-debugging-port and initial URL', () => {
    const config = baseConfig();
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(Array.isArray(args));
    assert.ok(args.includes('--remote-debugging-port=9222'));
    assert.ok(args.includes('http://localhost:3000/'));
  });

  it('chromeWindowMode kiosk: --kiosk at start', () => {
    const config = baseConfig({ chromeWindowMode: 'kiosk' });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.strictEqual(args[0], '--kiosk');
    assert.ok(args.includes('--remote-debugging-port=9222'));
  });

  it('chromeWindowMode fullscreen: --start-fullscreen at start', () => {
    const config = baseConfig({ chromeWindowMode: 'fullscreen' });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.strictEqual(args[0], '--start-fullscreen');
    assert.ok(args.includes('--remote-debugging-port=9222'));
  });

  it('chromeWindowMode app: URL only in --app=, not at end', () => {
    const config = baseConfig({ chromeWindowMode: 'app' });
    const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
    assert.ok(args.some((a) => a === '--app=http://localhost:3000/'));
    assert.strictEqual(args[args.length - 1], '--disable-default-apps');
    assert.ok(!args.includes('http://localhost:3000/'));
  });

  it('chromeWindowMode default: no kiosk/fullscreen/app prefix', () => {
    const config = baseConfig({ chromeWindowMode: 'default' });
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
