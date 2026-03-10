# План реализации: Внешний интерфейс — Telegram-бот (MVP)

Реализовать приём команд через Telegram Bot API: оператор присылает ссылку боту → проверка по списку разрешённых пользователей → вызов переключения URL в Chrome → ответ об успехе или ошибке (не авторизован, система не готова). Модуль пользователей с источником из env и интерфейсом, допускающим замену на БД позже.

## 1. Расширение конфигурации — типы

**Файл (изменить):** `src/modules/config/types.ts`

Добавить в `AppConfig` опциональные поля для бота:

- `telegramBotToken?: string` — токен бота (если не задан, бот не запускается).
- `allowedTelegramUsers?: string[]` — список разрешённых идентификаторов: числовые строки (Telegram user id) и/или username без `@` (например `123456789`, `johndoe`).

```typescript
// В AppConfig добавить:
/** Telegram Bot API token (env: TELEGRAM_BOT_TOKEN). If not set, bot is not started. */
telegramBotToken?: string;
/** Allowed Telegram user ids or usernames without @ (env: ALLOWED_TELEGRAM_USERS, comma-separated). */
allowedTelegramUsers?: string[];
```

## 2. Расширение конфигурации — валидация env

**Файл (изменить):** `src/modules/config/validate.ts`

- Читать `TELEGRAM_BOT_TOKEN` через `getEnv`; если задан и не пустой — обрезать пробелы и положить в конфиг, иначе не добавлять поле.
- Читать `ALLOWED_TELEGRAM_USERS`: одна строка, разделитель — запятая; разбить по `,`, обрезать пробелы у каждого элемента, отфильтровать пустые; массив строк положить в конфиг (если строка пустая — `undefined` или пустой массив, на усмотрение; для MVP при запуске бота можно считать «пустой список = никого не разрешено»).

Не делать токен обязательным: при его отсутствии бот просто не стартует.

```typescript
// После существующих полей в validateEnv():
const telegramBotToken = getEnv('TELEGRAM_BOT_TOKEN')?.trim();
const allowedRaw = getEnv('ALLOWED_TELEGRAM_USERS');
const allowedTelegramUsers =
  allowedRaw === undefined || allowedRaw.trim() === ''
    ? undefined
    : allowedRaw.split(',').map((s) => s.trim()).filter(Boolean);

return {
  // ... существующие поля
  ...(telegramBotToken ? { telegramBotToken } : {}),
  allowedTelegramUsers: allowedTelegramUsers?.length ? allowedTelegramUsers : undefined,
};
```

## 3. Модуль пользователей (users)

**Файл (создать):** `src/modules/users/types.ts`

Интерфейс проверки разрешённого пользователя, не привязанный к источнику данных (позже источник можно заменить на БД):

```typescript
export interface AllowedUsersChecker {
  /** Check if user is allowed by id and/or username (at least one may be provided). */
  isAllowed(identifier: { id?: number; username?: string }): boolean;
}
```

**Файл (создать):** `src/modules/users/fromConfig.ts`

Реализация на основе `AppConfig.allowedTelegramUsers`: массив строк, где элемент либо числовая строка (user id), либо username без `@`. В `isAllowed` сравнивать `identifier.id` с числовыми элементами и `identifier.username` (нормализовать: без ведущего `@`, toLowerCase) со строковыми.

```typescript
import type { AppConfig } from '../config/types';
import type { AllowedUsersChecker } from './types';

export function createAllowedUsersChecker(config: AppConfig): AllowedUsersChecker {
  const list = config.allowedTelegramUsers ?? [];
  return {
    isAllowed(identifier: { id?: number; username?: string }): boolean {
      if (list.length === 0) return false;
      if (identifier.id != null && list.includes(String(identifier.id))) return true;
      const uname = identifier.username?.replace(/^@/, '').toLowerCase();
      if (uname != null && uname !== '' && list.some((s) => s.toLowerCase() === uname)) return true;
      return false;
    },
  };
}
```

**Файл (создать):** `src/modules/users/index.ts`

Экспорт типов и фабрики:

```typescript
export type { AllowedUsersChecker } from './types';
export { createAllowedUsersChecker } from './fromConfig';
```

## 4. Зависимость Telegram Bot API

**Файл (изменить):** `package.json`

Добавить зависимость `telegraf` (актуальная мажорная версия с поддержкой TypeScript). В `scripts.test` добавить новые тестовые файлы (см. шаг 7).

```json
"dependencies": {
  "telegraf": "^4.x.x",
  ...
}
```

После добавления выполнить `npm install`.

## 5. Модуль Telegram-бота

**Файл (создать):** `src/modules/telegram-bot/types.ts`

Типы зависимостей бота:

```typescript
import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';
import type { AllowedUsersChecker } from '../users';

export interface TelegramBotDeps {
  config: AppConfig;
  logger: Logger;
  allowedUsers: AllowedUsersChecker;
  navigateToUrl: (url: string, deps: { config: AppConfig; logger: Logger }) => Promise<void>;
  isChromeAlive: (config: AppConfig) => boolean;
  isObsAlive: (config: AppConfig) => boolean;
}
```

**Файл (создать):** `src/modules/telegram-bot/run.ts`

- Импорт `Telegraf` из `telegraf`, инициализация бота с `config.telegramBotToken`.
- Обработка текстовых сообщений (и при необходимости команды типа `/open <url>`): извлечение URL из текста (простая эвристика: строка, начинающаяся с `http://` или `https://`, или первое вхождение такой подстроки).
- Для каждого входящего сообщения:
  - Получить `ctx.from` (id, username); вызвать `allowedUsers.isAllowed({ id: ctx.from.id, username: ctx.from.username })`; если нет — ответ в чат «Доступ запрещён», логировать отказ, выйти.
  - Проверить `isChromeAlive(config)` и `isObsAlive(config)`; если что-то не живо — ответ «Система не готова (Chrome/OBS недоступны)», залогировать, выйти.
  - Вызвать `navigateToUrl(url, { config, logger })`; при успехе — ответ «Страница открыта»; при ошибке (например `Chrome is not running`) — поймать, ответить текстом ошибки, залогировать.
- Логировать каждую успешную команду (например logger.info с url и user id).
- Запуск long polling: `bot.launch()`. Не делать процесс зависимым от бота: при ошибке запуска (неверный токен и т.д.) логировать ошибку и не бросать исключение выше (или обработать в месте вызова в index.ts).

```typescript
import { Telegraf, type Context, type Telegraf } from 'telegraf';
import type { TelegramBotDeps } from './types';

function extractUrl(text: string): string | null {
  const trimmed = text.trim();
  const match = trimmed.match(/https?:\/\/\S+/);
  return match ? match[0].replace(/[\s,]+$/, '') : null;
}

export function createBot(deps: TelegramBotDeps): Telegraf {
  const { config, logger, allowedUsers, navigateToUrl, isChromeAlive, isObsAlive } = deps;
  const bot = new Telegraf(config.telegramBotToken!);

  bot.on('text', async (ctx) => {
    const url = extractUrl(ctx.message.text);
    const from = ctx.from;
    if (!from) return;

    if (!allowedUsers.isAllowed({ id: from.id, username: from.username })) {
      logger.warn('Telegram bot: unauthorized request', { userId: from.id, username: from.username });
      await ctx.reply('Доступ запрещён.').catch(() => {});
      return;
    }

    if (!url) {
      await ctx.reply('Отправьте сообщение с URL (http или https).').catch(() => {});
      return;
    }

    if (!isChromeAlive(config) || !isObsAlive(config)) {
      logger.warn('Telegram bot: system not ready');
      await ctx.reply('Система не готова (Chrome или OBS недоступны).').catch(() => {});
      return;
    }

    try {
      await navigateToUrl(url, { config, logger });
      logger.info('Telegram bot: navigated to URL', { url, userId: from.id });
      await ctx.reply('Страница открыта.').catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Telegram bot: navigate failed', err);
      await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
    }
  });

  return bot;
}

export async function startBot(deps: TelegramBotDeps): Promise<void> {
  const bot = createBot(deps);
  await bot.launch();
  deps.logger.info('Telegram bot started');
}
```

**Файл (создать):** `src/modules/telegram-bot/index.ts`

Экспорт `createBot`, `startBot` и типов.

```typescript
export { createBot, startBot } from './run';
export type { TelegramBotDeps } from './types';
```

## 6. Запуск бота в точке входа

**Файл (изменить):** `src/index.ts`

- Импортировать `createAllowedUsersChecker` из `./modules/users`, `startBot` из `./modules/telegram-bot`, `navigateToUrl`, `isChromeAlive` из `./modules/chrome`, `isObsAlive` из `./modules/obs`.
- После `runOrchestrator` (и после запуска watchdog, если есть) проверить: если `config.telegramBotToken` задан — создать `allowedUsers = createAllowedUsersChecker(config)`, вызвать `startBot({ config, logger, allowedUsers, navigateToUrl, isChromeAlive, isObsAlive })` в фоне (не блокировать main). Ошибку запуска бота перехватывать: логировать и не вызывать `process.exit` (бот опционален).

Пример:

```typescript
if (config.telegramBotToken) {
  const allowedUsers = createAllowedUsersChecker(config);
  startBot({
    config,
    logger,
    allowedUsers,
    navigateToUrl,
    isChromeAlive,
    isObsAlive,
  }).catch((err) => {
    logger.error('Telegram bot failed to start', err);
  });
}
```

## 7. Документация переменных окружения

**Файл (изменить):** `docs/env.md`

В секцию Optional добавить:

| Variable | Description | Example |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token; if set, the bot starts and accepts commands | `123:ABC...` |
| `ALLOWED_TELEGRAM_USERS` | Comma-separated list of Telegram user ids or usernames (without @) allowed to send commands | `123456789,johndoe` |

Кратко пояснить: при отсутствии токена бот не запускается; при пустом списке разрешённых пользователей ни один запрос не принимается.

## 8. Тесты

**Файл (создать):** `test/users.test.ts`

Сценарии:

- Создать конфиг с `allowedTelegramUsers: ['123', 'alice']`; проверять `isAllowed({ id: 123 })` → true, `isAllowed({ id: 456 })` → false, `isAllowed({ username: 'alice' })` → true, `isAllowed({ username: 'Alice' })` → true (регистронезависимо), `isAllowed({ username: 'bob' })` → false.
- Пустой список или отсутствие поля: `isAllowed({ id: 123 })` → false.
- Username с ведущим `@`: `isAllowed({ username: '@alice' })` при наличии `alice` в списке → true.

**Файл (изменить):** `test/config.test.ts`

Добавить тесты (с учётом существующего before/after и `resetConfigForTesting`):

- При заданных `TELEGRAM_BOT_TOKEN` и `ALLOWED_TELEGRAM_USERS` в конфиге присутствуют `telegramBotToken` и `allowedTelegramUsers` с ожидаемыми значениями.
- При отсутствии `TELEGRAM_BOT_TOKEN` поле `telegramBotToken` отсутствует или undefined.
- `ALLOWED_TELEGRAM_USERS` с пробелами и запятыми парсится в массив без пустых элементов.

**Файл (создать):** `test/telegram-bot.test.ts` (опционально для MVP)

При необходимости — юнит-тест на извлечение URL из текста (`extractUrl`) и/или мок `Telegraf` для проверки ответов «Доступ запрещён» и «Система не готова». Для минимального MVP достаточно тестов users и config; тесты бота можно добавить в плане как опциональные.

**Файл (изменить):** `package.json`

В `scripts.test` добавить `test/users.test.ts` и при наличии — `test/telegram-bot.test.ts`.

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Создать  | `src/modules/users/types.ts` |
| Создать  | `src/modules/users/fromConfig.ts` |
| Создать  | `src/modules/users/index.ts` |
| Изменить | `package.json` |
| Создать  | `src/modules/telegram-bot/types.ts` |
| Создать  | `src/modules/telegram-bot/run.ts` |
| Создать  | `src/modules/telegram-bot/index.ts` |
| Изменить | `src/index.ts` |
| Изменить | `docs/env.md` |
| Создать  | `test/users.test.ts` |
| Изменить | `test/config.test.ts` |
| Создать  | `test/telegram-bot.test.ts` (опционально) |

## Ссылки

- [analyze.md](./analyze.md) текущей задачи
