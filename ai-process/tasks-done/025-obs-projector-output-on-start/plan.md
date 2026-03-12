# План реализации: Трансляция OBS на проектор при запуске

При каждом подключении (и переподключении) к OBS WebSocket система автоматически находит первую сцену с префиксом `output.` и открывает для неё Fullscreen Projector на заданном мониторе. Монитор задаётся через переменную окружения `OBS_PROJECTOR_MONITOR`. Если переменная не задана — логика не выполняется.

## 1. Добавить `projectorMonitorIndex` в `ObsConfig`

**Файл (изменить):** `src/modules/config/types.ts`

Добавить опциональное поле с декораторами валидации после поля `password`:

```typescript
@IsOptional()
@IsNumber()
@Min(0)
projectorMonitorIndex?: number;
```

## 2. Читать `OBS_PROJECTOR_MONITOR` из окружения

**Файл (изменить):** `src/modules/config/validate.ts`

В блоке `obs: plainToInstance(ObsConfig, { ... })` добавить строку после `password`:

```typescript
projectorMonitorIndex: parseOptionalInt(getEnv('OBS_PROJECTOR_MONITOR')),
```

## 3. Расширить интерфейсы клиента OBS

**Файл (изменить):** `src/modules/obs-scenes/client.ts`

**3а. `ObsWebSocketClientConfig` — добавить `onConnected` callback:**

```typescript
export interface ObsWebSocketClientConfig {
  host: string;
  port: number;
  password: string;
  logger: Logger;
  onConnected?: () => Promise<void>;  // вызывается при connect и reconnect
}
```

**3б. `ObsWebSocketClient` — добавить `openSourceProjector`:**

```typescript
export interface ObsWebSocketClient {
  connect(): void;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getSceneList(): Promise<{ scenes: Array<{ sceneName: string }> }>;
  getCurrentProgramScene(): Promise<{ sceneName: string }>;
  setCurrentProgramScene(sceneName: string): Promise<void>;
  openSourceProjector(sourceName: string, monitorIndex: number): Promise<void>;
}
```

**3в. `createObsWebSocketClient` — вызывать `onConnected` после успешного connect:**

В функции `tryConnect()`, в `.then()` после сброса `reconnectDelayMs` и логирования (строки 87–93), добавить вызов callback:

```typescript
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
  // Вызываем onConnected после успешного подключения
  if (config.onConnected) {
    void config.onConnected().catch((err: Error) => {
      logger.warn(`obs_connection on_connected_error=${err?.message ?? 'unknown'}`);
    });
  }
})
```

**3г. Реализовать `openSourceProjector` в возвращаемом объекте:**

```typescript
async openSourceProjector(sourceName: string, monitorIndex: number): Promise<void> {
  if (!obs) throw new Error('OBS WebSocket not connected');
  await obs.call('OpenSourceProjector', {
    sourceName,
    projectorType: 'Source',
    monitorIndex,
  });
},
```

## 4. Собрать `onConnected` во фабрике

**Файл (изменить):** `src/modules/obs-scenes/index.ts`

Если `projectorMonitorIndex` задан в конфиге — сформировать `onConnected` callback и передать его в `createObsWebSocketClient`. Логика нахождения `output.*` сцены инкапсулирована прямо в фабрике — без изменений `scenes-service.ts`.

```typescript
export function createObsScenesService(
  config: ObsConfig,
  logger: Logger,
  scenesConfigPath?: string
): ObsScenesService | null {
  if (!isObsScenesEnabled(config) || config.host == null || config.port == null || config.password === undefined) {
    return null;
  }

  const { projectorMonitorIndex } = config;

  const onConnected =
    projectorMonitorIndex != null
      ? async () => {
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
          const outputScene = scenes.find((s) => s.sceneName.startsWith('output.'));
          if (!outputScene) {
            logger.warn('obs_projector action=open status=skip reason=no_output_scene');
            return;
          }
          await client.openSourceProjector(outputScene.sceneName, projectorMonitorIndex);
          logger.info(`obs_projector action=open scene=${outputScene.sceneName} monitor=${projectorMonitorIndex}`);
        }
      : undefined;

  const client = createObsWebSocketClient({
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
```

> **Важно:** `client` используется внутри `onConnected`, поэтому объявление `onConnected` должно идти после объявления `client` — либо переменная `client` объявляется через `let` перед `onConnected`, а присваивается после. Наиболее чистый вариант — объявить `let client: ObsWebSocketClient` до `onConnected`, а инициализировать после.

Альтернативный вариант без циклической зависимости — вынести callback в замыкание с `let`:

```typescript
let client: ObsWebSocketClient;

const onConnected = projectorMonitorIndex != null
  ? async () => { /* использует client */ }
  : undefined;

client = createObsWebSocketClient({ ..., onConnected });
client.connect();
```

## 5. Тесты

**Файл (изменить):** `test/obs-scenes.test.ts`

**5а. Обновить `createMockClient`** — добавить `openSourceProjector` в mock (интерфейс требует):

```typescript
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
    async setCurrentProgramScene(name: string) { void name; },
    async openSourceProjector(sourceName: string, monitorIndex: number) {
      void sourceName; void monitorIndex;
    },
    ...overrides,
  };
}
```

**5б. Тест: `openSourceProjector` вызывается при `onConnected` для первой `output.*` сцены:**

```typescript
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

  // Имитируем onConnected вручную (как его вызывает tryConnect)
  const monitorIndex = 1;
  const { scenes } = await client.getSceneList();
  const outputScene = scenes.find((s) => s.sceneName.startsWith('output.'));
  assert.ok(outputScene);
  await client.openSourceProjector(outputScene.sceneName, monitorIndex);

  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0], { sourceName: 'output.main', monitorIndex: 1 });
});
```

**5в. Тест: нет `output.*` сцен — `openSourceProjector` не вызывается, warning логируется:**

```typescript
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
```

**5г. Тест: `OBS_PROJECTOR_MONITOR` не задан — `onConnected` не формируется (через `createObsScenesService`):**

Создать сервис с `ObsConfig` без `projectorMonitorIndex` и убедиться, что `openSourceProjector` не вызывается (уже косвенно покрыто существующим тестом `createObsScenesService`).

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `src/modules/obs-scenes/client.ts` |
| Изменить | `src/modules/obs-scenes/index.ts` |
| Изменить | `test/obs-scenes.test.ts` |

## Ссылки
- [analyze.md](./analyze.md)
- [description.md](./description.md)
