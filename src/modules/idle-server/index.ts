import express from 'express';
import * as http from 'http';
import type { AppConfig } from '../config/types';
import type { ObsScenesService } from '../obs-scenes/types';
import { SceneNotFoundError } from '../obs-scenes/types';
import type { Logger } from '../logger';

let healthChecker: (() => { chrome: boolean; obs: boolean }) | null = null;
let obsScenes: ObsScenesService | null = null;
let logger: Logger | null = null;

export function setHealthChecker(fn: (() => { chrome: boolean; obs: boolean }) | null): void {
  healthChecker = fn;
}

export function setObsScenesService(service: ObsScenesService | null, log?: Logger): void {
  obsScenes = service;
  if (log) logger = log;
}

async function handleSceneSwitch(
  sceneName: string,
  res: express.Response
): Promise<void> {
  if (!obsScenes) {
    res.status(503).json({ error: 'OBS scenes service not available' });
    return;
  }
  try {
    await obsScenes.setScene(sceneName);
    logger?.info(`scene_switch source=web scene=${sceneName} success=true`);
    res.status(200).json({ ok: true, scene: sceneName });
  } catch (err) {
    if (err instanceof SceneNotFoundError) {
      logger?.warn(`scene_switch source=web scene=${sceneName} success=false error=not_found`);
      res.status(404).json({ error: `Scene not found: ${sceneName}` });
    } else {
      logger?.error(`scene_switch source=web scene=${sceneName} success=false error=obs_unavailable`);
      res.status(503).json({ error: 'OBS not available' });
    }
  }
}

/**
 * Start the idle HTTP server (Express + EJS). Resolves when listening.
 */
export function startIdleServer(config: AppConfig): Promise<http.Server> {
  const app = express();
  app.set('views', config.idle.viewsPath);
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

  app.get('/obs/scenes', async (_req, res) => {
    if (!obsScenes) {
      return res.render('obs-scenes', {
        connected: false,
        currentScene: null,
        scenes: [],
      });
    }
    const connected = obsScenes.isConnected();
    const [currentScene, scenes] = await Promise.all([
      obsScenes.getCurrentScene(),
      obsScenes.getScenesForDisplay(),
    ]);
    res.render('obs-scenes', { connected, currentScene, scenes });
  });

  app.use(express.json());

  app.post('/obs/scene', async (req, res) => {
    const { scene } = req.body ?? {};
    if (typeof scene !== 'string' || !scene) {
      res.status(400).json({ error: 'Missing or invalid field: scene' });
      return;
    }
    await handleSceneSwitch(scene, res);
  });

  app.post('/obs/scene/backup', async (_req, res) => {
    await handleSceneSwitch('backup', res);
  });

  app.post('/obs/scene/default', async (_req, res) => {
    await handleSceneSwitch('default', res);
  });

  return new Promise((resolve) => {
    const server = app.listen(config.idle.port, () => resolve(server));
  });
}
