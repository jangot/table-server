import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Logger } from '../src/modules/logger';
import { createObsScenesServiceImpl } from '../src/modules/obs-scenes/scenes-service';
import type { ObsWebSocketClient } from '../src/modules/obs-scenes/client';

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

