# План реализации: Идентификация монитора OBS по имени входа

Заменяем идентификацию монитора OBS-проектора с числового индекса (`OBS_PROJECTOR_MONITOR`) на имя входа (`OBS_PROJECTOR_MONITOR_NAME`). При подключении к OBS вызываем `GetMonitorList`, ищем монитор по имени и получаем его индекс динамически. Старая переменная и поле полностью удаляются — fallback не предусмотрен.

---

## 1. Обновить тип `ObsConfig` — заменить поле

**Файл (изменить):** `src/modules/config/types.ts`

Удалить поле `projectorMonitorIndex?: number` и добавить `projectorMonitorName?: string`.

```typescript
// До (строки 94–97):
@IsOptional()
@IsNumber()
@Min(0)
projectorMonitorIndex?: number;

// После:
@IsOptional()
@IsString()
projectorMonitorName?: string;
```

---

## 2. Обновить парсинг env-переменных

**Файл (изменить):** `src/modules/config/validate.ts`

Удалить строку с `projectorMonitorIndex` / `OBS_PROJECTOR_MONITOR`, добавить `projectorMonitorName`.

```typescript
// До (строка 87):
projectorMonitorIndex: parseOptionalInt(getEnv('OBS_PROJECTOR_MONITOR')),

// После:
projectorMonitorName: getEnv('OBS_PROJECTOR_MONITOR_NAME')?.trim() || undefined,
```

---

## 3. Добавить метод `getMonitorList` в клиент OBS

**Файл (изменить):** `src/modules/obs-scenes/client.ts`

### 3a. Добавить тип монитора и обновить интерфейс `ObsWebSocketClient`

```typescript
export interface ObsMonitor {
  monitorIndex: number;
  monitorName: string;
  monitorWidth: number;
  monitorHeight: number;
  monitorPositionX: number;
  monitorPositionY: number;
}

export interface ObsWebSocketClient {
  // ... существующие методы ...
  getMonitorList(): Promise<{ monitors: ObsMonitor[] }>;
}
```

### 3b. Добавить реализацию метода в объект, возвращаемый `createObsWebSocketClient`

```typescript
async getMonitorList(): Promise<{ monitors: ObsMonitor[] }> {
  if (!obs) throw new Error('OBS WebSocket not connected');
  const res = await obs.call('GetMonitorList');
  const monitors = ((res as { monitors?: unknown[] }).monitors ?? []).map((m: unknown) => {
    const mon = m as Record<string, unknown>;
    return {
      monitorIndex: (mon.monitorIndex as number) ?? 0,
      monitorName: (mon.monitorName as string) ?? '',
      monitorWidth: (mon.monitorWidth as number) ?? 0,
      monitorHeight: (mon.monitorHeight as number) ?? 0,
      monitorPositionX: (mon.monitorPositionX as number) ?? 0,
      monitorPositionY: (mon.monitorPositionY as number) ?? 0,
    };
  });
  return { monitors };
},
```

---

## 4. Обновить логику `onConnected` в сервисе сцен

**Файл (изменить):** `src/modules/obs-scenes/index.ts`

Заменить деструктуризацию `projectorMonitorIndex` на `projectorMonitorName` и обновить логику `onConnected`: теперь сначала запрашиваем список мониторов, ищем по `monitorName`, и только потом открываем проектор с найденным `monitorIndex`.

```typescript
// До (строка 28):
const { projectorMonitorIndex } = config;

// После:
const { projectorMonitorName } = config;
```

```typescript
// До: onConnected зависел от projectorMonitorIndex != null
// После:
const onConnected =
  projectorMonitorName != null
    ? async () => {
        // 1. Получаем список мониторов
        let monitors: Array<{ monitorIndex: number; monitorName: string }>;
        try {
          ({ monitors } = await client.getMonitorList());
        } catch (err) {
          logger.warn(`obs_projector action=get_monitors error=${err instanceof Error ? err.message : String(err)}`);
          return;
        }

        // 2. Ищем монитор по имени
        const monitor = monitors.find((m) => m.monitorName === projectorMonitorName);
        if (!monitor) {
          logger.warn(`obs_projector action=open status=skip reason=monitor_not_found name=${projectorMonitorName}`);
          return;
        }

        // 3. Получаем список сцен
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

        // 4. Открываем проектор
        await client.openSourceProjector(outputScene.sceneName, monitor.monitorIndex);
        logger.info(
          `obs_projector action=open scene=${outputScene.sceneName} monitor_name=${projectorMonitorName} monitor_index=${monitor.monitorIndex}`
        );
      }
    : undefined;
```

---

## 5. Обновить тесты

**Файл (изменить):** `test/obs-scenes.test.ts`

### 5a. Обновить `createMockClient`

Добавить метод `getMonitorList` в mock-объект (чтобы не нарушить интерфейс после его обновления):

```typescript
function createMockClient(overrides?: Partial<ObsWebSocketClient>): ObsWebSocketClient {
  return {
    // ... существующие методы ...
    async getMonitorList() {
      return { monitors: [] };
    },
    ...overrides,
  };
}
```

### 5b. Обновить блок `openSourceProjector logic`

Удалить старые тесты на числовой индекс и добавить тесты на резолвинг по имени.

```typescript
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
```

### 5c. Обновить тест `createObsScenesService`

В конфиге теста убедиться, что `projectorMonitorIndex` не используется (поле будет удалено из типа — тест перестанет компилироваться, если там было это поле).

```typescript
it('returns service with getScenes, ... when config is set', () => {
  const config: ObsConfig = {
    path: '/usr/bin/obs',
    host: 'localhost',
    port: 4455,
    password: 'secret',
    // projectorMonitorIndex убран, projectorMonitorName не обязателен
  };
  // ...
});
```

---

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `src/modules/obs-scenes/client.ts` |
| Изменить | `src/modules/obs-scenes/index.ts` |
| Изменить | `test/obs-scenes.test.ts` |

---

## Ссылки
- [analyze.md](./analyze.md)
