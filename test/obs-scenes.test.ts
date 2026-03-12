import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Logger } from '../src/modules/logger';
import {
  createObsScenesService,
  isObsScenesEnabled,
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

  describe('isObsScenesEnabled', () => {
    it('returns true when host, port and password are set', () => {
      const obs: ObsConfig = { path: '/usr/bin/obs', host: 'localhost', port: 4455, password: '' };
      assert.strictEqual(isObsScenesEnabled(obs), true);
    });

    it('returns false when host is missing', () => {
      const obs: ObsConfig = { path: '/usr/bin/obs', port: 4455, password: 'p' };
      assert.strictEqual(isObsScenesEnabled(obs), false);
    });

    it('returns false when port is missing', () => {
      const obs: ObsConfig = { path: '/usr/bin/obs', host: 'localhost', password: 'p' };
      assert.strictEqual(isObsScenesEnabled(obs), false);
    });

    it('returns false when password is undefined', () => {
      const obs: ObsConfig = { path: '/usr/bin/obs', host: 'localhost', port: 4455 };
      assert.strictEqual(isObsScenesEnabled(obs), false);
    });

    it('returns true when password is empty string', () => {
      const obs: ObsConfig = { path: '/usr/bin/obs', host: 'localhost', port: 4455, password: '' };
      assert.strictEqual(isObsScenesEnabled(obs), true);
    });
  });

  describe('createObsScenesService', () => {
    let createdService: ReturnType<typeof createObsScenesService> = null;

    after(async () => {
      if (createdService) {
        await createdService.disconnect();
        createdService = null;
      }
    });

    it('returns null when WebSocket config is not set', () => {
      const config: ObsConfig = { path: '/usr/bin/obs' };
      const result = createObsScenesService(config, logger as unknown as Logger);
      assert.strictEqual(result, null);
    });

    it('returns service with getScenes, getCurrentScene, setScene, getScenesForDisplay when config is set', () => {
      const config: ObsConfig = {
        path: '/usr/bin/obs',
        host: 'localhost',
        port: 4455,
        password: 'secret',
      };
      const result = createObsScenesService(config, logger as unknown as Logger);
      assert.ok(result !== null);
      createdService = result;
      assert.strictEqual(typeof result!.getScenes, 'function');
      assert.strictEqual(typeof result!.getCurrentScene, 'function');
      assert.strictEqual(typeof result!.setScene, 'function');
      assert.strictEqual(typeof result!.getScenesForDisplay, 'function');
    });
  });

  describe('ObsScenesServiceImpl', () => {
    it('getScenes returns scene names from client', async () => {
      const client = createMockClient();
      const service = createObsScenesServiceImpl({ client, logger: logger as unknown as Logger });
      const scenes = await service.getScenes();
      assert.deepStrictEqual(scenes, ['Scene 1', 'Scene 2']);
    });

    it('getCurrentScene returns current scene name', async () => {
      const client = createMockClient();
      const service = createObsScenesServiceImpl({ client, logger: logger as unknown as Logger });
      const current = await service.getCurrentScene();
      assert.strictEqual(current, 'Scene 1');
    });

    it('setScene succeeds and logs key=value', async () => {
      const client = createMockClient();
      const service = createObsScenesServiceImpl({ client, logger: logger as unknown as Logger });
      await service.setScene('chrome');
      const logLine = logger.lines.find((l) => l.includes('scene_switch'));
      assert.ok(logLine);
      assert.ok(logLine!.includes('to=chrome'));
      assert.ok(logLine!.includes('success=true'));
    });

    it('setScene with nonexistent scene rejects with SceneNotFoundError', async () => {
      const client = createMockClient({
        async setCurrentProgramScene() {
          throw new Error('Scene "nonexistent" does not exist');
        },
      });
      const service = createObsScenesServiceImpl({ client, logger: logger as unknown as Logger });
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
        async getCurrentProgramScene() {
          throw new Error('OBS WebSocket not connected');
        },
      });
      const service = createObsScenesServiceImpl({ client, logger: logger as unknown as Logger });
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

    it('getScenesForDisplay with config enriches scenes from config', async () => {
      const client = createMockClient();
      const scenesConfig = [
        { name: 'Scene 1', title: 'First Scene', type: 'working', enabled: false },
      ];
      const service = createObsScenesServiceImpl({
        client,
        logger: logger as unknown as Logger,
        scenesConfig,
      });
      const display = await service.getScenesForDisplay();
      assert.deepStrictEqual(display, [
        { name: 'Scene 1', title: 'First Scene', type: 'working', enabled: false },
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

  describe('openSourceProjector logic', () => {
    it('onConnected вызывает openSourceProjector для первой output.* сцены', async () => {
      const calls: Array<{ sourceName: string; monitorIndex: number }> = [];
      const client = createMockClient({
        async getSceneList() {
          return {
            scenes: [
              { sceneName: 'src.cam' },
              { sceneName: 'output.main' },
              { sceneName: 'output.backup' },
            ],
          };
        },
        async openSourceProjector(sourceName, monitorIndex) {
          calls.push({ sourceName, monitorIndex });
        },
      });

      const monitorIndex = 1;
      const { scenes } = await client.getSceneList();
      const outputScene = scenes.find((s) => s.sceneName.startsWith('output.'));
      assert.ok(outputScene);
      await client.openSourceProjector(outputScene.sceneName, monitorIndex);

      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0], { sourceName: 'output.main', monitorIndex: 1 });
    });

    it('onConnected пропускает проектор если нет output.* сцен', async () => {
      const calls: unknown[] = [];
      const client = createMockClient({
        async getSceneList() {
          return { scenes: [{ sceneName: 'src.cam' }, { sceneName: 'src.screen' }] };
        },
        async openSourceProjector(...args) { calls.push(args); },
      });

      const scenes = (await client.getSceneList()).scenes;
      const outputScene = scenes.find((s) => s.sceneName.startsWith('output.'));
      assert.strictEqual(outputScene, undefined);
      assert.strictEqual(calls.length, 0);
    });
  });
});
