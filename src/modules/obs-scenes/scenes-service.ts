/**
 * Implementation of ObsScenesService: delegates to OBS WebSocket client,
 * maps errors to SceneNotFoundError, logs in key=value format.
 */

import type { Logger } from '../logger';
import type { ObsWebSocketClient } from './client';
import type { ObsScenesService, SceneConfigEntry, SceneForDisplay } from './types';
import { SceneNotFoundError } from './types';

export interface ObsScenesServiceConfig {
  client: ObsWebSocketClient;
  logger: Logger;
  scenesConfig?: SceneConfigEntry[] | null;
  outputSceneName?: string | null;
}

export function createObsScenesServiceImpl(config: ObsScenesServiceConfig): ObsScenesService {
  const { client, logger } = config;

  async function getNestedSceneItems(outputSceneName: string) {
    const { sceneItems } = await client.getSceneItemList(outputSceneName);
    return sceneItems.filter((item) => item.sourceType === 'OBS_SOURCE_TYPE_SCENE');
  }

  function isSwitchableScene(entry: SceneConfigEntry | undefined): boolean {
    if (entry?.enabled === false) return false;
    if (!entry?.type) return true;
    if (entry.type === 'main') return false;
    return true;
  }

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

    async getScenesForDisplay(): Promise<SceneForDisplay[]> {
      try {
        const { scenes } = await client.getSceneList();
        const names = scenes.map((s) => s.sceneName).filter(Boolean);
        const configMap = new Map((config.scenesConfig ?? []).map((e) => [e.name, e]));
        const result: SceneForDisplay[] = [];

        for (const name of names) {
          const entry = configMap.get(name);
          if (!isSwitchableScene(entry)) continue;

          const out: SceneForDisplay = { name, enabled: entry?.enabled ?? true };
          if (entry?.title !== undefined) out.title = entry.title;
          if (entry?.type !== undefined) out.type = entry.type;
          result.push(out);
        }

        return result;
      } catch (err) {
        logger.warn(`obs_scenes action=get_scenes_for_display error=${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    },

    async getCurrentScene(): Promise<string | null> {
      const { outputSceneName } = config;
      if (!outputSceneName) {
        logger.warn('obs_scenes action=get_current status=skip reason=output_scene_not_configured');
        return null;
      }
      try {
        const items = await getNestedSceneItems(outputSceneName);
        const enabled = items.find((item) => item.sceneItemEnabled);
        return enabled?.sourceName ?? null;
      } catch (err) {
        logger.warn(`obs_scenes action=get_current error=${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },

    async setScene(name: string): Promise<void> {
      const { outputSceneName } = config;
      if (!outputSceneName) {
        throw new Error('OBS output scene not configured (OBS_OUTPUT_SCENE_NAME is not set)');
      }
      try {
        const items = await getNestedSceneItems(outputSceneName);
        const target = items.find((item) => item.sourceName === name);
        if (!target) {
          throw new SceneNotFoundError(name, `Scene not found: ${name}`);
        }
        for (const item of items) {
          await client.setSceneItemEnabled(outputSceneName, item.sceneItemId, item.sourceName === name);
        }
        logger.info(`scene_switch to=${name} success=true`);
      } catch (err) {
        if (err instanceof SceneNotFoundError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`scene_switch to=${name} success=false error=${msg}`);
        throw err;
      }
    },

    async disconnect(): Promise<void> {
      await client.disconnect();
    },

    isConnected(): boolean {
      return client.isConnected();
    },
  };
}
