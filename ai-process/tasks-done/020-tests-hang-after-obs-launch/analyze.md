# Анализ: Тесты зависают после запуска OBS

## Общее описание функциональности

Тесты в `test/obs.test.ts` зависают после запуска OBS. Причина — нежелательные побочные эффекты при тестировании модулей, которые используют глобальное состояние и реально запускают процессы. Необходимо определить точные причины зависания и устранить их без потери покрытия.

## Связанные модули и сущности

| Модуль/файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/obs/index.ts` | Создание модуля OBS, управление жизненным циклом процесса | Глобальные переменные `performRestartRef`, `obsProcess` |
| `src/modules/obs/launch.ts` | Запуск OBS-процесса через `spawn` | Глобальная переменная `obsProcess`, логика ожидания |
| `src/modules/obs/ready.ts` | Ожидание готовности OBS через polling | Используется в `launchObs` |
| `src/modules/obs/restart.ts` | Вспомогательные функции throttling перезапуска | Не затрагивает задача |
| `src/modules/obs/args.ts` | Построение аргументов для запуска OBS | Не затрагивает задача |
| `src/modules/obs-scenes/client.ts` | WebSocket-клиент для OBS | Таймеры переподключения, открытые сокеты |
| `src/modules/obs-scenes/index.ts` | Фабрика obs-scenes сервиса | Вызывает `client.connect()` при создании |
| `test/obs.test.ts` | Тесты для OBS-модуля | Основной файл с проблемой |
| `test/obs-scenes.test.ts` | Тесты для obs-scenes сервиса | Потенциальная вторичная проблема |

## Текущие интерфейсы и API (если есть)

### `launchObs(obsPath, args, timeoutMs, logger): Promise<void>`
Запускает OBS через `spawn(obsPath, args, { stdio: 'ignore', shell: false })`. Устанавливает глобальную переменную модуля `obsProcess`. **Нет вызова `proc.unref()`** — дочерний процесс удерживает event loop Node.js.

### `createObsModule(config, logger): AppModule`
При вызове устанавливает **модуль-уровневую глобальную переменную** `performRestartRef = performRestart`. Эта переменная сохраняется между тестами (модуль кешируется Node.js).

### `restartObs(_config, _logger): Promise<void>`
Вызывает `performRestartRef?.()` и немедленно возвращает `Promise.resolve()`. Если `performRestartRef` установлен предыдущим вызовом `createObsModule`, вызывает реальный перезапуск OBS.

### `waitForObsReady(proc, timeoutMs): Promise<void>`
Polling через `setTimeout` с интервалом 250ms. Разрешается через 250ms если процесс жив, отклоняется по таймауту или если процесс завершился.

### `createObsScenesService(config, logger): ObsScenesService | null`
Создаёт WebSocket-клиент и немедленно вызывает `client.connect()`. При недоступности OBS клиент продолжает переподключаться через `setTimeout` (от 3000ms до 60000ms).

## Файлы и места в коде

| Файл | Что содержит | Проблема |
|---|---|---|
| `test/obs.test.ts:131-136` | Тест `restartObs` | Тест описывается как "module not started", но `performRestartRef` уже установлен тестом `createObsModule` выше. Вызов `restartObs` запускает реальный OBS |
| `test/obs.test.ts:114-122` | Тест `createObsModule` | Устанавливает `performRestartRef` — глобальный side effect |
| `src/modules/obs/index.ts:11` | `let performRestartRef` | Модуль-уровневая глобальная переменная, сохраняется между тестами |
| `src/modules/obs/launch.ts:11` | `let obsProcess` | Модуль-уровневая глобальная переменная |
| `src/modules/obs/launch.ts:27` | `spawn(obsPath, args, ...)` | Отсутствует `proc.unref()` — дочерний процесс удерживает event loop |
| `src/modules/obs/index.ts:26` | `proc.once('exit', ...)` в `scheduleRestart` | Слушатель события удерживает ссылку на процесс |
| `test/obs-scenes.test.ts:106-120` | Тест создания сервиса с реальным WebSocket | Вызывает `client.connect()` → попытки подключения к реальному OBS WebSocket |
| `src/modules/obs-scenes/client.ts:54-63` | `scheduleReconnect()` | Устанавливает `setTimeout` при неудаче подключения, при незакрытом `disconnect()` может удерживать event loop |

## Зависимости и ограничения

### Причина 1 (главная): Реальный запуск OBS из теста `restartObs`

Порядок тестов в `obs.test.ts`:
1. `createObsModule` — создаёт модуль, устанавливает `performRestartRef`
2. `isObsAlive` — безобидный
3. `restartObs` — вызывает `restartObs()`, который видит `performRestartRef !== null` и вызывает реальный `run()` → `launchObs('/usr/bin/obs', [], 10000, logger)` → `spawn('/usr/bin/obs')`

Если OBS установлен на машине, процесс успешно запускается. Затем:
- `scheduleRestart()` вешает listener `proc.once('exit', ...)` — это удерживает event loop
- Без `proc.unref()` сам дочерний процесс удерживает event loop
- Тест-раннер не может завершиться, пока event loop не опустеет

### Причина 2 (вторичная): WebSocket-клиент в тесте `obs-scenes`

Тест `'returns service with...'` в `obs-scenes.test.ts` создаёт сервис через `createObsScenesService`, который вызывает `client.connect()`. Подключение к несуществующему серверу (`localhost:4455`) завершается ошибкой, затем `scheduleReconnect()` устанавливает `setTimeout(tryConnect, 3000)`. Хотя `after()` вызывает `disconnect()` для очистки, есть race condition: если `tryConnect()` уже вызван и создал новый сокет, но `disconnect()` вызван до того, как `obs = socket` был выполнен, таймер может остаться активным.

### Ограничения архитектуры

- **Глобальное состояние**: `performRestartRef` и `obsProcess` — модуль-уровневые глобальные переменные. Node.js кеширует модули, поэтому между тестами состояние сохраняется.
- **Отсутствие `proc.unref()`**: По умолчанию `spawn()` удерживает event loop Node.js активным. Для фоновых процессов нужен `proc.unref()`.
- **Нет mock для child_process**: Тесты не используют моки для `spawn`, что приводит к реальным запускам процессов.

### Внешние зависимости

- `obs-websocket-js` — внешняя библиотека WebSocket, может иметь внутренние таймеры
- Реально установленный `/usr/bin/obs` на тестовой машине
