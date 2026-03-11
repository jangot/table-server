# План реализации: Telegram-команды для управления сценами OBS

Добавить в Telegram-бота команды `/scenes`, `/scene`, `/current`, `/backup`, `/default` для управления сценами OBS через существующий `ObsScenesService`. Расширить команду `/status` информацией об OBS-соединении и текущей сцене.

## 1. Расширить `TelegramBotDeps` — добавить `obsScenes`

**Файл (изменить):** `src/modules/telegram-bot/types.ts`

Добавить импорт `ObsScenesService` и опциональное поле в интерфейс.

```typescript
import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';
import type { AllowedUsersChecker } from '../users';
import type { ObsScenesService } from '../obs-scenes/types';

export interface TelegramBotDeps {
  config: AppConfig;
  logger: Logger;
  allowedUsers: AllowedUsersChecker;
  navigateToUrl: (url: string, deps: { config: AppConfig; logger: Logger }) => Promise<void>;
  isChromeAlive: (config: AppConfig) => boolean;
  isObsAlive: (config: AppConfig) => boolean;
  restartChrome?: (config: AppConfig, logger: Logger) => Promise<void>;
  restartObs?: (config: AppConfig, logger: Logger) => Promise<void>;
  obsScenes?: ObsScenesService; // ← добавить
}
```

## 2. Добавить обработчики команд сцен

**Файл (изменить):** `src/modules/telegram-bot/handlers.ts`

### 2.1. Добавить импорт `SceneNotFoundError`

```typescript
import type { TelegramBotDeps } from './types';
import { SceneNotFoundError } from '../obs-scenes/types';
```

### 2.2. Вспомогательная функция авторизации

Чтобы не дублировать блок авторизации в каждом обработчике, можно использовать инлайн-паттерн как в существующем коде (без создания отдельной функции — стиль текущего кода).

### 2.3. `handleScenes` — список сцен

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
    const scenes = await deps.obsScenes.getScenesForDisplay();
    if (scenes.length === 0) {
      await ctx.reply('Сцены не найдены.').catch(() => {});
      return;
    }
    const lines = scenes.map((s) => `• ${s.title ?? s.name}`);
    await ctx.reply(lines.join('\n')).catch(() => {});
    deps.logger.info('Telegram bot: remote command processed', { type: 'scenes', userId: from.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
  }
}
```

### 2.4. `handleScene` — переключить сцену по имени

```typescript
export async function handleScene(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
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
  const sceneName = ctx.message.text.replace(/^\s*\/scene\s*/i, '').trim();
  if (!sceneName) {
    await ctx.reply('Использование: /scene <name>').catch(() => {});
    return;
  }
  try {
    await deps.obsScenes.setScene(sceneName);
    deps.logger.info('Telegram bot: remote command processed', { type: 'scene', scene: sceneName, userId: from.id });
    await ctx.reply(`Сцена переключена: ${sceneName}`).catch(() => {});
  } catch (err) {
    if (err instanceof SceneNotFoundError) {
      await ctx.reply(`Сцена не найдена: ${err.sceneName}`).catch(() => {});
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
    }
  }
}
```

### 2.5. `handleCurrent` — текущая сцена

```typescript
export async function handleCurrent(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
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
    const current = await deps.obsScenes.getCurrentScene();
    await ctx.reply(current ? `Текущая сцена: ${current}` : 'Сцена не определена.').catch(() => {});
    deps.logger.info('Telegram bot: remote command processed', { type: 'current', userId: from.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
  }
}
```

### 2.6. `handleBackup` и `handleDefault` — быстрые переключения

```typescript
async function switchToNamedScene(
  name: string,
  type: string,
  ctx: CommandContext,
  deps: TelegramBotDeps
): Promise<void> {
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
    await deps.obsScenes.setScene(name);
    deps.logger.info('Telegram bot: remote command processed', { type, scene: name, userId: from.id });
    await ctx.reply(`Сцена переключена: ${name}`).catch(() => {});
  } catch (err) {
    if (err instanceof SceneNotFoundError) {
      await ctx.reply(`Сцена не найдена: ${err.sceneName}`).catch(() => {});
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
    }
  }
}

export async function handleBackup(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  await switchToNamedScene('backup', 'backup', ctx, deps);
}

export async function handleDefault(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  await switchToNamedScene('default', 'default', ctx, deps);
}
```

### 2.7. Расширить `handleStatus` — добавить OBS WebSocket и текущую сцену

```typescript
export async function handleStatus(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    await ctx.reply('Доступ запрещён.').catch(() => {});
    return;
  }
  const chrome = deps.isChromeAlive(deps.config);
  const obs = deps.isObsAlive(deps.config);
  const ready = chrome && obs;

  let currentScene: string | null = null;
  let obsConnected = false;
  if (deps.obsScenes) {
    try {
      currentScene = await deps.obsScenes.getCurrentScene();
      obsConnected = true;
    } catch {
      obsConnected = false;
    }
  }

  const obsLine = deps.obsScenes
    ? `OBS WS: ${obsConnected ? 'connected' : 'disconnected'}.`
    : '';
  const sceneLine = currentScene ? `Current scene: ${currentScene}.` : '';

  const parts = [
    `Готовность: ${ready ? 'ready' : 'degraded'}. Chrome: ${chrome ? 'alive' : 'dead'}. OBS: ${obs ? 'alive' : 'dead'}.`,
    obsLine,
    sceneLine,
  ].filter(Boolean);

  await ctx.reply(parts.join(' ')).catch(() => {});
  deps.logger.info('Telegram bot: remote command processed', { type: 'status', userId: from.id });
}
```

## 3. Зарегистрировать новые команды в `run.ts`

**Файл (изменить):** `src/modules/telegram-bot/run.ts`

```typescript
import { Telegraf } from 'telegraf';
import type { TelegramBotDeps } from './types';
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
} from './handlers';

export function createBot(deps: TelegramBotDeps): Telegraf {
  const { config } = deps;
  const bot = new Telegraf(config.telegram.botToken!);

  bot.command('status', (ctx) => handleStatus(ctx as unknown as import('./handlers').CommandContext, deps));
  bot.command('idle', (ctx) => handleIdle(ctx as unknown as import('./handlers').CommandContext, deps));
  bot.command('restart', (ctx) => handleRestart(ctx as unknown as import('./handlers').CommandContext, deps));
  bot.command('scenes', (ctx) => handleScenes(ctx as unknown as import('./handlers').CommandContext, deps));
  bot.command('scene', (ctx) => handleScene(ctx as unknown as import('./handlers').CommandContext, deps));
  bot.command('current', (ctx) => handleCurrent(ctx as unknown as import('./handlers').CommandContext, deps));
  bot.command('backup', (ctx) => handleBackup(ctx as unknown as import('./handlers').CommandContext, deps));
  bot.command('default', (ctx) => handleDefault(ctx as unknown as import('./handlers').CommandContext, deps));

  bot.on('text', (ctx) => handleText(ctx as unknown as import('./handlers').CommandContext, deps));

  return bot;
}

export async function startBot(deps: TelegramBotDeps): Promise<void> {
  const bot = createBot(deps);
  await bot.launch();
  deps.logger.info('Telegram bot started');
}
```

## 4. Передать `obsScenesService` в `startBot` — `src/index.ts`

**Файл (изменить):** `src/index.ts`

Заменить закомментированную заглушку на реальную передачу:

```typescript
  if (config.telegram.botToken) {
    const allowedUsers = createAllowedUsersChecker(config);
    startBot({
      config,
      logger,
      allowedUsers,
      navigateToUrl,
      isChromeAlive,
      isObsAlive: (c) => (void c, isObsAlive()),
      restartChrome,
      restartObs,
      obsScenes: obsScenesService, // ← добавить
    }).catch((err) => {
      logger.error('Telegram bot failed to start', err);
    });
  }
```

Удалить строку `void obsScenesService;` (или заглушку-комментарий).

## 5. Тесты

**Файл (изменить):** `test/telegram-bot.test.ts`

Добавить новые `it`-блоки в существующий `describe('telegram-bot', ...)`. Использовать тот же стиль: `makeMockCtx`, `makeLogger`, `TelegramBotDeps`.

### Мок для `ObsScenesService`

```typescript
import type { ObsScenesService, SceneForDisplay } from '../src/modules/obs-scenes/types';
import { SceneNotFoundError } from '../src/modules/obs-scenes/types';

function makeObsScenes(overrides?: Partial<ObsScenesService>): ObsScenesService {
  return {
    getScenes: async () => ['scene1', 'scene2'],
    getScenesForDisplay: async () => [
      { name: 'scene1', title: 'Scene One' },
      { name: 'scene2' },
    ],
    getCurrentScene: async () => 'scene1',
    setScene: async () => {},
    ...overrides,
  };
}
```

### Сценарии тестов

**`/scenes`:**
- Happy path: авторизованный пользователь получает список с `title` и `name`
- `obsScenes` не задан: ответ «OBS scenes недоступны.»
- Неавторизованный: «Доступ запрещён.»

**`/scene <name>`:**
- Happy path: `setScene` вызван с правильным именем, ответ «Сцена переключена: ...»
- Пустое имя: ответ «Использование: /scene <name>»
- `SceneNotFoundError`: ответ «Сцена не найдена: ...»
- `obsScenes` не задан: «OBS scenes недоступны.»
- Неавторизованный: «Доступ запрещён.»

**`/current`:**
- Happy path: возвращает «Текущая сцена: scene1»
- `getCurrentScene` возвращает `null`: «Сцена не определена.»
- Неавторизованный: «Доступ запрещён.»

**`/backup`, `/default`:**
- Happy path: `setScene` вызван с именем `'backup'` / `'default'`
- `SceneNotFoundError`: «Сцена не найдена: backup»

**`/status` расширение:**
- С `obsScenes`: ответ содержит «OBS WS: connected» и «Current scene:»
- Без `obsScenes`: ответ не содержит «OBS WS:»
- `getCurrentScene` выбрасывает ошибку: «OBS WS: disconnected», без «Current scene:»

```typescript
it('/scenes: allowed user receives scene list', async () => {
  const ctx = makeMockCtx('/scenes', allowedUser);
  const deps: TelegramBotDeps = {
    config: testConfig,
    logger: makeLogger(),
    allowedUsers: { isAllowed: () => true },
    navigateToUrl: async () => {},
    isChromeAlive: () => true,
    isObsAlive: () => true,
    obsScenes: makeObsScenes(),
  };
  await handleScenes(ctx, deps);
  assert.ok(ctx.replyText.includes('Scene One'));
  assert.ok(ctx.replyText.includes('scene2'));
});

it('/scene backup: setScene called with "backup"', async () => {
  let calledWith: string | null = null;
  const ctx = makeMockCtx('/scene backup', allowedUser);
  const deps: TelegramBotDeps = {
    config: testConfig,
    logger: makeLogger(),
    allowedUsers: { isAllowed: () => true },
    navigateToUrl: async () => {},
    isChromeAlive: () => true,
    isObsAlive: () => true,
    obsScenes: makeObsScenes({ setScene: async (n) => { calledWith = n; } }),
  };
  await handleScene(ctx, deps);
  assert.strictEqual(calledWith, 'backup');
  assert.ok(ctx.replyText.includes('backup'));
});

it('/scene: SceneNotFoundError returns proper message', async () => {
  const ctx = makeMockCtx('/scene nonexistent', allowedUser);
  const deps: TelegramBotDeps = {
    config: testConfig,
    logger: makeLogger(),
    allowedUsers: { isAllowed: () => true },
    navigateToUrl: async () => {},
    isChromeAlive: () => true,
    isObsAlive: () => true,
    obsScenes: makeObsScenes({
      setScene: async () => { throw new SceneNotFoundError('nonexistent'); },
    }),
  };
  await handleScene(ctx, deps);
  assert.ok(ctx.replyText.includes('не найдена'));
  assert.ok(ctx.replyText.includes('nonexistent'));
});
```

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/telegram-bot/types.ts` |
| Изменить | `src/modules/telegram-bot/handlers.ts` |
| Изменить | `src/modules/telegram-bot/run.ts` |
| Изменить | `src/index.ts` |
| Изменить | `test/telegram-bot.test.ts` |

## Ссылки

- [analyze.md](./analyze.md)
