import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Logger } from '../src/modules/logger';
import {
  createObsScenesService,
  SceneNotFoundError,
} from '../src/modules/obs-scenes';
import { createObsScenesServiceImpl } from '../src/modules/obs-scenes/scenes-service';
import type { ObsWebSocketClient } from '../src/modules/obs-scenes/client';
import type { ObsConfig } from '../src/modules/config/types';

function createMockLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info(msg: string) {
      lines.push(`info: ${msg}`);
    },
    warn(msg: string) {
      lines.push(`warn: ${msg}`);
    },
    error(msg: string) {
      lines.push(`error: ${msg}`);
    },
    debug(msg: string) {
      lines.push(`debug: ${msg}`);
    },
  };
}

function createMockClient(overrides?: Partial<ObsWebSocketClient>): ObsWebSocketClient {
  return {
    connect() {},
    async disconnect() {},
    isConnected: () => true,
    async getSceneList() {
      return { scenes: [{ sceneName: 'Scene 1' }, { sceneName: 'Scene 2' }] };
    },
    async getCurrentProgramScene() {
      return { sceneName: 'Scene 1' };
    },
    // Signature must match ObsWebSocketClient; param unused in default mock
    async setCurrentProgramScene(name: string) {
      void name;
    },
    async openSourceProjector(sourceName: string, monitorIndex: number) {
      void sourceName; void monitorIndex;
    },
    async getMonitorList() {
      return { monitors: [] };
    },
    async getSceneItemList() {
      return {
        sceneItems: [
          { sourceName: 'scene-source', inputKind: null, sourceType: 'OBS_SOURCE_TYPE_SCENE', sceneItemId: 1, sceneItemEnabled: true },
        ],
      };
    },
    async setSceneItemEnabled() {},
    async getInputSettings() {
      return { inputSettings: { scene: 'Scene 1' } };
    },
    async setInputSettings() {},
    ...overrides,
  };
}

describe('obs-scenes', () => {
  let logger: ReturnType<typeof createMockLogger>;

  before(() => {
    logger = createMockLogger();
  });

  after(() => {
    logger.lines.length = 0;
  });

  describe('createObsScenesService', () => {
    let createdService: ReturnType<typeof createObsScenesService> | undefined;

    after(async () => {
      if (createdService) {
        await createdService.disconnect();
        createdService = undefined;
      }
    });

    it('returns service with getScenes, getCurrentScene, setScene, getScenesForDisplay when config is set', () => {
      const config: ObsConfig = {
        path: '/usr/bin/obs',
        configDir: '/tmp/obs-config',
        host: 'localhost',
        port: 4455,
        password: 'secret',
      };
      const result = createObsScenesService(config, logger as unknown as Logger);
      createdService = result;
      assert.strictEqual(typeof result.getScenes, 'function');
      assert.strictEqual(typeof result.getCurrentScene, 'function');
      assert.strictEqual(typeof result.setScene, 'function');
      assert.strictEqual(typeof result.getScenesForDisplay, 'function');
    });

    it('createObsScenesService передаёт outputSceneName в сервис', () => {
      const config: ObsConfig = {
        path: '/usr/bin/obs',
        configDir: '/tmp/obs-config',
        host: 'localhost',
        port: 4455,
        password: 'secret',
        outputSceneName: 'output.main',
      };
      const result = createObsScenesService(config, logger as unknown as Logger);
      createdService = result;
      assert.strictEqual(typeof result.setScene, 'function');
    });
  });

  describe('ObsScenesServiceImpl', () => {
    it('getScenes returns scene names from client', async () => {
      const client = createMockClient();
      const service = createObsScenesServiceImpl({ client, logger: logger as unknown as Logger });
      const scenes = await service.getScenes();
      assert.deepStrictEqual(scenes, ['Scene 1', 'Scene 2']);
    });

    it('getCurrentScene returns enabled scene name', async () => {
      const client = createMockClient();
      const service = createObsScenesServiceImpl({
        client,
        logger: logger as unknown as Logger,
        outputSceneName: 'output.main',
      });
      const current = await service.getCurrentScene();
      assert.strictEqual(current, 'scene-source');
    });

    it('setScene succeeds and logs key=value', async () => {
      const client = createMockClient();
      const service = createObsScenesServiceImpl({
        client,
        logger: logger as unknown as Logger,
        outputSceneName: 'output.main',
      });
      await service.setScene('scene-source');
      const logLine = logger.lines.find((l) => l.includes('scene_switch'));
      assert.ok(logLine);
      assert.ok(logLine!.includes('to=scene-source'));
      assert.ok(logLine!.includes('success=true'));
    });

    it('setScene with nonexistent scene rejects with SceneNotFoundError', async () => {
      const client = createMockClient({
        async setInputSettings() {
          throw new Error('Scene "nonexistent" does not exist');
        },
      });
      const service = createObsScenesServiceImpl({
        client,
        logger: logger as unknown as Logger,
        outputSceneName: 'output.main',
      });
      await assert.rejects(
        () => service.setScene('nonexistent'),
        (err: unknown) => {
          return err instanceof SceneNotFoundError && err.sceneName === 'nonexistent';
        }
      );
    });

    it('getScenes returns empty array when client throws', async () => {
      const client = createMockClient({
        async getSceneList() {
          throw new Error('OBS WebSocket not connected');
        },
      });
      const service = createObsScenesServiceImpl({ client, logger: logger as unknown as Logger });
      const scenes = await service.getScenes();
      assert.deepStrictEqual(scenes, []);
      const warnLine = logger.lines.find((l) => l.includes('action=get_scenes'));
      assert.ok(warnLine);
    });

    it('getCurrentScene returns null when client throws', async () => {
      const client = createMockClient({
        async getSceneItemList() {
          throw new Error('OBS WebSocket not connected');
        },
      });
      const service = createObsScenesServiceImpl({
        client,
        logger: logger as unknown as Logger,
        outputSceneName: 'output.main',
      });
      const current = await service.getCurrentScene();
      assert.strictEqual(current, null);
      const warnLine = logger.lines.find((l) => l.includes('action=get_current'));
      assert.ok(warnLine);
    });

    it('getScenesForDisplay without config returns names from OBS with enabled true', async () => {
      const client = createMockClient();
      const service = createObsScenesServiceImpl({
        client,
        logger: logger as unknown as Logger,
        scenesConfig: null,
      });
      const display = await service.getScenesForDisplay();
      assert.deepStrictEqual(display, [
        { name: 'Scene 1', enabled: true },
        { name: 'Scene 2', enabled: true },
      ]);
    });

    it('getScenesForDisplay with config enriches scenes from config and filters non-switchable', async () => {
      const client = createMockClient();
      const scenesConfig = [
        { name: 'Scene 1', title: 'First Scene', type: 'main', enabled: true },
      ];
      const service = createObsScenesServiceImpl({
        client,
        logger: logger as unknown as Logger,
        scenesConfig,
      });
      const display = await service.getScenesForDisplay();
      assert.deepStrictEqual(display, [
        { name: 'Scene 2', enabled: true },
      ]);
    });

    it('getScenesForDisplay returns empty array when client throws', async () => {
      const client = createMockClient({
        async getSceneList() {
          throw new Error('OBS WebSocket not connected');
        },
      });
      const service = createObsScenesServiceImpl({ client, logger: logger as unknown as Logger });
      const display = await service.getScenesForDisplay();
      assert.deepStrictEqual(display, []);
      const warnLine = logger.lines.find((l) => l.includes('action=get_scenes_for_display'));
      assert.ok(warnLine);
    });
  });

  describe('openSourceProjector logic (по имени монитора)', () => {
    it('открывает проектор при совпадении имени монитора', async () => {
      const calls: Array<{ sourceName: string; monitorIndex: number }> = [];
      const client = createMockClient({
        async getMonitorList() {
          return {
            monitors: [
              { monitorIndex: 0, monitorName: 'eDP-1', monitorWidth: 1920, monitorHeight: 1080, monitorPositionX: 0, monitorPositionY: 0 },
              { monitorIndex: 1, monitorName: 'HDMI-1', monitorWidth: 1920, monitorHeight: 1080, monitorPositionX: 1920, monitorPositionY: 0 },
            ],
          };
        },
        async getSceneList() {
          return { scenes: [{ sceneName: 'src.cam' }, { sceneName: 'output.main' }] };
        },
        async openSourceProjector(sourceName, monitorIndex) {
          calls.push({ sourceName, monitorIndex });
        },
      });

      const { monitors } = await client.getMonitorList();
      const monitor = monitors.find((m) => m.monitorName === 'HDMI-1');
      assert.ok(monitor);
      const { scenes } = await client.getSceneList();
      const outputScene = scenes.find((s) => s.sceneName.startsWith('output.'));
      assert.ok(outputScene);
      await client.openSourceProjector(outputScene.sceneName, monitor.monitorIndex);

      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0], { sourceName: 'output.main', monitorIndex: 1 });
    });

    it('пропускает проектор если монитор с именем не найден', async () => {
      const calls: unknown[] = [];
      const client = createMockClient({
        async getMonitorList() {
          return {
            monitors: [
              { monitorIndex: 0, monitorName: 'eDP-1', monitorWidth: 1920, monitorHeight: 1080, monitorPositionX: 0, monitorPositionY: 0 },
            ],
          };
        },
        async openSourceProjector(...args) { calls.push(args); },
      });

      const { monitors } = await client.getMonitorList();
      const monitor = monitors.find((m) => m.monitorName === 'HDMI-1');
      assert.strictEqual(monitor, undefined);
      assert.strictEqual(calls.length, 0);
    });

    it('пропускает проектор если нет output.* сцен (монитор найден)', async () => {
      const calls: unknown[] = [];
      const client = createMockClient({
        async getMonitorList() {
          return {
            monitors: [
              { monitorIndex: 1, monitorName: 'HDMI-1', monitorWidth: 1920, monitorHeight: 1080, monitorPositionX: 0, monitorPositionY: 0 },
            ],
          };
        },
        async getSceneList() {
          return { scenes: [{ sceneName: 'src.cam' }, { sceneName: 'src.screen' }] };
        },
        async openSourceProjector(...args) { calls.push(args); },
      });

      const { scenes } = await client.getSceneList();
      const outputScene = scenes.find((s) => s.sceneName.startsWith('output.'));
      assert.strictEqual(outputScene, undefined);
      assert.strictEqual(calls.length, 0);
    });
  });
});
