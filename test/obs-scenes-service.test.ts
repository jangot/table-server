import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Logger } from '../src/modules/logger';
import { createObsScenesServiceImpl } from '../src/modules/obs-scenes/scenes-service';
import type { ObsWebSocketClient } from '../src/modules/obs-scenes/client';
import { SceneNotFoundError } from '../src/modules/obs-scenes/types';

function createMockLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info(msg: string) { lines.push(`info: ${msg}`); },
    warn(msg: string) { lines.push(`warn: ${msg}`); },
    error(msg: string) { lines.push(`error: ${msg}`); },
    debug(msg: string) { lines.push(`debug: ${msg}`); },
  };
}

function createMockClient(overrides?: Partial<ObsWebSocketClient>): ObsWebSocketClient {
  return {
    connect() {},
    async disconnect() {},
    isConnected: () => true,
    async getSceneList() {
      return {
        scenes: [
          { sceneName: 'main' },
          { sceneName: 'output.table' },
          { sceneName: 'input.cam' },
          { sceneName: 'disabled.scene' },
        ],
      };
    },
    async getCurrentProgramScene() {
      return { sceneName: 'main' };
    },
    async setCurrentProgramScene() {},
    async openSourceProjector() {},
    async getMonitorList() { return { monitors: [] }; },
    async getSceneItemList() {
      return {
        sceneItems: [
          { sourceName: 'input.cam', inputKind: null, sourceType: 'OBS_SOURCE_TYPE_SCENE', sceneItemId: 1, sceneItemEnabled: true },
          { sourceName: 'input.table', inputKind: null, sourceType: 'OBS_SOURCE_TYPE_SCENE', sceneItemId: 2, sceneItemEnabled: false },
        ],
      };
    },
    async setSceneItemEnabled() {},
    async getInputSettings() { return { inputSettings: {} }; },
    async setInputSettings() {},
    ...overrides,
  };
}

describe('ObsScenesServiceImpl roles and filtering', () => {
  it('getScenesForDisplay filters out main and disabled scenes, keeps others', async () => {
    const client = createMockClient();
    const logger = createMockLogger();
    const scenesConfig = [
      { name: 'main', title: 'Main projector', type: 'main', enabled: true },
      { name: 'output.table', title: 'Table output', type: 'output', enabled: true },
      { name: 'input.cam', title: 'Camera', type: 'input', enabled: true },
      { name: 'disabled.scene', title: 'Disabled', type: 'output', enabled: false },
    ];

    const service = createObsScenesServiceImpl({ client, logger, scenesConfig });
    const display = await service.getScenesForDisplay();

    assert.deepStrictEqual(display, [
      { name: 'output.table', title: 'Table output', type: 'output', enabled: true },
      { name: 'input.cam', title: 'Camera', type: 'input', enabled: true },
    ]);
  });

  it('getScenesForDisplay keeps scenes without type for backward compatibility', async () => {
    const client = createMockClient();
    const logger = createMockLogger();
    const scenesConfig = [{ name: 'output.table', title: 'Table output', enabled: true }];

    const service = createObsScenesServiceImpl({ client, logger, scenesConfig });
    const display = await service.getScenesForDisplay();

    assert.deepStrictEqual(display, [
      { name: 'main', enabled: true },
      { name: 'output.table', title: 'Table output', enabled: true },
      { name: 'input.cam', enabled: true },
      { name: 'disabled.scene', enabled: true },
    ]);
  });
});

describe('ObsScenesServiceImpl — outputSceneName / nested scene switching', () => {
  const logger = createMockLogger();

  it('setScene включает нужный item и выключает остальные через SetSceneItemEnabled', async () => {
    const calls: Array<{ sceneName: string; sceneItemId: number; enabled: boolean }> = [];
    const client = createMockClient({
      async setSceneItemEnabled(sceneName, sceneItemId, sceneItemEnabled) {
        calls.push({ sceneName, sceneItemId, enabled: sceneItemEnabled });
      },
    });
    const service = createObsScenesServiceImpl({
      client, logger, outputSceneName: 'output.main',
    });

    await service.setScene('input.table');

    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(calls.find((c) => c.sceneItemId === 1), { sceneName: 'output.main', sceneItemId: 1, enabled: false });
    assert.deepStrictEqual(calls.find((c) => c.sceneItemId === 2), { sceneName: 'output.main', sceneItemId: 2, enabled: true });
  });

  it('setScene без outputSceneName бросает ошибку', async () => {
    const client = createMockClient();
    const service = createObsScenesServiceImpl({ client, logger });

    await assert.rejects(
      () => service.setScene('input.cam'),
      /OBS output scene not configured/
    );
  });

  it('getCurrentScene возвращает enabled сцену', async () => {
    const client = createMockClient();
    const service = createObsScenesServiceImpl({
      client, logger, outputSceneName: 'output.main',
    });

    const current = await service.getCurrentScene();
    assert.strictEqual(current, 'input.cam');
  });

  it('getCurrentScene без outputSceneName возвращает null и логирует warn', async () => {
    const client = createMockClient();
    const loggerLocal = createMockLogger();
    const service = createObsScenesServiceImpl({ client, logger: loggerLocal });

    const current = await service.getCurrentScene();
    assert.strictEqual(current, null);
    const warnLine = loggerLocal.lines.find((l) => l.includes('output_scene_not_configured'));
    assert.ok(warnLine);
  });

  it('setScene бросает SceneNotFoundError если сцена не найдена среди items', async () => {
    const client = createMockClient();
    const service = createObsScenesServiceImpl({
      client, logger, outputSceneName: 'output.main',
    });

    await assert.rejects(
      () => service.setScene('nonexistent'),
      (err: unknown) => err instanceof SceneNotFoundError && err.sceneName === 'nonexistent'
    );
  });
});
