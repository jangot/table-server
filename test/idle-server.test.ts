import 'reflect-metadata';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { startIdleServer, setHealthChecker, setObsScenesService } from '../src/modules/idle-server';
import { SceneNotFoundError } from '../src/modules/obs-scenes/types';
import type { ObsScenesService } from '../src/modules/obs-scenes/types';
import type { AppConfig } from '../src/modules/config/types';
import * as path from 'node:path';

function getHtml(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString('utf8') })
      );
    });
    req.on('error', reject);
  });
}

function postJson(port: number, path: string, body?: object): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : '';
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

describe('idle-server', () => {
  let server: http.Server;
  const testPort = 34567;
  const config: AppConfig = {
    logLevel: 'info',
    chrome: { path: '/usr/bin/chrome' },
    obs: { path: '/usr/bin/obs' },
    idle: { port: testPort, viewsPath: path.join(process.cwd(), 'views') },
    telegram: {},
    watchdog: {},
  } as unknown as AppConfig;

  before(async () => {
    server = await startIdleServer(config);
  });

  after(() => {
    server.close();
  });

  it('GET / returns 200 and HTML with Waiting', () => {
    return new Promise<void>((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${testPort}/`,
        (res) => {
          assert.strictEqual(res.statusCode, 200);
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            assert.ok(body.includes('Waiting'), 'Response should contain Waiting');
            resolve();
          });
        }
      );
      req.on('error', reject);
    });
  });

  it('GET /health without health checker returns 200 and ready: false', () => {
    setHealthChecker(null);
    return new Promise<void>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${testPort}/health`, (res) => {
        assert.strictEqual(res.statusCode, 200);
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          assert.strictEqual(body.ready, false);
          assert.strictEqual(body.chrome, false);
          assert.strictEqual(body.obs, false);
          resolve();
        });
      });
      req.on('error', reject);
    });
  });

  it('GET /health with health checker returns chrome and obs state', async () => {
    setHealthChecker(() => ({ chrome: true, obs: true }));
    const body1 = await new Promise<{ ready: boolean; chrome: boolean; obs: boolean }>(
      (resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${testPort}/health`, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () =>
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          );
        });
        req.on('error', reject);
      }
    );
    assert.strictEqual(body1.ready, true);
    assert.strictEqual(body1.chrome, true);
    assert.strictEqual(body1.obs, true);

    setHealthChecker(() => ({ chrome: true, obs: false }));
    const body2 = await new Promise<{ ready: boolean; chrome: boolean; obs: boolean }>(
      (resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${testPort}/health`, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () =>
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          );
        });
        req.on('error', reject);
      }
    );
    assert.strictEqual(body2.ready, false);
    assert.strictEqual(body2.chrome, true);
    assert.strictEqual(body2.obs, false);
  });

  describe('OBS scene API', () => {
    let mockService: ObsScenesService;

    beforeEach(() => {
      mockService = {
        getScenes: async () => [],
        getScenesForDisplay: async () => [],
        getCurrentScene: async () => null,
        setScene: async () => {},
        disconnect: async () => {},
        isConnected: () => true,
      };
      setObsScenesService(mockService);
    });

    afterEach(() => {
      setObsScenesService(null);
    });

    it('POST /obs/scene returns 200 on success', async () => {
      const result = await postJson(testPort, '/obs/scene', { scene: 'chrome' });
      assert.strictEqual(result.status, 200);
      assert.deepStrictEqual(result.body, { ok: true, scene: 'chrome' });
    });

    it('POST /obs/scene returns 400 when scene field missing', async () => {
      const result = await postJson(testPort, '/obs/scene', {});
      assert.strictEqual(result.status, 400);
    });

    it('POST /obs/scene returns 400 when scene is empty string', async () => {
      const result = await postJson(testPort, '/obs/scene', { scene: '' });
      assert.strictEqual(result.status, 400);
    });

    it('POST /obs/scene returns 404 on SceneNotFoundError', async () => {
      mockService.setScene = async () => { throw new SceneNotFoundError('chrome'); };
      const result = await postJson(testPort, '/obs/scene', { scene: 'chrome' });
      assert.strictEqual(result.status, 404);
    });

    it('POST /obs/scene returns 503 on OBS connection error', async () => {
      mockService.setScene = async () => { throw new Error('OBS WebSocket not connected'); };
      const result = await postJson(testPort, '/obs/scene', { scene: 'chrome' });
      assert.strictEqual(result.status, 503);
    });

    it('POST /obs/scene returns 503 when service not set', async () => {
      setObsScenesService(null);
      const result = await postJson(testPort, '/obs/scene', { scene: 'chrome' });
      assert.strictEqual(result.status, 503);
    });

    it('POST /obs/scene/backup returns 200 and calls setScene("backup")', async () => {
      let called = '';
      mockService.setScene = async (name) => { called = name; };
      const result = await postJson(testPort, '/obs/scene/backup');
      assert.strictEqual(result.status, 200);
      assert.strictEqual(called, 'backup');
    });

    it('POST /obs/scene/default returns 200 and calls setScene("default")', async () => {
      let called = '';
      mockService.setScene = async (name) => { called = name; };
      const result = await postJson(testPort, '/obs/scene/default');
      assert.strictEqual(result.status, 200);
      assert.strictEqual(called, 'default');
    });

    it('GET /obs/scenes returns 200 and shows connected when service connected', async () => {
      mockService.isConnected = () => true;
      mockService.getCurrentScene = async () => 'chrome';
      mockService.getScenesForDisplay = async () => [
        { name: 'chrome', title: 'Chrome', enabled: true },
        { name: 'backup', enabled: true },
      ];
      const result = await getHtml(testPort, '/obs/scenes');
      assert.strictEqual(result.status, 200);
      assert.ok(result.body.includes('connected'));
      assert.ok(result.body.includes('Chrome'));
      assert.ok(result.body.includes('chrome')); // currentScene
    });

    it('GET /obs/scenes returns 200 and shows disconnected when service not connected', async () => {
      mockService.isConnected = () => false;
      const result = await getHtml(testPort, '/obs/scenes');
      assert.strictEqual(result.status, 200);
      assert.ok(result.body.includes('disconnected'));
    });

    it('GET /obs/scenes returns 200 with disconnected when obsScenes is null', async () => {
      setObsScenesService(null);
      const result = await getHtml(testPort, '/obs/scenes');
      assert.strictEqual(result.status, 200);
      assert.ok(result.body.includes('disconnected'));
    });

    it('GET /obs/scenes does not show disabled scenes as buttons', async () => {
      mockService.isConnected = () => true;
      mockService.getCurrentScene = async () => null;
      mockService.getScenesForDisplay = async () => [
        { name: 'visible', enabled: true },
        { name: 'hidden', enabled: false },
      ];
      const result = await getHtml(testPort, '/obs/scenes');
      assert.ok(result.body.includes('visible'));
      assert.ok(!result.body.includes('>hidden<'));  // disabled scene is not a button
    });
  });
});
