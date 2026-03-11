# Анализ: OBS WebSocket и сервис управления сценами

## Общее описание функциональности

Нужно добавить подключение к OBS по **OBS WebSocket API** и реализовать **сервис управления сценами**: получение списка сцен и текущей сцены из OBS, переключение сцены по имени. Источник истины по сценам — OBS (приложение сцен не создаёт).

Задача решает первый этап плана (docs/plan-obs-scenes.md): инфраструктура для последующих этапов — команды Telegram (014), Web API (015), SSR-страница (016). Обработка недоступности OBS и разрыва соединения, логирование в формате key=value обязательны. Запуск процесса OBS остаётся в существующем модуле `obs`; WebSocket и управление сценами добавляются отдельно (новый модуль или подмодуль), без смешивания с launch.

## Связанные модули и сущности

| Модуль/файл | Назначение | Что затрагивает задача |
|-------------|------------|------------------------|
| `src/modules/obs/` | Запуск процесса OBS (launch, args, restart, ready) | Не меняем логику запуска; сервис сцен — отдельно (новый модуль или подмодуль) |
| `src/modules/config/` | Валидация env, типы AppConfig, ObsConfig | Добавить поля для OBS WebSocket: host, port, password |
| `src/modules/logger/` | Логгер (info/warn/error/debug) | Использовать как есть; формат key=value даём строкой в msg |
| `src/index.ts` | Точка входа: config, orchestrator, watchdog, telegram bot | Подключить сервис сцен (создание/запуск), передать в бота и при необходимости в idle-server в следующих задачах |
| `src/modules/telegram-bot/` | Команды status, idle, restart | В 012 не добавляем команды сцен; сервис сцен должен быть доступен для передачи в deps в 014 |
| `src/modules/orchestrator/` | Запуск модулей по очереди | Сервис сцен может быть отдельным модулем (start = подключение к WebSocket) или фабрикой без AppModule |
| `src/modules/startup-checks/` | Проверка наличия Chrome/OBS исполняемых файлов | Возможно не менять; проверка доступности OBS по WebSocket — в самом сервисе |

## Текущие интерфейсы и API (если есть)

- **AppConfig** (config/types.ts): `obs: ObsConfig` — сейчас только `path`, `readyTimeout?`, `profilePath?`. Нужно расширить или ввести отдельную секцию для WebSocket: host, port, password.
- **ObsConfig** (config/types.ts): класс с class-validator декораторами; добавление полей по аналогии с ChromeConfig.
- **validateEnv()** (config/validate.ts): собирает `plain.obs` из env (`OBS_PATH`, `OBS_READY_TIMEOUT`, `OBS_PROFILE_PATH`). Добавить чтение `OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD`.
- **Logger** (logger/index.ts): `info(msg, ...args)`, `warn`, `error`, `debug`. Для key=value — передавать одну строку в `msg`, например `scene_switch source=telegram from=chrome to=capture success=true`.
- **TelegramBotDeps** (telegram-bot/types.ts): сейчас `restartObs`, `isObsAlive` и т.д.; в 014 сюда добавят зависимости от сервиса сцен (getScenes, getCurrentScene, setScene).
- **createObsModule**, **isObsAlive**, **restartObs** (obs/index.ts): не подменять; сервис сцен — отдельный контракт (функции или класс), который можно передавать в бота и Web API.

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить/создать |
|------|--------------|----------------------------|
| `src/modules/config/types.ts` | ObsConfig, AppConfig | В ObsConfig добавить поля для WebSocket: host, port, password (типы string, number, string); при необходимости отдельный класс ObsWebSocketConfig и вложить в obs. |
| `src/modules/config/validate.ts` | validateEnv(), маппинг env → plain | Читать OBS_HOST, OBS_PORT, OBS_PASSWORD; парсить порт числом; добавить в plain.obs (или obs.websocket). Валидация: обязательность при включённом управлении сценами (условие уточнить). |
| `src/modules/obs/` | Запуск процесса OBS | Не смешивать с WebSocket. Сервис сцен — новый модуль. |
| `src/modules/obs-scenes/` или `src/modules/obs/websocket.ts` + `scenes.ts` | — | **Создать:** подключение к OBS WebSocket (библиотека obs-websocket-js или аналог), переподключение при разрыве, API: getScenes(), getCurrentScene(), setScene(name). Ошибки: OBS недоступен, сцена не найдена — возвращать понятные ошибки (не падать). Логирование: подключение, восстановление, переключение — формат key=value. |
| `src/index.ts` | main(), создание модулей, startBot(deps) | Создать экземпляр сервиса сцен (если конфиг WebSocket задан), при необходимости запустить как часть старта (подключение в фоне). Передать сервис сцен в startBot в задаче 014; в 012 можно только создать и экспортировать фабрику/функцию, чтобы не менять ещё и бота. |
| `package.json` | Зависимости | Добавить зависимость для OBS WebSocket (например `obs-websocket-js`). |
| `test/config.test.ts` | Тесты конфига | Добавить тесты для OBS_HOST, OBS_PORT, OBS_PASSWORD (опционально/обязательно в зависимости от решения по валидации). |
| `test/` | — | Добавить тесты для сервиса сцен: мокирование WebSocket-клиента, вызов getScenes/getCurrentScene/setScene, обработка ошибок (сцена не найдена, отключение). |

## Зависимости и ограничения

- **Внешняя библиотека:** OBS WebSocket API — использовать готовый клиент (например `obs-websocket-js`). Нужно проверить совместимость с версией OBS WebSocket plugin (4.x/5.x протокол).
- **Конфигурация:** в требованиях один порт 4455 для WebSocket; путь к OBS — уже `OBS_PATH`. Вопрос из description: один порт для запуска OBS и WebSocket или раздельные настройки (OBS_WEBSOCKET_HOST/PORT vs OBS_HOST/OBS_PORT). При необходимости развести по документации.
- **Обязательность полей:** OBS_HOST, OBS_PORT, OBS_PASSWORD — обязательные «при включённом управлении сценами». Варианты: (1) всегда обязательны, если в приложении есть сцена-функциональность; (2) опциональны — сервис сцен только подключается, когда все три заданы; (3) явный флаг (например OBS_WEBSOCKET_ENABLED). Решение оставить для плана.
- **Интеграция с приложением:** сервис сцен должен быть доступен для Telegram-бота (014) и Web API (015). В 012 достаточно реализовать сервис и подключить его к приложению так, чтобы в следующих задачах передать его в deps бота и в маршруты idle-server/Express.
- **Логирование (§13 требований):** плоский key=value для grep. Примеры: `scene_switch source=telegram from=chrome to=capture success=true`, `obs_connection status=reconnected`. Текущий Logger принимает строку и доп. аргументы — достаточно формировать одну строку и передавать в `logger.info(msg)`.
- **Риски:** версия протокола OBS WebSocket (4 vs 5) влияет на выбор библиотеки и формат запросов; при недоступности OBS сервис не должен падать при старте — переподключение в фоне.
