# План реализации: Расширенные команды и состояние (007)

Добавить команды бота `/status`, `/idle`, `/restart chrome|obs|all`, HTTP health-check на idle-сервере и восстановление последнего URL при полном рестарте процесса. Все команды — только для разрешённых пользователей.

## 1. Health-check в idle-server

**Файл (изменить):** `src/modules/idle-server/index.ts`

- Добавить возможность регистрировать «геттер» статуса извне (idle-server стартует до Chrome/OBS, поэтому статус передаётся позже).
- Экспортировать функцию `setHealthChecker(fn: () => { chrome: boolean; obs: boolean })`.
- Добавить маршрут `GET /health`: если геттер не установлен — ответ `200` с телом `{ "ready": false, "chrome": false, "obs": false }`; иначе вызвать геттер и вернуть `{ "ready": chrome && obs, "chrome", "obs" }`, `Content-Type: application/json`.

```typescript
// Модуль: переменная для геттера
let healthChecker: (() => { chrome: boolean; obs: boolean }) | null = null;

export function setHealthChecker(fn: () => { chrome: boolean; obs: boolean }): void {
  healthChecker = fn;
}

// В startIdleServer, после app.get('/', ...):
app.get('/health', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (!healthChecker) {
    return res.status(200).json({ ready: false, chrome: false, obs: false });
  }
  const { chrome, obs } = healthChecker();
  res.status(200).json({ ready: chrome && obs, chrome, obs });
});
```

**Файл (изменить):** `src/index.ts`

- После запуска watchdog (или сразу после оркестратора, если watchdog отключён) вызвать `setHealthChecker(() => ({ chrome: isChromeAlive(config), obs: isObsAlive() }))`, чтобы GET `/health` отражал актуальное состояние.

```typescript
import { setHealthChecker } from './modules/idle-server';
// ...
// после startWatchdog(...) или после runOrchestrator, если watchdog не используется:
setHealthChecker(() => ({
  chrome: isChromeAlive(config),
  obs: isObsAlive(),
}));
```

## 2. Восстановление последнего URL при старте процесса

**Файл (изменить):** `src/index.ts`

- После `runOrchestrator` (Chrome уже запущен и открыт на idle) прочитать `readLastUrl(config.lastUrlStatePath ?? './.last-url')`; если URL есть — вызвать `navigateToUrl(lastUrl, { config, logger })`, чтобы при полном рестарте сервиса экран вернулся на последнюю страницу.

```typescript
import { readLastUrl } from './modules/chrome';
// после runOrchestrator:
const lastUrlPath = config.lastUrlStatePath ?? './.last-url';
const lastUrl = await readLastUrl(lastUrlPath);
if (lastUrl) {
  await navigateToUrl(lastUrl, { config, logger });
}
```

## 3. Расширение зависимостей бота (restart, команды)

**Файл (изменить):** `src/modules/telegram-bot/types.ts`

- В `TelegramBotDeps` добавить опциональные поля: `restartChrome?: (config: AppConfig, logger: Logger) => Promise<void>`, `restartObs?: (config: AppConfig, logger: Logger) => Promise<void>`. Они понадобятся для команд `/restart chrome|obs|all`.

```typescript
export interface TelegramBotDeps {
  config: AppConfig;
  logger: Logger;
  allowedUsers: AllowedUsersChecker;
  navigateToUrl: (url: string, deps: { config: AppConfig; logger: Logger }) => Promise<void>;
  isChromeAlive: (config: AppConfig) => boolean;
  isObsAlive: (config: AppConfig) => boolean;
  restartChrome?: (config: AppConfig, logger: Logger) => Promise<void>;
  restartObs?: (config: AppConfig, logger: Logger) => Promise<void>;
}
```

**Файл (изменить):** `src/index.ts`

- В объект зависимостей `startBot` добавить `restartChrome` и `restartObs` (передавать функции из `./modules/chrome` и `./modules/obs`).

```typescript
startBot({
  config,
  logger,
  allowedUsers,
  navigateToUrl,
  isChromeAlive,
  isObsAlive: (c) => (void c, isObsAlive()),
  restartChrome,
  restartObs,
}).catch(...)
```

## 4. Команды бота: /status, /idle, /restart

**Файл (изменить):** `src/modules/telegram-bot/run.ts`

- **Порядок регистрации:** зарегистрировать обработчики команд (`bot.command('status', ...)`, `bot.command('idle', ...)`, `bot.command('restart', ...)`) до `bot.on('text', ...)`, чтобы сообщения вида `/status` не попадали в обработчик URL.
- В обработчике `bot.on('text', ...)` в начале: если `ctx.message.text.trim().startsWith('/')`, выйти без ответа (или ответить «Неизвестная команда»), чтобы не трактовать `/something` как URL.

**Команда /status:**

- Проверить `allowedUsers.isAllowed({ id, username })`; при отказе — «Доступ запрещён.» и return.
- Получить `chrome = isChromeAlive(config)`, `obs = isObsAlive(config)`, вычислить `ready = chrome && obs`.
- Ответить текстом, например: «Готовность: ready/degraded. Chrome: alive/dead. OBS: alive/dead.» (на русском или английском — по стилю проекта).

**Команда /idle:**

- Проверить авторизацию.
- Если `!isChromeAlive(config) || !isObsAlive(config)` — «Система не готова.» и return.
- Вызвать `navigateToUrl(idleUrl, { config, logger })`, где `idleUrl = \`http://localhost:${config.idlePort}/\``.
- При успехе — «Переключено на idle.»; при ошибке — «Ошибка: …».

**Команда /restart:**

- Проверить авторизацию.
- Из `ctx.message.text` извлечь аргумент после `/restart` (например `chrome`, `obs`, `all`). Если аргумент пустой или не из списка — ответить «Использование: /restart chrome | obs | all» и return.
- Если `restartChrome`/`restartObs` не переданы в deps — ответить «Рестарт недоступен.» и return.
- Для `chrome`: вызвать `restartChrome(config, logger)`, ответить «Chrome перезапущен.» (при ошибке — «Ошибка: …»).
- Для `obs`: вызвать `restartObs(config, logger)`, ответить «OBS перезапущен.».
- Для `all`: вызвать сначала `restartChrome`, затем `restartObs`, ответить «Chrome и OBS перезапущены.» (при ошибке — сообщить какая часть упала).

```typescript
// В createBot, до bot.on('text', ...):
const idleUrl = `http://localhost:${config.idlePort}/`;

bot.command('status', async (ctx) => {
  const from = ctx.from;
  if (!from || !allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    await ctx.reply('Доступ запрещён.').catch(() => {});
    return;
  }
  const chrome = isChromeAlive(config);
  const obs = isObsAlive(config);
  const ready = chrome && obs;
  await ctx.reply(
    `Готовность: ${ready ? 'ready' : 'degraded'}. Chrome: ${chrome ? 'alive' : 'dead'}. OBS: ${obs ? 'alive' : 'dead'}.`
  ).catch(() => {});
});

bot.command('idle', async (ctx) => {
  // ... проверка авторизации, готовности, navigateToUrl(idleUrl, ...)
});

bot.command('restart', async (ctx) => {
  // ... проверка авторизации, парсинг аргумента (chrome|obs|all), вызов restartChrome/restartObs
});

bot.on('text', async (ctx) => {
  if (ctx.message.text.trim().startsWith('/')) {
    await ctx.reply('Неизвестная команда.').catch(() => {});
    return;
  }
  // ... существующая логика extractUrl и навигации
});
```

## 5. Тесты

**Файл (изменить):** `test/idle-server.test.ts`

- Добавить тест: GET `/health` без установленного health-checker возвращает 200 и JSON `{ ready: false, chrome: false, obs: false }`.
- Добавить тест: после вызова `setHealthChecker(() => ({ chrome: true, obs: true }))` GET `/health` возвращает `{ ready: true, chrome: true, obs: true }`; после `setHealthChecker(() => ({ chrome: true, obs: false }))` — `{ ready: false, chrome: true, obs: false }`.

**Файл (создать):** `test/telegram-bot.test.ts`

- Подключить Telegraf и моки для `TelegramBotDeps` (config, logger, allowedUsers, navigateToUrl, isChromeAlive, isObsAlive, при необходимости restartChrome, restartObs).
- Сценарии:
  - **/status:** разрешённый пользователь — бот отвечает строкой, содержащей состояние (ready/degraded, chrome, obs); неразрешённый — «Доступ запрещён.».
  - **/idle:** разрешённый пользователь, Chrome и OBS alive — вызывается `navigateToUrl` с URL `http://localhost:${idlePort}/`, ответ «Переключено на idle.» (или аналог); не готовность системы — ответ про «не готова»; неразрешённый — «Доступ запрещён.».
  - **/restart:** разрешённый пользователь, переданы restartChrome/restartObs — при `/restart chrome` вызывается restartChrome, ответ про перезапуск Chrome; при неверном аргументе — сообщение об использовании.
  - **Текст, начинающийся с /:** сообщение `/unknown` не вызывает navigateToUrl и получает ответ «Неизвестная команда.» или аналог.

Использовать `createBot(deps)` и эмулировать входящие обновления (Telegraf позволяет обрабатывать update объекты) или вызывать обработчики напрямую, если они вынесены в отдельные функции и подписаны на контекст.

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/idle-server/index.ts` |
| Изменить | `src/index.ts` |
| Изменить | `src/modules/telegram-bot/types.ts` |
| Изменить | `src/modules/telegram-bot/run.ts` |
| Изменить | `test/idle-server.test.ts` |
| Создать  | `test/telegram-bot.test.ts` |

## Ссылки

- [analyze.md](./analyze.md) текущей задачи
