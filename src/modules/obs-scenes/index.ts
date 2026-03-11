/**
 * OBS Scenes module: factory and exports.
 * If OBS WebSocket config (host, port, password) is set, creates service and connects in background.
 * Does not block startup on connection success.
 */

import type { ObsConfig } from '../config/types';
import { isObsScenesEnabled } from '../config';
import type { Logger } from '../logger';
import { createObsWebSocketClient } from './client';
import { createObsScenesServiceImpl } from './scenes-service';
import type { ObsScenesService } from './types';

export type { ObsScenesService } from './types';
export { SceneNotFoundError } from './types';
export { isObsScenesEnabled } from '../config';

/**
 * Create OBS Scenes service if WebSocket config is enabled (host, port, password set).
 * Starts connection in background; does not wait for OBS to be available.
 * Returns null if config is not set.
 */
export function createObsScenesService(config: ObsConfig, logger: Logger): ObsScenesService | null {
  if (!isObsScenesEnabled(config) || config.host == null || config.port == null || config.password === undefined) {
    return null;
  }
  const client = createObsWebSocketClient({
    host: config.host,
    port: config.port,
    password: config.password,
    logger,
  });
  client.connect();
  return createObsScenesServiceImpl({ client, logger });
}
