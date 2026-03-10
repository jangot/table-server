import express from 'express';
import * as http from 'http';
import type { AppConfig } from '../config/types';

let healthChecker: (() => { chrome: boolean; obs: boolean }) | null = null;

export function setHealthChecker(fn: (() => { chrome: boolean; obs: boolean }) | null): void {
  healthChecker = fn;
}

/**
 * Start the idle HTTP server (Express + EJS). Resolves when listening.
 */
export function startIdleServer(config: AppConfig): Promise<http.Server> {
  const app = express();
  app.set('views', config.idleViewsPath);
  app.set('view engine', 'ejs');
  app.get('/', (_req, res) => res.render('idle'));

  app.get('/health', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (!healthChecker) {
      return res.status(200).json({ ready: false, chrome: false, obs: false });
    }
    const { chrome, obs } = healthChecker();
    res.status(200).json({ ready: chrome && obs, chrome, obs });
  });

  return new Promise((resolve) => {
    const server = app.listen(config.idlePort, () => resolve(server));
  });
}
