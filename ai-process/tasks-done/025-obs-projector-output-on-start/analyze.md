# Анализ: Трансляция OBS на проектор (второй экран) при запуске

## Общее описание функциональности

После перезапуска OBS состояние Fullscreen Projector не восстанавливается автоматически.
Задача: при каждом подключении (и переподключении) к OBS WebSocket находить первую сцену с префиксом `output.` и открывать для неё Fullscreen Projector на заданном мониторе через метод `OpenSourceProjector` (obs-websocket v5).
Номер монитора задаётся через переменную окружения `OBS_PROJECTOR_MONITOR`.

## Связанные модули и сущности

| Модуль / файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/obs-scenes/client.ts` | OBS WebSocket клиент: подключение, reconnect, вызовы API | Добавить `onConnected` callback и метод `openSourceProjector` |
| `src/modules/obs-scenes/scenes-service.ts` | Сервис сцен: get/set сцен | Добавить логику запуска проектора при `onConnected` |
| `src/modules/obs-scenes/index.ts` | Фабрика: создаёт клиент и сервис, запускает connect | Передать `projectorMonitorIndex` и связать callback |
| `src/modules/obs-scenes/types.ts` | Публичный контракт `ObsScenesService` | Не затрагивает (проектор — внутренняя деталь) |
| `src/modules/config/types.ts` | Классы конфига, `ObsConfig` | Добавить поле `projectorMonitorIndex?: number` |
| `src/modules/config/validate.ts` | Чтение env-переменных и валидация | Добавить чтение `OBS_PROJECTOR_MONITOR` в секцию `obs` |
| `test/obs-scenes.test.ts` | Тесты модуля obs-scenes | Добавить тесты для новой логики |

## Текущие интерфейсы и API

### `ObsWebSocketClientConfig` (`client.ts:22`)
```ts
export interface ObsWebSocketClientConfig {
  host: string;
  port: number;
  password: string;
  logger: Logger;
}
```
Нужно добавить `onConnected?: () => Promise<void>`.

### `ObsWebSocketClient` (`client.ts:29`)
```ts
export interface ObsWebSocketClient {
  connect(): void;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getSceneList(): Promise<{ scenes: Array<{ sceneName: string }> }>;
  getCurrentProgramScene(): Promise<{ sceneName: string }>;
  setCurrentProgramScene(sceneName: string): Promise<void>;
}
```
Нужно добавить `openSourceProjector(sourceName: string, monitorIndex: number): Promise<void>`.

### `tryConnect()` (`client.ts:65`)
В `.then()` после успешного connect (строки 82–93) уже разделена логика первого подключения и reconnect. Именно здесь нужно вызвать `onConnected` callback (после сброса `reconnectDelayMs`).

### `ObsConfig` (`config/types.ts:69`)
Класс конфига OBS — нужно добавить опциональное поле `projectorMonitorIndex?: number`.

### `validateEnv()` (`config/validate.ts:48`)
В блоке `obs` (строка 78) нужно добавить:
```ts
projectorMonitorIndex: parseOptionalInt(getEnv('OBS_PROJECTOR_MONITOR')),
```

### `createObsScenesService()` (`obs-scenes/index.ts:25`)
Фабрика — точка сборки. Здесь создаётся клиент и сервис. Нужно пробросить `projectorMonitorIndex` из конфига и установить `onConnected` callback на клиенте.

### `createObsScenesServiceImpl()` (`scenes-service.ts:17`)
Принимает `ObsScenesServiceConfig`. Логика поиска `output.*` сцены и вызова `openSourceProjector` может быть инкапсулирована либо здесь (через расширение конфига), либо во фабрике `index.ts`.

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить / создать |
|---|---|---|
| `src/modules/config/types.ts` | `ObsConfig` класс | Добавить `projectorMonitorIndex?: number` с `@IsOptional() @IsNumber() @Min(0)` |
| `src/modules/config/validate.ts` | Чтение env в `obs` блоке | Добавить `projectorMonitorIndex: parseOptionalInt(getEnv('OBS_PROJECTOR_MONITOR'))` |
| `src/modules/obs-scenes/client.ts` | `ObsWebSocketClientConfig`, `ObsWebSocketClient`, `createObsWebSocketClient` | 1) Добавить `onConnected?` в config-интерфейс; 2) Добавить `openSourceProjector` в client-интерфейс; 3) Вызвать `onConnected` в `tryConnect()` после успешного connect; 4) Реализовать `openSourceProjector` через `obs.call('OpenSourceProjector', ...)` |
| `src/modules/obs-scenes/index.ts` | Фабрика `createObsScenesService` | Принять и использовать `projectorMonitorIndex` из конфига, сформировать и передать `onConnected` callback |
| `src/modules/obs-scenes/scenes-service.ts` | `ObsScenesServiceConfig`, `createObsScenesServiceImpl` | Возможно добавить `projectorMonitorIndex` и `onConnected`-логику сюда (альтернативно — вся логика во фабрике) |
| `test/obs-scenes.test.ts` | Тесты модуля | Добавить тест: при `onConnected` клиент вызывает `openSourceProjector` для первой `output.*` сцены |

## Зависимости и ограничения

- **obs-websocket-js v5**: метод `OpenSourceProjector` принимает `{ sourceName, projectorType: 'Source', monitorIndex }`. Тип проектора — `'Source'`. `monitorIndex` — целое число ≥ 0.
- **Reconnect timing**: `onConnected` вызывается внутри Promise `.then()` в `tryConnect()`. Если callback бросает ошибку — её нужно поймать, чтобы не сломать цикл reconnect. Логировать как предупреждение.
- **Гонка при reconnect**: OBS может не успеть полностью инициализировать список сцен сразу после подключения. Если `GetSceneList` вернёт пустой список — логировать предупреждение и пропустить открытие проектора.
- **Нет `output.*` сцен**: логировать предупреждение и пропускать.
- **Мониторы**: `monitorIndex` — индекс монитора в системе OBS (0-based). Если переменная не задана — вся логика проектора не выполняется.
- **Только одна `output.*` сцена**: берётся первая найденная, порядок определяется OBS (порядок как в `GetSceneList`).
- **Тестирование**: текущие тесты используют mock-клиент с фиксированным интерфейсом. Добавление `openSourceProjector` в интерфейс `ObsWebSocketClient` потребует обновить mock в `createMockClient`.
