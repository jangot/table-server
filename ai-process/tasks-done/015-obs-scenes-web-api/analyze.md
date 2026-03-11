# Анализ: Web API для переключения сцен OBS

## Общее описание функциональности

Задача — добавить HTTP API для ручного переключения сцен OBS через веб-запросы. Три эндпоинта:

- `POST /obs/scene` — переключить на произвольную сцену по имени (тело JSON: `{"scene": "<name>"}`)
- `POST /obs/scene/backup` — переключить на сцену `backup`
- `POST /obs/scene/default` — переключить на сцену `default`

Это четвёртый этап серии задач по управлению сценами OBS (012–016). Сервис сцен уже реализован, Telegram-команды уже работают — осталось добавить Web API как ещё один транспорт поверх существующего `ObsScenesService`.

## Связанные модули и сущности

| Модуль / файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/idle-server/index.ts` | Express-сервер, маршруты `/` и `/health` | Место добавления новых маршрутов (или подключения роутера) |
| `src/modules/obs-scenes/index.ts` | Фабрика `ObsScenesService`, точка входа модуля | Используется без изменений как источник сервиса |
| `src/modules/obs-scenes/scenes-service.ts` | Реализация сервиса: `getScenes`, `getCurrentScene`, `setScene` | Вызывается из новых обработчиков маршрутов |
| `src/modules/obs-scenes/types.ts` | Интерфейс `ObsScenesService`, ошибка `SceneNotFoundError` | `SceneNotFoundError` используется для формирования ответа 404 |
| `src/modules/obs-scenes/client.ts` | WebSocket-клиент OBS | Не изменяется, бросает `Error('OBS WebSocket not connected')` при недоступности |
| `src/modules/logger/index.ts` | Интерфейс `Logger`, фабрика | Используется для логирования `source=web` |
| `src/index.ts` | Точка входа приложения, создаёт `obsScenesService` и передаёт в бот | Нужно передать `obsScenesService` в `startIdleServer` или отдельно в новый роутер |
| `test/idle-server.test.ts` | Тесты idle-сервера: `GET /`, `GET /health` | Потребуются новые тесты для POST-эндпоинтов |

## Текущие интерфейсы и API

### `ObsScenesService` (src/modules/obs-scenes/types.ts)

```ts
interface ObsScenesService {
  getScenes(): Promise<string[]>;
  getScenesForDisplay(): Promise<SceneForDisplay[]>;
  getCurrentScene(): Promise<string | null>;
  setScene(name: string): Promise<void>;
  disconnect(): Promise<void>;
}
```

Ключевой метод — `setScene(name)`:
- Успех → нет возврата (void)
- Если сцена не существует в OBS → бросает `SceneNotFoundError`
- Если OBS недоступен (не подключён) → бросает `Error('OBS WebSocket not connected')`

### `startIdleServer` (src/modules/idle-server/index.ts)

```ts
function startIdleServer(config: AppConfig): Promise<http.Server>
```

Принимает только `config`. Не принимает зависимости (сервисы). Для добавления маршрутов, требующих `ObsScenesService`, нужно либо добавить параметр, либо использовать мутабельную ссылку аналогично `setHealthChecker`.

### Текущий паттерн мутабельной зависимости (idle-server)

В `idle-server/index.ts` уже используется паттерн `setHealthChecker(fn)` — модуль-уровневая переменная, задаётся извне после старта. Такой же паттерн можно применить для `ObsScenesService`.

### `Logger`

```ts
interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}
```

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить / создать |
|---|---|---|
| `src/modules/idle-server/index.ts` | Express app, маршруты `/`, `/health` | Добавить `express.json()` middleware, добавить три POST-маршрута; добавить способ инжектить `ObsScenesService` и `Logger` (параметр или setter) |
| `src/index.ts` | Инициализация и подключение модулей | Передать `obsScenesService` и `logger` в idle-server (после его старта) |
| `test/idle-server.test.ts` | Тесты текущих маршрутов | Добавить тесты для `POST /obs/scene`, `/obs/scene/backup`, `/obs/scene/default` — успех, 400, 404, 503 |

Возможен вариант с отдельным файлом роутера (`src/modules/idle-server/obs-routes.ts`), подключаемым к тому же Express app.

## Зависимости и ограничения

- **`express.json()` не включён** — сейчас в `startIdleServer` не добавлен middleware для парсинга JSON-тела. Нужно добавить перед новыми маршрутами.
- **Инжекция `ObsScenesService`** — `startIdleServer` не принимает сервисы. Нужно расширить API функции или использовать паттерн setter (аналог `setHealthChecker`).
- **`ObsScenesService` может быть `null`** — если OBS не сконфигурирован, `createObsScenesService` возвращает `null`. API должен возвращать 503 при отсутствии сервиса.
- **Формат логирования** — key=value, совместимый с существующим стилем: `scene_switch source=web scene=<name> success=true/false`.
- **Авторизация не требуется** — согласно §12 требований и задаче, на данном этапе не реализуется.
- **Только `Content-Type: application/json`** — `application/x-www-form-urlencoded` не поддерживать. При неверном типе или отсутствии поля `scene` → 400.
- **Обработка ошибок OBS**:
  - `SceneNotFoundError` → 404
  - `Error('OBS WebSocket not connected')` или другие → 503
