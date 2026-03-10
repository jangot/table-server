import * as http from 'node:http';

/**
 * Poll Chrome DevTools endpoint until it responds with 200 or timeout.
 * Network errors (ECONNREFUSED etc.) are treated as "not ready" and retried.
 */
export function waitForDevTools(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  const intervalMs = 250;

  return new Promise((resolve, reject) => {
    function tick(): void {
      if (Date.now() - start >= timeoutMs) {
        reject(new Error(`Chrome DevTools not ready within ${timeoutMs}ms`));
        return;
      }
      const req = http.get(
        `http://127.0.0.1:${port}/json/version`,
        (res) => {
          if (res.statusCode === 200) {
            res.resume(); // consume body so connection can close
            resolve();
            return;
          }
          setTimeout(tick, intervalMs);
        }
      );
      req.on('error', () => setTimeout(tick, intervalMs));
      req.end();
    }
    tick();
  });
}
