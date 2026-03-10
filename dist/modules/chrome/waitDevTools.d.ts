/**
 * Poll Chrome DevTools endpoint until it responds with 200 or timeout.
 * Network errors (ECONNREFUSED etc.) are treated as "not ready" and retried.
 */
export declare function waitForDevTools(port: number, timeoutMs: number): Promise<void>;
//# sourceMappingURL=waitDevTools.d.ts.map