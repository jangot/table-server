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
    async getMonitorList() {
      return { monitors: [] };
    },
    async getSceneItemList() {
      return {
        sceneItems: [
          { sourceName: 'scene-source', inputKind: 'scene', sceneItemId: 1 },
        ],
      };
    },
    async getInputSettings() {
      return { inputSettings: { scene: 'input.cam' } };
    },
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

    const service = createObsScenesServiceImpl({
      client,
      logger,
      scenesConfig,
    });

    const display = await service.getScenesForDisplay();

    assert.deepStrictEqual(display, [
      { name: 'output.table', title: 'Table output', type: 'output', enabled: true },
      { name: 'input.cam', title: 'Camera', type: 'input', enabled: true },
    ]);
  });

  it('getScenesForDisplay keeps scenes without type for backward compatibility', async () => {
    const client = createMockClient();
    const logger = createMockLogger();
    const scenesConfig = [
      { name: 'output.table', title: 'Table output', enabled: true },
    ];

    const service = createObsScenesServiceImpl({
      client,
      logger,
      scenesConfig,
    });

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

  it('setScene с outputSceneName переключает вложенный источник через SetInputSettings', async () => {
    const setCalls: Array<{ inputName: string; settings: Record<string, unknown> }> = [];
    const client = createMockClient({
      async setInputSettings(inputName, inputSettings) {
        setCalls.push({ inputName, settings: inputSettings });
      },
    });
    const service = createObsScenesServiceImpl({
      client,
      logger,
      outputSceneName: 'output.main',
    });

    await service.setScene('input.cam');

    assert.strictEqual(setCalls.length, 1);
    assert.strictEqual(setCalls[0].inputName, 'scene-source');
    assert.deepStrictEqual(setCalls[0].settings, { scene: 'input.cam' });
  });

  it('setScene без outputSceneName бросает ошибку', async () => {
    const client = createMockClient();
    const service = createObsScenesServiceImpl({ client, logger });

    await assert.rejects(
      () => service.setScene('input.cam'),
      /OBS output scene not configured/
    );
  });

  it('getCurrentScene с outputSceneName читает вложенный источник', async () => {
    const client = createMockClient();
    const service = createObsScenesServiceImpl({
      client,
      logger,
      outputSceneName: 'output.main',
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

  it('setScene бросает SceneNotFoundError если вложенный источник не найден в output-сцене', async () => {
    const client = createMockClient({
      async getSceneItemList() {
        return { sceneItems: [] };
      },
    });
    const service = createObsScenesServiceImpl({
      client,
      logger,
      outputSceneName: 'output.main',
    });

    await assert.rejects(
      () => service.setScene('input.cam'),
      /No nested scene source found/
    );
  });

  it('setScene бросает SceneNotFoundError при ошибке "does not exist"', async () => {
    const client = createMockClient({
      async setInputSettings() {
        throw new Error('Scene "nonexistent" does not exist');
      },
    });
    const service = createObsScenesServiceImpl({
      client,
      logger,
      outputSceneName: 'output.main',
    });

    await assert.rejects(
      () => service.setScene('nonexistent'),
      (err: unknown) => err instanceof SceneNotFoundError && err.sceneName === 'nonexistent'
    );
  });
});

