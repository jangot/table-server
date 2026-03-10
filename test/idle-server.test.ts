import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { startIdleServer, setHealthChecker } from '../src/modules/idle-server';
import type { AppConfig } from '../src/modules/config/types';
import * as path from 'node:path';

describe('idle-server', () => {
  let server: http.Server;
  const testPort = 34567;
  const config: AppConfig = {
    chromePath: '/usr/bin/chrome',
    obsPath: '/usr/bin/obs',
    idlePort: testPort,
    idleViewsPath: path.join(process.cwd(), 'views'),
    logLevel: 'info',
  };

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
});
