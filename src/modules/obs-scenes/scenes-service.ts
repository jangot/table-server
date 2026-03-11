/**
 * Implementation of ObsScenesService: delegates to OBS WebSocket client,
 * maps errors to SceneNotFoundError, logs in key=value format.
 */

import type { Logger } from '../logger';
import type { ObsWebSocketClient } from './client';
import type { ObsScenesService } from './types';
import { SceneNotFoundError } from './types';

export interface ObsScenesServiceConfig {
  client: ObsWebSocketClient;
  logger: Logger;
}

export function createObsScenesServiceImpl(config: ObsScenesServiceConfig): ObsScenesService {
  const { client, logger } = config;

  return {
    async getScenes(): Promise<string[]> {
      try {
        const { scenes } = await client.getSceneList();
        return scenes.map((s) => s.sceneName).filter(Boolean);
      } catch (err) {
        logger.warn(`obs_scenes action=get_scenes error=${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    },

    async getCurrentScene(): Promise<string | null> {
      try {
        const { sceneName } = await client.getCurrentProgramScene();
        return sceneName || null;
      } catch (err) {
        logger.warn(`obs_scenes action=get_current error=${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },

    async setScene(name: string): Promise<void> {
      try {
        await client.setCurrentProgramScene(name);
        logger.info(`scene_switch to=${name} success=true`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isNotFound =
          /scene.*not found|does not exist|invalid.*scene/i.test(msg) ||
          (err as { code?: number }).code === 100; // common "resource not found" code
        if (isNotFound) {
          throw new SceneNotFoundError(name, `Scene not found: ${name}`);
        }
        logger.error(`scene_switch to=${name} success=false error=${msg}`);
        throw err;
      }
    },
  };
}
