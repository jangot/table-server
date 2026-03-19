# Анализ: Документ — логика управления OBS (без запуска)

## Общее описание функциональности

Задача — собрать в один MD-документ **полное описание логики управления OBS** в текущем POC: только то, **чем** и **как** приложение управляет уже запущенным OBS (WebSocket, сцены, проектор, привязка Chrome-источника). Цель — перенос в другой репозиторий, где OBS не запускается приложением, а только управляется по WebSocket. В документ **не включаются** параметры и настройки запуска OBS (путь к бинарнику, аргументы, configDir и т.д.).

Итог: один структурированный MD-файл на русском или английском с заголовками и перечнями, пригодный для копирования в другой проект.

## Связанные модули и сущности

| Модуль/файл | Назначение | Что затрагивает задача |
|-------------|------------|-------------------------|
| `src/modules/obs-scenes/` | Подключение к OBS по WebSocket, сервис сцен, проектор, привязка Chrome | Основной источник логики управления — всё описать |
| `src/modules/obs-scenes/client.ts` | Низкоуровневый WebSocket-клиент (подключение, переподключение, вызовы OBS API) | Подключение, методы API, переподключение |
| `src/modules/obs-scenes/scenes-service.ts` | Реализация ObsScenesService: список сцен, текущая сцена, переключение через output-сцену | Логика переключения, роли сцен (main/output/input) |
| `src/modules/obs-scenes/scenes-config.ts` | Загрузка опционального JSON конфига сцен (title, type, enabled) | Конфиг сцен для отображения/переключения |
| `src/modules/obs-scenes/chrome-window-bind.ts` | Привязка окна Chrome к OBS-источнику (capture_window) через xdotool + SetInputSettings | Действие управления: привязка источника к окну |
| `src/modules/config/types.ts` | Типы конфигурации (ObsConfig и др.) | Выделить поля, относящиеся только к **управлению** |
| `src/modules/config/validate.ts` | Чтение env и маппинг в ObsConfig | Перечислить переменные окружения только для управления |
| `src/modules/idle-server/index.ts` | HTTP API и SSR: GET /obs/scenes, POST /obs/scene, backup, default | Зависимости: откуда приходят команды (HTTP) |
| `src/modules/telegram-bot/handlers.ts` | Команды Telegram: /scenes, /scene, /current, /backup, /default, /status, callback кнопки сцен | Зависимости: откуда приходят команды (Telegram) |
| `src/index.ts` | Создание ObsScenesService, передача в idle-server и telegram-bot | Контекст: кто создаёт сервис и куда передаётся |
| `src/modules/obs/` | Запуск и рестарт процесса OBS | **Не включать** в документ (задача только про управление) |
| `docs/requirements/obs-scene-requirements.md` | Требования по сценам, конфигу, типам (main/output/input) | Справочник при составлении документа |
| `docs/plan-obs-scenes.md` | План реализации сцен | Доп. контекст по этапам |

## Текущие интерфейсы и API (управление OBS)

### ObsWebSocketClient (client.ts)

- **Подключение:** `connect()`, `disconnect()`, `isConnected()`. URL: `ws://${host}:${port}`, пароль при connect. При разрыве — автоматическое переподключение с экспоненциальной задержкой (3s → 60s max).
- **Данные:** `getSceneList()`, `getCurrentProgramScene()`, `getMonitorList()`, `getSceneItemList(sceneName)`, `getInputSettings(inputName)`.
- **Действия:** `setCurrentProgramScene(sceneName)`, `openSourceProjector(sourceName, monitorIndex)`, `setSceneItemEnabled(sceneName, sceneItemId, sceneItemEnabled)`, `setInputSettings(inputName, inputSettings)`.
- OBS WebSocket методы: GetSceneList, GetCurrentProgramScene, SetCurrentProgramScene, GetMonitorList, OpenSourceProjector (projectorType: Source), GetSceneItemList, SetSceneItemEnabled, GetInputSettings, SetInputSettings.

### ObsScenesService (types.ts, scenes-service.ts)

- `getScenes()` — список имён сцен из OBS.
- `getScenesForDisplay()` — список сцен с учётом конфига (title, type, enabled); сцены с type=main или enabled=false исключаются из переключаемых.
- `getCurrentScene()` — текущая активная сцена в **output-сцене**: определяется по вложенным сценам (scene items с sourceType OBS_SOURCE_TYPE_SCENE) в сцене `outputSceneName`, из них выбирается единственная с включённым sceneItemEnabled.
- `setScene(name)` — переключение: в сцене `outputSceneName` включается только scene item с sourceName === name, остальные отключаются (SetSceneItemEnabled). Бросает SceneNotFoundError, если name не найден среди вложенных сцен.
- `disconnect()`, `isConnected()` — делегируются клиенту.

### Роли сцен (types, docs)

- **main** — проекторная сцена, не переключается пользователем; используется для вывода на проектор (OpenSourceProjector).
- **output** — агрегирующая сцена; в ней переключают видимость вложенных сцен (input-сцен). Имя задаётся `outputSceneName`.
- **input** — входные сцены, переключаемые внутри output. В Telegram фильтр по префиксу `src.` для списка сцен.
- **backup** / **default** — специальные сцены по имени; отдельные команды/кнопки.

### Конфигурация сцен (scenes-config)

- Опциональный JSON по пути `SCENES_CONFIG_PATH`: массив объектов `{ name, title?, type?, enabled? }`. type: main | output | input | backup | default. Используется для отображения и фильтрации переключаемых сцен; источник истины по наличию сцен — OBS.

## Файлы и места в коде

| Файл | Что содержит | Что нужно отразить в документе |
|------|----------------|---------------------------------|
| `obs-scenes/client.ts` | URL (host, port), password, onConnected; переподключение; все вызовы obs.call(...) | Раздел: подключение к OBS, переподключение; раздел: получаемые данные и действия (список методов и параметров). |
| `obs-scenes/index.ts` | Создание клиента, onConnected: открытие проектора (getMonitorList, getSceneList, поиск сцены по projectorSceneName или output.*, openSourceProjector), bindChromeWindow | Раздел: открытие Source Projector на монитор; раздел: привязка Chrome-источника к окну. |
| `obs-scenes/scenes-service.ts` | getNestedSceneItems(outputSceneName), isSwitchableScene(entry), getScenesForDisplay (фильтр по type/enabled), getCurrentScene (по включённому item в output), setScene (SetSceneItemEnabled по списку items) | Раздел: роли сцен (main/output/input), логика переключения через output-сцену, определение текущей сцены. |
| `obs-scenes/types.ts` | SceneConfigEntry (name, title, type, enabled), SceneForDisplay, ObsScenesService, SceneNotFoundError | Раздел: конфиг сцен (формат, типы), ошибки. |
| `obs-scenes/scenes-config.ts` | loadScenesConfigSync(path) — чтение JSON, парсинг в SceneConfigEntry[] | Раздел: конфигурация сцен (путь, формат). |
| `obs-scenes/chrome-window-bind.ts` | xdotool search по классу chrome → XID → setInputSettings(sourceName, { capture_window: xid }) | Раздел: привязка окна Chrome к источнику OBS (имя источника, параметр capture_window). |
| `config/types.ts` (ObsConfig) | path, readyTimeout, profilePath, configDir — **запуск**; host, port, password, projectorMonitorName, projectorSceneName, outputSceneName, chromeSourceName — **управление** | В документе перечислить только поля/переменные для управления. |
| `config/validate.ts` | OBS_HOST, OBS_PORT, OBS_PASSWORD, OBS_PROJECTOR_MONITOR_NAME, OBS_PROJECTOR_SCENE_NAME, OBS_OUTPUT_SCENE_NAME, OBS_CHROME_SOURCE_NAME; SCENES_CONFIG_PATH в AppConfig | Таблица конфигурации управления (переменные и назначение). |
| `idle-server/index.ts` | setObsScenesService; GET /obs/scenes (getCurrentScene, getScenesForDisplay); POST /obs/scene, /obs/scene/backup, /obs/scene/default | Раздел: зависимости — HTTP API (маршруты и тело запросов). |
| `telegram-bot/handlers.ts` | obsScenes: getScenesForDisplay (фильтр src.*), getCurrentScene, setScene; команды /scenes, /scene, /current, /backup, /default, /status; callback scene:name, menu | Раздел: зависимости — Telegram (команды и callback_data). |
| `src/index.ts` | createObsScenesService(config.obs, logger, config.scenesConfigPath), setObsScenesService, startBot(..., obsScenes) | Кратко: кто создаёт сервис и куда передаётся. |
| `docs/requirements/obs-scene-requirements.md` | Требования по сценам, конфигу §5, типы main/output/input/backup/default | Использовать при формулировке разделов про роли и конфиг. |

## Зависимости и ограничения

- **Зависимости от кода:** документ составляется на основе перечисленных файлов; при переносе в другой репозиторий нужны только описание контрактов (что вызывать к OBS и как интерпретировать конфиг), без привязки к Node/Express/Telegram — т.е. другой стек может реализовать те же действия по описанию.
- **Внешние зависимости управления:** библиотека `obs-websocket-js` (OBS WebSocket 5.x); для привязки Chrome — `xdotool` (Linux) и наличие источника с настройкой capture_window в OBS.
- **Ограничения:** переключение сцен реализовано через одну «output»-сцену (OBS_OUTPUT_SCENE_NAME), внутри неё переключаются вложенные сцены через SetSceneItemEnabled; текущая сцена выводится на проектор через OpenSourceProjector отдельной сцены (projectorSceneName или output.*). В новом приложении без запуска OBS не будет вызова restartObs/isObsAlive в смысле процесса — только состояние WebSocket (connected/disconnected).
- **Риски:** в документе не должны попасть ссылки на path, configDir, readyTimeout, profilePath, launch, restart — они отнесены к задаче 039 (параметры запуска). Проверить, что все упоминания конфигурации в документе — только управление (host, port, password, имена сцен/монитора/источника, путь к scenes config).
