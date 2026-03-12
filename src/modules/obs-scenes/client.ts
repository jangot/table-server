/**
 * OBS WebSocket client: connect, disconnect, reconnect on connection loss.
 * Logs in key=value format. Does not throw on startup if OBS is unavailable — reconnects in background.
 */

import type { Logger } from '../logger';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { OBSWebSocket } = require('obs-websocket-js') as { OBSWebSocket: new () => ObsSocketInstance };

interface ObsSocketInstance {
  connect(url: string, password?: string): Promise<unknown>;
  disconnect(): Promise<void>;
  call(method: string, data?: unknown): Promise<unknown>;
  on(event: string, cb: (err?: Error) => void): void;
  identified?: boolean;
}

const DEFAULT_RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 60000;

export interface ObsWebSocketClientConfig {
  host: string;
  port: number;
  password: string;
  logger: Logger;
  onConnected?: () => Promise<void>;
}

export interface ObsWebSocketClient {
  connect(): void;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getSceneList(): Promise<{ scenes: Array<{ sceneName: string }> }>;
  getCurrentProgramScene(): Promise<{ sceneName: string }>;
  setCurrentProgramScene(sceneName: string): Promise<void>;
  openSourceProjector(sourceName: string, monitorIndex: number): Promise<void>;
}

export function createObsWebSocketClient(config: ObsWebSocketClientConfig): ObsWebSocketClient {
  const { host, port, password, logger, onConnected } = config;
  const url = `ws://${host}:${port}`;
  let obs: ObsSocketInstance | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
  let isFirstConnection = true;
  let disconnected = false;

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect(): void {
    if (disconnected) return;
    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      tryConnect();
    }, reconnectDelayMs);
    logger.info(`obs_connection status=reconnecting delay_ms=${reconnectDelayMs}`);
    reconnectDelayMs = Math.min(MAX_RECONNECT_DELAY_MS, reconnectDelayMs * 2);
  }

  function tryConnect(): void {
    if (disconnected || !host || port == null) return;
    const socket = new OBSWebSocket();
    obs = socket;

    socket.on('ConnectionClosed', (err?: Error) => {
      obs = null;
      logger.warn(`obs_connection status=disconnected reason=${err?.message ?? 'unknown'}`);
      scheduleReconnect();
    });

    socket.on('ConnectionError', (err?: Error) => {
      logger.warn(`obs_connection status=error message=${err?.message ?? 'unknown'}`);
    });

    socket
      .connect(url, password)
      .then(() => {
        if (disconnected) {
          void socket.disconnect().catch(() => {});
          return;
        }
        reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
        if (isFirstConnection) {
          logger.info('obs_connection status=connected');
          isFirstConnection = false;
        } else {
          logger.info('obs_connection status=reconnected');
        }
        if (onConnected) {
          void onConnected().catch((err: Error) => {
            logger.warn(`obs_connection on_connected_error=${err?.message ?? 'unknown'}`);
          });
        }
      })
      .catch((err: Error) => {
        obs = null;
        logger.warn(`obs_connection status=connect_failed message=${err?.message ?? 'unknown'}`);
        scheduleReconnect();
      });
  }

  return {
    connect(): void {
      disconnected = false;
      tryConnect();
    },

    async disconnect(): Promise<void> {
      disconnected = true;
      clearReconnectTimer();
      if (obs) {
        const socket = obs;
        obs = null;
        await socket.disconnect().catch(() => {});
      }
    },

    isConnected(): boolean {
      return obs != null && obs.identified === true;
    },

    async getSceneList(): Promise<{ scenes: Array<{ sceneName: string }> }> {
      if (!obs) throw new Error('OBS WebSocket not connected');
      const res = await obs.call('GetSceneList');
      logger.info(`obs_scenes action=get_scene_list response=${JSON.stringify(res)}`);
      const scenes = (res as { scenes?: unknown[] }).scenes ?? [];
      return {
        scenes: scenes.map((s: unknown) => ({
          sceneName: (s as { sceneName?: string }).sceneName ?? '',
        })),
      };
    },

    async getCurrentProgramScene(): Promise<{ sceneName: string }> {
      if (!obs) throw new Error('OBS WebSocket not connected');
      const res = await obs.call('GetCurrentProgramScene');
      return { sceneName: (res as { currentProgramSceneName?: string }).currentProgramSceneName ?? '' };
    },

    async setCurrentProgramScene(sceneName: string): Promise<void> {
      if (!obs) throw new Error('OBS WebSocket not connected');
      await obs.call('SetCurrentProgramScene', { sceneName });
    },

    async openSourceProjector(sourceName: string, monitorIndex: number): Promise<void> {
      if (!obs) throw new Error('OBS WebSocket not connected');
      await obs.call('OpenSourceProjector', {
        sourceName,
        projectorType: 'Source',
        monitorIndex,
      });
    },
  };
}
