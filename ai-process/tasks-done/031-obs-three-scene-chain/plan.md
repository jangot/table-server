# План реализации: Цепочка из трёх уровней сцен OBS

Команды переключения сцен должны менять вложенную сцену внутри `output.*` через OBS WebSocket v5, а не программную сцену. Цепочка: сцены-контент → `output.*` (вложенный источник) → `main` (проектор). Конфигурируется через `OBS_OUTPUT_SCENE_NAME`.

---

## 1. Расширить интерфейс `ObsWebSocketClient` новыми методами

**Файл (изменить):** `src/modules/obs-scenes/client.ts`

Добавить в интерфейс `ObsWebSocketClient` три новых метода:

```typescript
export interface ObsWebSocketClient {
  // ... существующие методы ...
  getSceneItemList(sceneName: string): Promise<{ sceneItems: ObsSceneItem[] }>;
  getInputSettings(inputName: string): Promise<{ inputSettings: Record<string, unknown> }>;
  setInputSettings(inputName: string, inputSettings: Record<string, unknown>): Promise<void>;
}

export interface ObsSceneItem {
  sourceName: string;
  inputKind: string | null;
  sceneItemId: number;
}
```

Добавить реализацию этих методов в объект, возвращаемый из `createObsWebSocketClient`:

```typescript
async getSceneItemList(sceneName: string): Promise<{ sceneItems: ObsSceneItem[] }> {
  if (!obs) throw new Error('OBS WebSocket not connected');
  const res = await obs.call('GetSceneItemList', { sceneName });
  const items = ((res as { sceneItems?: unknown[] }).sceneItems ?? []).map((item: unknown) => {
    const i = item as Record<string, unknown>;
    return {
      sourceName: (i.sourceName as string) ?? '',
      inputKind: (i.inputKind as string | null) ?? null,
      sceneItemId: (i.sceneItemId as number) ?? 0,
    };
  });
  return { sceneItems: items };
},

async getInputSettings(inputName: string): Promise<{ inputSettings: Record<string, unknown> }> {
  if (!obs) throw new Error('OBS WebSocket not connected');
  const res = await obs.call('GetInputSettings', { inputName });
  return { inputSettings: (res as { inputSettings?: Record<string, unknown> }).inputSettings ?? {} };
},

async setInputSettings(inputName: string, inputSettings: Record<string, unknown>): Promise<void> {
  if (!obs) throw new Error('OBS WebSocket not connected');
  await obs.call('SetInputSettings', { inputName, inputSettings });
},
```

---

## 2. Добавить `outputSceneName` в `ObsConfig`

**Файл (изменить):** `src/modules/config/types.ts`

Добавить поле в класс `ObsConfig` после `projectorSceneName`:

```typescript
@IsOptional()
@IsString()
outputSceneName?: string;
```

---

## 3. Добавить чтение `OBS_OUTPUT_SCENE_NAME` из env

**Файл (изменить):** `src/modules/config/validate.ts`

В блоке `obs: plainToInstance(ObsConfig, { ... })` добавить строку после `projectorSceneName`:

```typescript
outputSceneName: getEnv('OBS_OUTPUT_SCENE_NAME')?.trim() || undefined,
```

---

## 4. Добавить `outputSceneName` в `ObsScenesServiceConfig`

**Файл (изменить):** `src/modules/obs-scenes/scenes-service.ts`

Расширить интерфейс конфигурации сервиса:

```typescript
export interface ObsScenesServiceConfig {
  client: ObsWebSocketClient;
  logger: Logger;
  scenesConfig?: SceneConfigEntry[] | null;
  outputSceneName?: string | null;
}
```

---

## 5. Изменить `setScene` и `getCurrentScene` для работы через вложенный источник

**Файл (изменить):** `src/modules/obs-scenes/scenes-service.ts`

Добавить вспомогательную функцию для поиска вложенного источника-сцены внутри `output.*`:

```typescript
async function findNestedSceneSource(outputSceneName: string): Promise<string> {
  const { sceneItems } = await client.getSceneItemList(outputSceneName);
  const sceneSource = sceneItems.find((item) => item.inputKind === 'scene');
  if (!sceneSource) {
    throw new Error(`No nested scene source found in output scene "${outputSceneName}"`);
  }
  return sceneSource.sourceName;
}
```

Заменить реализацию `getCurrentScene`:

```typescript
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
```

Заменить реализацию `setScene`:

```typescript
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
```

---

## 6. Передать `outputSceneName` из конфига в фабрику сервиса

**Файл (изменить):** `src/modules/obs-scenes/index.ts`

В вызове `createObsScenesServiceImpl` добавить передачу нового поля:

```typescript
return createObsScenesServiceImpl({
  client,
  logger,
  scenesConfig,
  outputSceneName: config.outputSceneName ?? null,
});
```

---

## 7. Тесты

**Файл (изменить):** `test/obs-scenes-service.test.ts`

Расширить `createMockClient` новыми методами и добавить тесты:

```typescript
function createMockClient(overrides?: Partial<ObsWebSocketClient>): ObsWebSocketClient {
  return {
    // ... существующие методы ...
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
```

Сценарии для `setScene` с `outputSceneName`:

```typescript
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
  const service = createObsScenesServiceImpl({ client, logger });

  const current = await service.getCurrentScene();
  assert.strictEqual(current, null);
  const warnLine = logger.lines.find((l) => l.includes('output_scene_not_configured'));
  assert.ok(warnLine);
});

it('setScene бросает SceneNotFoundError если вложенный источник не найден в output-сцене', async () => {
  const client = createMockClient({
    async getSceneItemList() {
      return { sceneItems: [] }; // нет источников типа "scene"
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
```

**Файл (изменить):** `test/obs-scenes.test.ts`

Расширить `createMockClient` теми же новыми методами. Добавить тест на передачу `outputSceneName` через `createObsScenesService`:

```typescript
it('createObsScenesService передаёт outputSceneName в сервис', () => {
  const config: ObsConfig = {
    path: '/usr/bin/obs',
    host: 'localhost',
    port: 4455,
    password: 'secret',
    outputSceneName: 'output.main',
  };
  const result = createObsScenesService(config, logger as unknown as Logger);
  assert.strictEqual(typeof result.setScene, 'function');
});
```

---

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/obs-scenes/client.ts` |
| Изменить | `src/modules/obs-scenes/scenes-service.ts` |
| Изменить | `src/modules/obs-scenes/index.ts` |
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `test/obs-scenes-service.test.ts` |
| Изменить | `test/obs-scenes.test.ts` |

## Ссылки

- [analyze.md](./analyze.md)
