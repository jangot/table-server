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

  async function findNestedSceneSource(outputSceneName: string): Promise<string> {
    const { sceneItems } = await client.getSceneItemList(outputSceneName);
    const sceneSource = sceneItems.find((item) => item.inputKind === 'scene');
    if (!sceneSource) {
      throw new Error(`No nested scene source found in output scene "${outputSceneName}"`);
    }
    return sceneSource.sourceName;
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
        const sourceName = await findNestedSceneSource(outputSceneName);
        const { inputSettings } = await client.getInputSettings(sourceName);
        const sceneName = inputSettings['scene'] as string | undefined;
        return sceneName || null;
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
        const sourceName = await findNestedSceneSource(outputSceneName);
        await client.setInputSettings(sourceName, { scene: name });
        logger.info(`scene_switch to=${name} success=true`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isNotFound =
          /scene.*not found|does not exist|invalid.*scene/i.test(msg) ||
          (err as { code?: number }).code === 100;
        if (isNotFound) {
          throw new SceneNotFoundError(name, `Scene not found: ${name}`);
        }
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
