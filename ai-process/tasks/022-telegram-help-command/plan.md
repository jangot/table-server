# План реализации: Команда /help в Telegram боте

Добавить команду `/help` в Telegram бота, которая возвращает пользователю список всех доступных команд с кратким описанием. Команда открыта для всех — авторизация не нужна.

## 1. Добавить обработчик `handleHelp` в handlers.ts

**Файл (изменить):** `src/modules/telegram-bot/handlers.ts`

Добавить функцию после `handleDefault` (перед `handleText`), а также добавить экспорт.

```typescript
/** Возвращает список всех доступных команд бота. */
export async function handleHelp(ctx: CommandContext): Promise<void> {
  const text = [
    'Доступные команды:',
    '',
    '/status — статус системы (Chrome, OBS, текущая сцена)',
    '/idle — переключить Chrome на idle-страницу',
    '/restart chrome|obs|all — перезапустить Chrome, OBS или оба',
    '/scenes — список сцен OBS',
    '/scene <name> — переключить OBS на сцену',
    '/current — текущая активная сцена OBS',
    '/backup — переключить OBS на сцену "backup"',
    '/default — переключить OBS на сцену "default"',
    '/help — показать это сообщение',
    '',
    'Также можно отправить URL (http/https) — страница откроется в Chrome.',
  ].join('\n');
  await ctx.reply(text).catch(() => {});
}
```

**Важно:** `handleHelp` принимает только `ctx: CommandContext` — зависимости `deps` не нужны.

## 2. Зарегистрировать команду `/help` в run.ts

**Файл (изменить):** `src/modules/telegram-bot/run.ts`

Добавить импорт `handleHelp` и зарегистрировать команду. Регистрировать до `bot.on('text', ...)`.

```typescript
// Импорт (добавить handleHelp):
import {
  handleStatus,
  handleIdle,
  handleRestart,
  handleText,
  handleScenes,
  handleScene,
  handleCurrent,
  handleBackup,
  handleDefault,
  handleHelp,
} from './handlers';

// Регистрация команды (добавить после handleDefault):
bot.command('help', (ctx) => handleHelp(ctx as unknown as import('./handlers').CommandContext));
```

## 3. Добавить тесты для `handleHelp`

**Файл (изменить):** `test/telegram-bot.test.ts`

Добавить импорт `handleHelp` и два теста в блок `describe('telegram-bot', ...)`.

```typescript
// Импорт (добавить handleHelp):
import {
  handleStatus,
  handleIdle,
  handleRestart,
  handleText,
  handleScenes,
  handleScene,
  handleCurrent,
  handleBackup,
  handleDefault,
  handleHelp,
} from '../src/modules/telegram-bot/handlers';

// Тесты:
it('/help: ответ содержит список команд', async () => {
  const ctx = makeMockCtx('/help', allowedUser);
  await handleHelp(ctx);
  assert.ok(ctx.replyText.includes('/status'));
  assert.ok(ctx.replyText.includes('/restart'));
  assert.ok(ctx.replyText.includes('/scenes'));
  assert.ok(ctx.replyText.includes('/help'));
});

it('/help: ответ содержит подсказку про URL', async () => {
  const ctx = makeMockCtx('/help', allowedUser);
  await handleHelp(ctx);
  assert.ok(ctx.replyText.toLowerCase().includes('url') || ctx.replyText.includes('http'));
});
```

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/telegram-bot/handlers.ts` |
| Изменить | `src/modules/telegram-bot/run.ts` |
| Изменить | `test/telegram-bot.test.ts` |

## Ссылки
- [analyze.md](./analyze.md)
