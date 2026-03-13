/**
 * OBS Scenes module: factory and exports.
 * If OBS WebSocket config (host, port, password) is set, creates service and connects in background.
 * Does not block startup on connection success.
 */

import type { ObsConfig } from '../config/types';
import type { Logger } from '../logger';
import { createObsWebSocketClient } from './client';
import type { ObsWebSocketClient } from './client';
import { createObsScenesServiceImpl } from './scenes-service';
import { loadScenesConfigSync } from './scenes-config';
import type { ObsScenesService } from './types';

export type { ObsScenesService, SceneConfigEntry, SceneForDisplay } from './types';
export { SceneNotFoundError } from './types';

/**
 * Create OBS Scenes service.
 * Starts connection in background; does not wait for OBS to be available.
 * Optional scenesConfigPath loads JSON config for UI enrichment (title, type, enabled).
 */
export function createObsScenesService(
  config: ObsConfig,
  logger: Logger,
  scenesConfigPath?: string
): ObsScenesService {
  const { projectorMonitorName, projectorSceneName } = config;

  // eslint-disable-next-line prefer-const
  let client: ObsWebSocketClient;

  const onConnected =
    projectorMonitorName != null
      ? async () => {
          let monitors: Array<{ monitorIndex: number; monitorName: string }>;
          try {
            ({ monitors } = await client.getMonitorList());
          } catch (err) {
            logger.warn(`obs_projector action=get_monitors error=${err instanceof Error ? err.message : String(err)}`);
            return;
          }

          const monitor = monitors.find(
            (m) => m.monitorName === projectorMonitorName || m.monitorName.startsWith(`${projectorMonitorName}(`)
          );
          if (!monitor) {
            logger.warn(`obs_projector action=open status=skip reason=monitor_not_found name=${projectorMonitorName}`);
            return;
          }

          let scenes: Array<{ sceneName: string }>;
          try {
            ({ scenes } = await client.getSceneList());
          } catch (err) {
            logger.warn(`obs_projector action=get_scenes error=${err instanceof Error ? err.message : String(err)}`);
            return;
          }
          if (scenes.length === 0) {
            logger.warn('obs_projector action=open status=skip reason=empty_scene_list');
            return;
          }

          let projectorScene =
            projectorSceneName != null
              ? scenes.find((s) => s.sceneName === projectorSceneName) ?? null
              : null;

          if (!projectorScene) {
            projectorScene = scenes.find((s) => s.sceneName.startsWith('output.')) ?? null;
            if (!projectorScene) {
              logger.warn(
                `obs_projector action=open status=skip reason=scene_not_found projectorSceneName=${projectorSceneName ?? ''}`
              );
              return;
            }
            logger.warn(
              `obs_projector action=open status=fallback reason=projector_scene_not_found fallback_scene=${projectorScene.sceneName}`
            );
          }

          await client.openSourceProjector(projectorScene.sceneName, monitor.monitorIndex);
          logger.info(
            `obs_projector action=open scene=${projectorScene.sceneName} monitor_name=${projectorMonitorName} monitor_index=${monitor.monitorIndex}`
          );
        }
      : undefined;

  client = createObsWebSocketClient({
    host: config.host,
    port: config.port,
    password: config.password,
    logger,
    onConnected,
  });
  client.connect();
  const scenesConfig = loadScenesConfigSync(scenesConfigPath);
  return createObsScenesServiceImpl({ client, logger, scenesConfig });
}
