import express from 'express';
import * as http from 'http';
import type { AppConfig } from '../config/types';

/**
 * Start the idle HTTP server (Express + EJS). Resolves when listening.
 */
export function startIdleServer(config: AppConfig): Promise<http.Server> {
  const app = express();
  app.set('views', config.idleViewsPath);
  app.set('view engine', 'ejs');
  app.get('/', (_req, res) => res.render('idle'));

  return new Promise((resolve) => {
    const server = app.listen(config.idlePort, () => resolve(server));
  });
}
