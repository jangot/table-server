# План реализации: Telegram inline-кнопки вместо команд

Добавить inline-кнопки в Telegraf-бота: `/scenes` возвращает `inline_keyboard` с кнопками переключения сцен, новая команда `/menu` — кнопки для всех безпараметрических команд и вариантов `/restart`. При нажатии кнопки бот обрабатывает `callback_query`, выполняет действие и отправляет новое сообщение. Текстовые команды сохраняются.

---

## 1. Расширить `CommandContext` и добавить `CallbackContext`

**Файл (изменить):** `src/modules/telegram-bot/handlers.ts`

`CommandContext.reply` расширяется до поддержки необязательного `extra`-аргумента (для передачи `reply_markup`). Добавляется новый интерфейс `CallbackContext` для обработки нажатий на кнопки.

```typescript
export interface CommandContext {
  from?: { id: number; username?: string } | null;
  message: { text: string };
  reply: (text: string, extra?: unknown) => Promise<unknown>;
}

export interface CallbackContext {
  from?: { id: number; username?: string } | null;
  callbackQuery: { data?: string };
  answerCbQuery: (text?: string) => Promise<unknown>;
  reply: (text: string, extra?: unknown) => Promise<unknown>;
}
```

> `extra` типизирован как `unknown` — хендлеры не зависят от Telegraf-специфики; конкретный объект `{ reply_markup: {...} }` передаётся через интерфейс прозрачно.

---

## 2. Выделить внутреннюю функцию `switchSceneByName`

**Файл (изменить):** `src/modules/telegram-bot/handlers.ts`

Логика переключения сцены в `handleScene` (строки 186–206) завязана на `ctx.message.text`. Нужно выделить переиспользуемое ядро — чтобы его можно было вызвать как из `handleScene`, так и из `handleCallbackScene`.

```typescript
/** Внутренняя: переключает OBS на сцену src.<inputName>, проверяя наличие в списке.
 *  reply — функция отправки ответа (принимает текст). */
async function switchSceneByName(
  inputName: string,
  from: { id: number; username?: string },
  deps: TelegramBotDeps,
  reply: (text: string) => Promise<unknown>
): Promise<void> {
  if (!deps.obsScenes) {
    await reply('OBS scenes недоступны.').catch(() => {});
    return;
  }
  const fullName = `src.${inputName}`;
  const scenes = await deps.obsScenes.getScenesForDisplay();
  const isAllowed = scenes.some((s) => s.name === fullName);
  if (!isAllowed) {
    await reply(`Сцена недоступна для переключения: ${inputName}`).catch(() => {});
    return;
  }
  try {
    await deps.obsScenes.setScene(fullName);
    deps.logger.info('Telegram bot: remote command processed', { type: 'scene', scene: fullName, userId: from.id });
    await reply(`Сцена переключена: ${inputName}`).catch(() => {});
  } catch (err) {
    if (err instanceof SceneNotFoundError) {
      const displayName = err.sceneName.startsWith('src.') ? err.sceneName.slice(4) : err.sceneName;
      await reply(`Сцена не найдена: ${displayName}`).catch(() => {});
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      await reply(`Ошибка: ${msg}`).catch(() => {});
    }
  }
}
```

Обновлённый `handleScene` (строка ~170) теперь делегирует в `switchSceneByName`:

```typescript
export async function handleScene(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    deps.logger.warn('Telegram bot: unauthorized request', { userId: from?.id, username: from?.username });
    await ctx.reply('Доступ запрещён.').catch(() => {});
    return;
  }
  const inputName = ctx.message.text.replace(/^\s*\/scene\s*/i, '').trim();
  if (!inputName) {
    await ctx.reply('Использование: /scene <name>').catch(() => {});
    return;
  }
  await switchSceneByName(inputName, from, deps, ctx.reply.bind(ctx));
}
```

---

## 3. Изменить `handleScenes` — возвращать `inline_keyboard`

**Файл (изменить):** `src/modules/telegram-bot/handlers.ts`

Вместо текстового списка строится объект `reply_markup` с `inline_keyboard`. Каждая кнопка: текст — `s.title ?? s.name.slice(4)`, `callback_data` — `scene:<fullName>`. Кнопки группируются по одной в строку.

```typescript
export async function handleScenes(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    deps.logger.warn('Telegram bot: unauthorized request', { userId: from?.id, username: from?.username });
    await ctx.reply('Доступ запрещён.').catch(() => {});
    return;
  }
  if (!deps.obsScenes) {
    await ctx.reply('OBS scenes недоступны.').catch(() => {});
    return;
  }
  try {
    const allScenes = await deps.obsScenes.getScenesForDisplay();
    const scenes = allScenes.filter((s) => s.name.startsWith('src.'));
    if (scenes.length === 0) {
      await ctx.reply('Сцены не найдены.').catch(() => {});
      return;
    }
    const inline_keyboard = scenes.map((s) => [
      { text: s.title ?? s.name.slice(4), callback_data: `scene:${s.name}` },
    ]);
    await ctx.reply('Выберите сцену:', { reply_markup: { inline_keyboard } }).catch(() => {});
    deps.logger.info('Telegram bot: remote command processed', { type: 'scenes', userId: from.id });
  } catch (err) {
    deps.logger.error('Telegram bot: get scenes failed', String(err));
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
  }
}
```

---

## 4. Добавить `handleCallbackScene`

**Файл (изменить):** `src/modules/telegram-bot/handlers.ts`

Обрабатывает `callback_data: 'scene:<fullName>'`. Обязательно вызывает `answerCbQuery()`.

```typescript
/** Обрабатывает нажатие кнопки сцены (callback_data: 'scene:src.<name>'). */
export async function handleCallbackScene(ctx: CallbackContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    deps.logger.warn('Telegram bot: unauthorized callback', { userId: from?.id, username: from?.username });
    await ctx.answerCbQuery('Доступ запрещён.').catch(() => {});
    return;
  }
  const data = ctx.callbackQuery.data ?? '';
  // data format: 'scene:src.<name>'
  const fullName = data.replace(/^scene:/, '');
  const inputName = fullName.startsWith('src.') ? fullName.slice(4) : fullName;

  await ctx.answerCbQuery().catch(() => {});
  await switchSceneByName(inputName, from, deps, ctx.reply.bind(ctx));
}
```

---

## 5. Добавить `handleCallbackRestart`

**Файл (изменить):** `src/modules/telegram-bot/handlers.ts`

Обрабатывает `callback_data: 'restart:chrome'`, `'restart:obs'`, `'restart:all'`. Логику перезапуска делегирует существующему `handleRestart` через фиктивный `CommandContext` — или дублирует минимально (целесообразнее дублировать ради ясности, чтобы не тянуть `message.text`).

```typescript
/** Обрабатывает нажатие кнопки рестарта (callback_data: 'restart:chrome|obs|all'). */
export async function handleCallbackRestart(ctx: CallbackContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    await ctx.answerCbQuery('Доступ запрещён.').catch(() => {});
    return;
  }
  const { restartChrome, restartObs } = deps;
  if (!restartChrome || !restartObs) {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply('Рестарт недоступен.').catch(() => {});
    return;
  }
  const data = ctx.callbackQuery.data ?? '';
  const arg = data.replace(/^restart:/, '').toLowerCase();
  if (!['chrome', 'obs', 'all'].includes(arg)) {
    await ctx.answerCbQuery().catch(() => {});
    return;
  }
  await ctx.answerCbQuery().catch(() => {});
  try {
    if (arg === 'chrome' || arg === 'all') await restartChrome(deps.config, deps.logger);
    if (arg === 'obs' || arg === 'all') await restartObs(deps.config, deps.logger);
    deps.logger.info('Telegram bot: remote command processed', { type: 'restart', target: arg, userId: from.id });
    const label = arg === 'chrome' ? 'Chrome перезапущен.' : arg === 'obs' ? 'OBS перезапущен.' : 'Chrome и OBS перезапущены.';
    await ctx.reply(label).catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
  }
}
```

---

## 6. Добавить `handleMenu`

**Файл (изменить):** `src/modules/telegram-bot/handlers.ts`

Отправляет сообщение с двумя группами кнопок: безпараметрические команды и варианты рестарта.

```typescript
/** Отправляет меню с кнопками для всех основных команд. */
export async function handleMenu(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    await ctx.reply('Доступ запрещён.').catch(() => {});
    return;
  }
  const inline_keyboard = [
    [
      { text: 'Статус', callback_data: 'menu:status' },
      { text: 'Текущая сцена', callback_data: 'menu:current' },
    ],
    [
      { text: 'Сцены', callback_data: 'menu:scenes' },
      { text: 'Idle', callback_data: 'menu:idle' },
    ],
    [
      { text: 'Backup', callback_data: 'menu:backup' },
      { text: 'Default', callback_data: 'menu:default' },
    ],
    [
      { text: 'Restart Chrome', callback_data: 'restart:chrome' },
      { text: 'Restart OBS', callback_data: 'restart:obs' },
      { text: 'Restart All', callback_data: 'restart:all' },
    ],
  ];
  await ctx.reply('Меню:', { reply_markup: { inline_keyboard } }).catch(() => {});
}
```

> Кнопки `menu:status`, `menu:current`, `menu:idle`, `menu:backup`, `menu:default`, `menu:scenes` — обрабатываются одним `handleCallbackMenu`.

---

## 7. Добавить `handleCallbackMenu`

**Файл (изменить):** `src/modules/telegram-bot/handlers.ts`

Диспетчер для `callback_data: 'menu:<command>'` — вызывает нужный хендлер команды через прокси-контекст.

```typescript
/** Диспетчер кнопок меню (callback_data: 'menu:<command>'). */
export async function handleCallbackMenu(ctx: CallbackContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    await ctx.answerCbQuery('Доступ запрещён.').catch(() => {});
    return;
  }
  await ctx.answerCbQuery().catch(() => {});
  const data = ctx.callbackQuery.data ?? '';
  const command = data.replace(/^menu:/, '');

  // Прокси-контекст для вызова обычных хендлеров из callback-контекста
  const proxyCtx: CommandContext = {
    from,
    message: { text: `/${command}` },
    reply: ctx.reply.bind(ctx),
  };

  switch (command) {
    case 'status':  return handleStatus(proxyCtx, deps);
    case 'current': return handleCurrent(proxyCtx, deps);
    case 'scenes':  return handleScenes(proxyCtx, deps);
    case 'idle':    return handleIdle(proxyCtx, deps);
    case 'backup':  return handleBackup(proxyCtx, deps);
    case 'default': return handleDefault(proxyCtx, deps);
  }
}
```

---

## 8. Обновить `run.ts` — зарегистрировать команду `/menu` и actions

**Файл (изменить):** `src/modules/telegram-bot/run.ts`

```typescript
import { Telegraf } from 'telegraf';
import type { TelegramBotDeps } from './types';
import {
  handleStatus, handleIdle, handleRestart, handleText,
  handleScenes, handleScene, handleCurrent, handleBackup,
  handleDefault, handleHelp, handleMenu,
  handleCallbackScene, handleCallbackRestart, handleCallbackMenu,
} from './handlers';
import type { CommandContext, CallbackContext } from './handlers';

export function createBot(deps: TelegramBotDeps): Telegraf {
  const { config } = deps;
  const bot = new Telegraf(config.telegram.botToken!);

  // Текстовые команды (без изменений + новая /menu)
  bot.command('status',  (ctx) => handleStatus(ctx as unknown as CommandContext, deps));
  bot.command('idle',    (ctx) => handleIdle(ctx as unknown as CommandContext, deps));
  bot.command('restart', (ctx) => handleRestart(ctx as unknown as CommandContext, deps));
  bot.command('scenes',  (ctx) => handleScenes(ctx as unknown as CommandContext, deps));
  bot.command('scene',   (ctx) => handleScene(ctx as unknown as CommandContext, deps));
  bot.command('current', (ctx) => handleCurrent(ctx as unknown as CommandContext, deps));
  bot.command('backup',  (ctx) => handleBackup(ctx as unknown as CommandContext, deps));
  bot.command('default', (ctx) => handleDefault(ctx as unknown as CommandContext, deps));
  bot.command('help',    (ctx) => handleHelp(ctx as unknown as CommandContext));
  bot.command('menu',    (ctx) => handleMenu(ctx as unknown as CommandContext, deps));  // новая

  // Callback-обработчики
  bot.action(/^scene:/,   (ctx) => handleCallbackScene(ctx as unknown as CallbackContext, deps));
  bot.action(/^restart:/, (ctx) => handleCallbackRestart(ctx as unknown as CallbackContext, deps));
  bot.action(/^menu:/,    (ctx) => handleCallbackMenu(ctx as unknown as CallbackContext, deps));

  bot.on('text', (ctx) => handleText(ctx as unknown as CommandContext, deps));

  return bot;
}
```

---

## 9. Тесты

**Файл (изменить):** `test/telegram-bot.test.ts`

### 9.1 Обновить `makeMockCtx` — поддержка `extra` и callback-контекст

```typescript
function makeMockCtx(
  text: string,
  from: { id: number; username?: string }
): CommandContext & { replyText: string; replyExtra: unknown } {
  const state: { replyText: string; replyExtra: unknown } = { replyText: '', replyExtra: undefined };
  const ctx = {
    from,
    message: { text },
    reply: async (t: string, extra?: unknown) => {
      state.replyText = t;
      state.replyExtra = extra;
    },
  };
  Object.defineProperty(ctx, 'replyText',  { get: () => state.replyText,  configurable: true, enumerable: true });
  Object.defineProperty(ctx, 'replyExtra', { get: () => state.replyExtra, configurable: true, enumerable: true });
  return ctx as CommandContext & { replyText: string; replyExtra: unknown };
}

function makeCallbackCtx(
  data: string,
  from: { id: number; username?: string }
): CallbackContext & { replyText: string; answeredWith: string | undefined } {
  const state: { replyText: string; answeredWith: string | undefined } = { replyText: '', answeredWith: undefined };
  const ctx = {
    from,
    callbackQuery: { data },
    answerCbQuery: async (text?: string) => { state.answeredWith = text ?? ''; },
    reply: async (t: string) => { state.replyText = t; },
  };
  Object.defineProperty(ctx, 'replyText',    { get: () => state.replyText,    configurable: true, enumerable: true });
  Object.defineProperty(ctx, 'answeredWith', { get: () => state.answeredWith, configurable: true, enumerable: true });
  return ctx as CallbackContext & { replyText: string; answeredWith: string | undefined };
}
```

### 9.2 Обновить тест `/scenes` — проверять `reply_markup`

```typescript
it('/scenes: allowed user receives inline_keyboard with scene buttons', async () => {
  const ctx = makeMockCtx('/scenes', allowedUser);
  const deps = makeDeps({ obsScenes: makeObsScenes() });
  await handleScenes(ctx, deps);
  const extra = ctx.replyExtra as { reply_markup?: { inline_keyboard?: unknown[][] } };
  assert.ok(extra?.reply_markup?.inline_keyboard, 'должен быть inline_keyboard');
  const flat = extra.reply_markup!.inline_keyboard!.flat() as { text: string; callback_data: string }[];
  assert.ok(flat.some((btn) => btn.text === 'Scene One'));
  assert.ok(flat.some((btn) => btn.callback_data === 'scene:src.scene1'));
  assert.ok(flat.some((btn) => btn.callback_data === 'scene:src.scene2'));
});
```

> Существующие тесты `/scenes: obsScenes not set` и `/scenes: disallowed user` остаются без изменений — они проверяют `ctx.replyText`.

### 9.3 Новые тесты для `handleCallbackScene`

```typescript
it('handleCallbackScene: allowed user switches scene and answerCbQuery called', async () => {
  let calledWith: string | null = null;
  const ctx = makeCallbackCtx('scene:src.scene1', allowedUser);
  const deps = makeDeps({ obsScenes: makeObsScenes({ setScene: async (n) => { calledWith = n; } }) });
  await handleCallbackScene(ctx, deps);
  assert.strictEqual(calledWith, 'src.scene1');
  assert.ok(ctx.replyText.includes('переключена'));
  assert.strictEqual(ctx.answeredWith, '');
});

it('handleCallbackScene: disallowed user — answerCbQuery с сообщением, setScene не вызван', async () => {
  let setSceneCalled = false;
  const ctx = makeCallbackCtx('scene:src.scene1', disallowedUser);
  const deps = makeDeps({
    allowedUsers: { isAllowed: () => false },
    obsScenes: makeObsScenes({ setScene: async () => { setSceneCalled = true; } }),
  });
  await handleCallbackScene(ctx, deps);
  assert.strictEqual(setSceneCalled, false);
  assert.ok(ctx.answeredWith?.includes('запрещён'));
});
```

### 9.4 Новые тесты для `handleCallbackRestart`

```typescript
it('handleCallbackRestart: restart:chrome вызывает restartChrome', async () => {
  let chromeCalled = false;
  const ctx = makeCallbackCtx('restart:chrome', allowedUser);
  const deps = makeDeps({
    restartChrome: async () => { chromeCalled = true; },
    restartObs: async () => {},
  });
  await handleCallbackRestart(ctx, deps);
  assert.strictEqual(chromeCalled, true);
  assert.ok(ctx.replyText.includes('Chrome перезапущен'));
});
```

### 9.5 Новые тесты для `handleMenu`

```typescript
it('handleMenu: allowed user receives inline_keyboard с кнопками команд', async () => {
  const ctx = makeMockCtx('/menu', allowedUser);
  const deps = makeDeps();
  await handleMenu(ctx, deps);
  const extra = ctx.replyExtra as { reply_markup?: { inline_keyboard?: unknown[][] } };
  assert.ok(extra?.reply_markup?.inline_keyboard);
  const flat = extra.reply_markup!.inline_keyboard!.flat() as { callback_data: string }[];
  assert.ok(flat.some((btn) => btn.callback_data === 'restart:chrome'));
  assert.ok(flat.some((btn) => btn.callback_data === 'menu:status'));
});
```

---

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/telegram-bot/handlers.ts` |
| Изменить | `src/modules/telegram-bot/run.ts` |
| Изменить | `test/telegram-bot.test.ts` |

> `src/modules/telegram-bot/types.ts` — без изменений (`TelegramBotDeps` достаточен как есть).

---

## Ссылки

- [analyze.md](./analyze.md)
