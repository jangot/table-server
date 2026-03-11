# Анализ: Telegram-команды для управления сценами OBS

## Общее описание функциональности

Задача расширяет Telegram-бота новыми командами для управления сценами OBS через WebSocket-сервис (`ObsScenesService`), созданный в задачах 012–013. Пользователь получает возможность прямо из Telegram видеть список сцен, переключаться между ними по имени, узнавать текущую сцену и быстро переключаться на сцены `backup` / `default`. Команда `/status` дополняется статусом OBS и текущей сценой.

Все новые команды защищены существующим механизмом `ALLOWED_TELEGRAM_USERS`. Отказы неавторизованным и команды управления сценами логируются в формате `key=value`.

## Связанные модули и сущности

| Модуль / файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/telegram-bot/handlers.ts` | Обработчики команд бота | Добавить обработчики `/scenes`, `/scene`, `/current`, `/backup`, `/default`; расширить `/status` |
| `src/modules/telegram-bot/types.ts` | Интерфейс `TelegramBotDeps` | Добавить опциональное поле `obsScenes?: ObsScenesService` |
| `src/modules/telegram-bot/run.ts` | Регистрация команд Telegraf | Зарегистрировать новые команды `bot.command(...)` |
| `src/modules/obs-scenes/types.ts` | Контракт `ObsScenesService` | Используется без изменений |
| `src/modules/obs-scenes/index.ts` | Фабрика сервиса сцен | Используется без изменений |
| `src/index.ts` | Точка входа приложения | Передать `obsScenesService` в `startBot` |
| `src/modules/users/` | `AllowedUsersChecker` | Используется без изменений |
| `test/telegram-bot.test.ts` | Тесты обработчиков | Добавить тесты новых обработчиков |

## Текущие интерфейсы и API

### `TelegramBotDeps` (`src/modules/telegram-bot/types.ts`)
```ts
export interface TelegramBotDeps {
  config: AppConfig;
  logger: Logger;
  allowedUsers: AllowedUsersChecker;
  navigateToUrl: (url: string, deps: { config: AppConfig; logger: Logger }) => Promise<void>;
  isChromeAlive: (config: AppConfig) => boolean;
  isObsAlive: (config: AppConfig) => boolean;
  restartChrome?: (config: AppConfig, logger: Logger) => Promise<void>;
  restartObs?: (config: AppConfig, logger: Logger) => Promise<void>;
  // ← нужно добавить: obsScenes?: ObsScenesService
}
```

### `ObsScenesService` (`src/modules/obs-scenes/types.ts`)
```ts
interface ObsScenesService {
  getScenes(): Promise<string[]>;
  getScenesForDisplay(): Promise<SceneForDisplay[]>;
  getCurrentScene(): Promise<string | null>;
  setScene(name: string): Promise<void>;  // throws SceneNotFoundError
}
```

### `SceneForDisplay`
```ts
interface SceneForDisplay {
  name: string;
  title?: string;   // из scenesConfig (JSON-файл)
  type?: string;
  enabled?: boolean;
}
```

### `SceneNotFoundError`
Выбрасывается `setScene()` при несуществующей сцене. Имеет поле `sceneName: string`.

### Паттерн авторизации (существующий)
Все обработчики проверяют `deps.allowedUsers.isAllowed({ id, username })`. При отказе — `ctx.reply('Доступ запрещён.')` и возврат. Неавторизованные попытки логируются через `deps.logger.warn(...)`.

### Паттерн логирования (существующий)
```ts
deps.logger.info('Telegram bot: remote command processed', { type: 'scenes', userId: from.id });
deps.logger.warn('Telegram bot: unauthorized request', { userId: from.id, username: from.username });
```

### Регистрация команд в `run.ts` (существующий паттерн)
```ts
bot.command('status', (ctx) => handleStatus(ctx as ..., deps));
```

### Точка входа `src/index.ts`
`obsScenesService` уже создаётся через `createObsScenesService(...)` и помечен комментарием «reserved for Telegram bot (014)». Передать его в `startBot(...)`.

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить / создать |
|---|---|---|
| `src/modules/telegram-bot/types.ts` | `TelegramBotDeps` | Добавить `obsScenes?: ObsScenesService` |
| `src/modules/telegram-bot/handlers.ts` | Обработчики команд | Добавить `handleScenes`, `handleScene`, `handleCurrent`, `handleBackup`, `handleDefault`; расширить `handleStatus` |
| `src/modules/telegram-bot/run.ts` | Registrация Telegraf-команд | Зарегистрировать 5 новых команд |
| `src/index.ts` | Точка входа | Передать `obsScenesService` в объект `deps` при вызове `startBot` |
| `test/telegram-bot.test.ts` | Тесты обработчиков | Добавить тесты новых обработчиков (авторизация, успех, ошибки) |

## Зависимости и ограничения

- **`obsScenes` опциональный:** OBS WebSocket может быть не настроен. Обработчики команд сцен должны корректно отвечать при `obsScenes == null` или при ошибке подключения.
- **`SceneNotFoundError`:** `setScene()` выбрасывает специализированную ошибку при несуществующей сцене — нужно поймать её отдельно и дать понятное сообщение пользователю.
- **Имена сцен `backup` / `default`:** хардкодятся в обработчиках `/backup` и `/default`; в конфиге нет отдельных полей для этих имён.
- **`getScenesForDisplay()`:** возвращает `SceneForDisplay[]` с опциональным `title` (из JSON-конфига сцен). При выводе `/scenes` стоит использовать `title` если задан, иначе `name`.
- **`isConnected()`:** в `ObsWebSocketClient` есть метод, но в `ObsScenesService` его нет. Проверить доступность OBS можно через `isObsAlive` из `deps` или поймать ошибку из методов сервиса.
- **Telegraf:** команды регистрируются через `bot.command(name, handler)`. `/scene <name>` передаётся через `ctx.message.text`.
- **Тесты:** существующий `test/telegram-bot.test.ts` использует `node:test` + `node:assert`, мок-объекты создаются inline — новые тесты следует добавить в тот же файл в тот же стиль.
