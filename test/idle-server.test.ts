import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { startIdleServer } from '../src/modules/idle-server';
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
});
