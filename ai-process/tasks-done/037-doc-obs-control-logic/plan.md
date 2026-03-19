# План реализации: Документ — логика управления OBS (без запуска)

Собрать в один MD-документ полное описание логики управления уже запущенным OBS: WebSocket, сцены, проектор, привязка Chrome-источника, конфигурация только для управления. Документ предназначен для переноса в другой репозиторий; параметры запуска OBS в документ не включать.

## 1. Создать файл документа и вводный раздел

**Файл (создать):** `docs/obs-control-logic.md`

Создать файл с заголовком, кратким назначением документа (для переноса в другой репозиторий, только управление по WebSocket) и оглавлением по разделам ниже. Явно указать, что параметры запуска OBS (path, configDir, readyTimeout, profilePath, launch, restart) в документ не входят.

```markdown
# OBS control logic (without launch)

This document describes how the application controls an already running OBS instance via WebSocket...
```

## 2. Раздел: подключение к OBS по WebSocket

**Файл (изменить):** `docs/obs-control-logic.md`

Описать на основе `src/modules/obs-scenes/client.ts`:
- URL: `ws://${host}:${port}`, пароль при подключении.
- Методы: `connect()`, `disconnect()`, `isConnected()`.
- Переподключение при разрыве: экспоненциальная задержка (старт 3s, макс 60s).
- Зависимость: OBS WebSocket 5.x, библиотека `obs-websocket-js`.

Привести таблицу конфигурации из `config/types.ts` и `config/validate.ts`: только поля управления — `host`, `port`, `password` (переменные `OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD`).

## 3. Раздел: данные и действия OBS API

**Файл (изменить):** `docs/obs-control-logic.md`

На основе `client.ts` выписать:
- **Получение данных:** GetSceneList, GetCurrentProgramScene, GetMonitorList, GetSceneItemList(sceneName), GetInputSettings(inputName). Соответствие методам клиента: `getSceneList()`, `getCurrentProgramScene()`, `getMonitorList()`, `getSceneItemList(sceneName)`, `getInputSettings(inputName)`.
- **Действия:** SetCurrentProgramScene(sceneName), OpenSourceProjector(sourceName, monitorIndex), SetSceneItemEnabled(sceneName, sceneItemId, enabled), SetInputSettings(inputName, inputSettings).

Кратко указать назначение каждого действия в контексте приложения (переключение сцены, проектор, привязка источника).

## 4. Раздел: роли сцен и логика переключения

**Файл (изменить):** `docs/obs-control-logic.md`

На основе `scenes-service.ts`, `types.ts` и `docs/requirements/obs-scene-requirements.md` описать:
- Роли: **main** (проекторная, не переключается), **output** (агрегирующая, имя из `outputSceneName`), **input** (вложенные переключаемые), **backup** / **default** (специальные по имени).
- Определение текущей сцены: в сцене `outputSceneName` ищутся вложенные сцены (scene items с sourceType OBS_SOURCE_TYPE_SCENE); текущая — единственная с `sceneItemEnabled === true`.
- Переключение: в `outputSceneName` для всех вложенных сцен вызывается SetSceneItemEnabled: `true` только для sourceName === name, остальные `false`. Ошибка SceneNotFoundError, если name не найден среди вложенных.
- Сервис: `getScenes()`, `getScenesForDisplay()` (с учётом конфига), `getCurrentScene()`, `setScene(name)`.

```typescript
// Логика setScene: включить только одну вложенную сцену в output
// SetSceneItemEnabled(sceneName, itemId, name === sourceName)
```

## 5. Раздел: конфигурация сцен (JSON)

**Файл (изменить):** `docs/obs-control-logic.md`

На основе `scenes-config.ts` и `types.ts` (SceneConfigEntry):
- Путь: переменная окружения `SCENES_CONFIG_PATH` (из AppConfig).
- Формат: JSON-массив объектов `{ name, title?, type?, enabled? }`, type: main | output | input | backup | default.
- Назначение: отображение и фильтрация переключаемых сцен; сцены с type=main или enabled=false исключаются из переключаемых. Источник истины по наличию сцен — OBS.

## 6. Раздел: проектор и привязка Chrome-источника

**Файл (изменить):** `docs/obs-control-logic.md`

**Проектор** (по `obs-scenes/index.ts`): при onConnected — GetMonitorList, GetSceneList; выбор сцены для проектора по `projectorSceneName` или по имени вида output.*; вызов OpenSourceProjector(projectorType: Source). Конфиг: `OBS_PROJECTOR_MONITOR_NAME`, `OBS_PROJECTOR_SCENE_NAME`.

**Привязка Chrome** (по `chrome-window-bind.ts`): поиск окна по классу (xdotool), получение XID, вызов SetInputSettings(sourceName, { capture_window: xid }). Конфиг: `OBS_CHROME_SOURCE_NAME`. Зависимости: xdotool (Linux), источник в OBS с настройкой capture_window.

## 7. Раздел: конфигурация управления (сводная таблица)

**Файл (изменить):** `docs/obs-control-logic.md`

Одна таблица переменных окружения и полей конфига только для управления (без path, configDir, readyTimeout, profilePath, launch, restart):

| Переменная / поле | Назначение |
|-------------------|------------|
| OBS_HOST / host   | Хост WebSocket |
| OBS_PORT / port   | Порт |
| OBS_PASSWORD / password | Пароль |
| OBS_PROJECTOR_MONITOR_NAME | Монитор для Source Projector |
| OBS_PROJECTOR_SCENE_NAME  | Сцена для проектора |
| OBS_OUTPUT_SCENE_NAME     | Имя output-сцены |
| OBS_CHROME_SOURCE_NAME    | Имя источника для привязки окна Chrome |
| SCENES_CONFIG_PATH       | Путь к JSON конфига сцен |

## 8. Раздел: точки входа (зависимости)

**Файл (изменить):** `docs/obs-control-logic.md`

Кратко описать, откуда вызывается логика управления:
- **Создание сервиса:** `src/index.ts` — createObsScenesService(config.obs, logger, config.scenesConfigPath), передача в idle-server и telegram-bot.
- **HTTP API** (`idle-server/index.ts`): GET /obs/scenes (текущая сцена + список для отображения), POST /obs/scene (тело: имя сцены), POST /obs/scene/backup, POST /obs/scene/default.
- **Telegram** (`telegram-bot/handlers.ts`): команды /scenes, /scene, /current, /backup, /default, /status; callback_data для кнопок сцен (например scene:name); фильтр сцен по префиксу `src.` для списка.

Указать, что контракты (что вызывать к OBS и как интерпретировать конфиг) не привязаны к Node/Express/Telegram — другой стек может реализовать то же по описанию.

## 9. Проверка документа (ручная)

**Файл:** не создаётся отдельный тестовый файл; проверка по чеклисту.

Сценарии проверки перед завершением задачи:
- Документ содержит все разделы: подключение WebSocket, данные/действия API, роли сцен и переключение, конфиг сцен (JSON), проектор, привязка Chrome, сводная таблица конфигурации, точки входа.
- В документе нет упоминаний параметров запуска: path, configDir, readyTimeout, profilePath, launch, restart, бинарник OBS.
- Все перечисленные в analyze.md модули/файлы отражены в документе (client, scenes-service, scenes-config, chrome-window-bind, config types/validate, idle-server, telegram-bot, index.ts).

## Сводка файлов

| Действие | Файл |
|----------|------|
| Создать  | `docs/obs-control-logic.md` |

## Ссылки

- [analyze.md](./analyze.md) текущей задачи
