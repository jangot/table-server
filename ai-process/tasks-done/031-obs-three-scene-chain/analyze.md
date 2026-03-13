# Анализ: Цепочка из трёх уровней сцен OBS

## Общее описание функциональности

Текущая реализация переключает **программную сцену** OBS (`SetCurrentProgramScene`). Это не влияет на то, что видно на проекторе, потому что проектор открыт через Source Projector на фиксированной сцене `main` (или `output.*`), которая не зависит от программной сцены.

Нужно реализовать трёхуровневую цепочку:
1. **Сцены с контентом** (`table`, `cam`, `slides`, ...) — то, что переключается командами.
2. **output.\*** — сцена-«оболочка» с одним источником типа «Сцена» (nested scene), который показывает одну из сцен с контентом.
3. **main** — сцена на проекторе, в которой источник типа «Сцена» показывает `output.*`.

Команды Telegram (`/scene`, `/backup`, `/default`) и HTTP (`POST /obs/scene`) должны переключать вложенную сцену **внутри** `output.*`, а не вызывать `SetCurrentProgramScene`. Это делается через OBS WebSocket v5: найти в сцене `output.*` источник типа «Сцена» → вызвать `SetInputSettings` с новым именем сцены.

---

## Связанные модули и сущности

| Модуль / файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/obs-scenes/client.ts` | OBS WebSocket-клиент: подключение, вызовы API | Добавить методы для работы с вложенными источниками (`GetSceneItemList`, `GetInputSettings`, `SetInputSettings`) |
| `src/modules/obs-scenes/scenes-service.ts` | Бизнес-логика переключения сцен | Изменить `setScene` и `getCurrentScene` для работы через вложенный источник |
| `src/modules/obs-scenes/types.ts` | Публичные интерфейсы: `ObsScenesService`, `SceneConfigEntry`, `SceneForDisplay` | Возможно, расширить `SceneConfigEntry` / конфиг сервиса |
| `src/modules/obs-scenes/index.ts` | Фабрика: создаёт клиент и сервис | Передать `outputSceneName` из конфига в сервис |
| `src/modules/config/types.ts` | Типы конфига приложения (`ObsConfig`) | Добавить поле `outputSceneName?: string` в `ObsConfig` |
| `src/modules/config/validate.ts` | Чтение env-переменных, заполнение конфига | Добавить чтение `OBS_OUTPUT_SCENE_NAME` |
| `src/modules/telegram-bot/handlers.ts` | Обработчики команд Telegram | Не требует изменений — вызывает `obsScenes.setScene(name)` |
| `src/modules/idle-server/index.ts` | HTTP сервер: `/obs/scene`, `/obs/scenes`, `/obs/scene/backup`, `/obs/scene/default` | Не требует изменений — вызывает `obsScenes.setScene(name)` |
| `test/obs-scenes-service.test.ts` | Тесты для `ObsScenesServiceImpl` | Добавить тесты для нового пути переключения |
| `test/obs-scenes.test.ts` | Интеграционные тесты `createObsScenesService` | Добавить тесты для вложенного переключения |

---

## Текущие интерфейсы и API

### `ObsWebSocketClient` (`client.ts:39-48`)

```typescript
interface ObsWebSocketClient {
  connect(): void;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getSceneList(): Promise<{ scenes: Array<{ sceneName: string }> }>;
  getCurrentProgramScene(): Promise<{ sceneName: string }>;
  setCurrentProgramScene(sceneName: string): Promise<void>;
  openSourceProjector(sourceName: string, monitorIndex: number): Promise<void>;
  getMonitorList(): Promise<{ monitors: ObsMonitor[] }>;
}
```

Методов для работы с вложенными источниками нет. Требуется добавить.

### `ObsScenesService` (`types.ts:29-36`)

```typescript
interface ObsScenesService {
  getScenes(): Promise<string[]>;
  getScenesForDisplay(): Promise<SceneForDisplay[]>;
  getCurrentScene(): Promise<string | null>;
  setScene(name: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}
```

Публичный интерфейс остаётся прежним, меняется реализация.

### `ObsScenesServiceConfig` (`scenes-service.ts:11-15`)

```typescript
interface ObsScenesServiceConfig {
  client: ObsWebSocketClient;
  logger: Logger;
  scenesConfig?: SceneConfigEntry[] | null;
}
```

Нужно добавить `outputSceneName?: string | null` — имя output-сцены, внутри которой переключается вложенный источник.

### `ObsConfig` (`config/types.ts:69-101`)

Содержит: `host`, `port`, `password`, `projectorMonitorName?`, `projectorSceneName?`. Нужно добавить поле для output-сцены.

### Текущий `setScene` (`scenes-service.ts:72-87`)

Вызывает `client.setCurrentProgramScene(name)` — меняет программную сцену. Нужно заменить на работу с вложенным источником.

### Текущий `getCurrentScene` (`scenes-service.ts:62-70`)

Вызывает `client.getCurrentProgramScene()` — возвращает текущую программную сцену. При новой схеме должен возвращать сцену, установленную в вложенном источнике внутри `output.*`.

---

## OBS WebSocket v5 — методы для вложенных источников

Для переключения вложенной сцены в OBS WS v5 используются:

- **`GetSceneItemList`** (`{ sceneName }`) → возвращает массив элементов (scene items) сцены. Каждый элемент содержит `sourceName` (имя источника) и `inputKind`. Источники типа «Сцена» имеют `inputKind = "scene"`.
- **`GetInputSettings`** (`{ inputName }`) → возвращает `inputSettings` — объект настроек. Для источника-сцены содержит `{ scene: "current_scene_name" }`.
- **`SetInputSettings`** (`{ inputName, inputSettings: { scene: "new_scene_name" } }`) → меняет отображаемую сцену в источнике.

Идентификация вложенного источника в `output.*`: найти в `GetSceneItemList` первый элемент с `inputKind === "scene"` (или по имени, если задано через конфиг).

---

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить / создать |
|---|---|---|
| `src/modules/obs-scenes/client.ts` | `ObsWebSocketClient` + реализация | Добавить в интерфейс и реализацию: `getSceneItemList(sceneName)`, `getInputSettings(inputName)`, `setInputSettings(inputName, settings)` |
| `src/modules/obs-scenes/scenes-service.ts` | `createObsScenesServiceImpl` | Изменить `setScene`: если задан `outputSceneName` — найти вложенный источник и вызвать `setInputSettings`; изменить `getCurrentScene`: читать текущую сцену из вложенного источника |
| `src/modules/obs-scenes/types.ts` | Интерфейсы | Не требует изменений (интерфейс `ObsScenesService` остаётся) |
| `src/modules/obs-scenes/index.ts` | Фабрика сервиса | Передать `outputSceneName` из `ObsConfig` в `ObsScenesServiceConfig` |
| `src/modules/config/types.ts` | `ObsConfig` | Добавить `outputSceneName?: string` |
| `src/modules/config/validate.ts` | `validateEnv` | Добавить чтение `OBS_OUTPUT_SCENE_NAME` |
| `test/obs-scenes-service.test.ts` | Тесты `ObsScenesServiceImpl` | Добавить тесты: переключение через вложенный источник, fallback, логирование |
| `test/obs-scenes.test.ts` | Интеграционные тесты | Добавить тест с `outputSceneName` в конфиге |

---

## Зависимости и ограничения

### Внешние зависимости
- **obs-websocket-js (v5)**: библиотека подключена через `require`. Метод вызова — `obs.call(methodName, params)`. Добавление новых методов (`GetSceneItemList`, `GetInputSettings`, `SetInputSettings`) производится через тот же механизм без изменения зависимостей.

### Конфигурация
- Имя output-сцены задаётся через env-переменную `OBS_OUTPUT_SCENE_NAME` (новая) и хранится в `ObsConfig.outputSceneName`.
- Имя вложенного источника не задаётся явно — определяется как первый источник с `inputKind === "scene"` в сцене output. Это поведение может быть проблематично если в сцене несколько источников-сцен.

### Обратная совместимость
- Если `outputSceneName` не задан → `setScene` должен бросать ошибку (не fallback): приложение без output-сцены бессмысленно, и молчаливый fallback скрывает неправильную конфигурацию.
- `getCurrentScene` при отсутствии output-сцены также должен возвращать ошибку или `null` с предупреждением в лог.

### Потенциальные риски
- **Идентификация вложенного источника**: если в `output.*` несколько источников типа «Сцена», необходима дополнительная логика выбора (по имени источника). Сейчас спецификация не фиксирует имя источника — только тип.
- **Атомарность**: переключение вложенного источника через `SetInputSettings` — одна операция; race condition маловероятен, но возможен при параллельных командах.
- **Производительность**: каждое переключение требует дополнительного `GetSceneItemList` для поиска вложенного источника. Можно кешировать имя источника после первого успешного поиска.
- **Ответ OBS**: точная структура ответа `GetSceneItemList` и поля `inputKind` требует верификации на реальном OBS WS v5.
