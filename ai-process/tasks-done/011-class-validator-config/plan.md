# План реализации: Интеграция class-validator для валидации конфигурации

Заменить ручную валидацию `process.env` на декларативную через `class-validator`. Плоский интерфейс `AppConfig` разбить на секции-классы. Публичный API (`getConfig()`, `resetConfigForTesting()`, `validateEnv()`) сохранить.

---

## 1. Зависимости и настройки TypeScript

**Файл (изменить):** `package.json`

Добавить в `dependencies`:
```json
"class-validator": "^0.14.1",
"class-transformer": "^0.5.1",
"reflect-metadata": "^0.2.2"
```

**Файл (изменить):** `tsconfig.json`

Добавить в `compilerOptions`:
```json
"experimentalDecorators": true,
"emitDecoratorMetadata": true
```

**Файл (изменить):** `src/index.ts`

Добавить первой строкой (до `dotenv/config`):
```typescript
import 'reflect-metadata';
import 'dotenv/config';
// ...
```

---

## 2. Новые классы-секции и основной класс конфига

**Файл (изменить):** `src/modules/config/types.ts`

Полностью заменить интерфейс `AppConfig` на классы-секции и основной класс. `ChromeWindowMode` сохранить.

```typescript
import { IsString, IsNumber, IsOptional, IsIn, Min, Max, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export type ChromeWindowMode = 'kiosk' | 'app' | 'fullscreen' | 'default';
const CHROME_WINDOW_MODES: ChromeWindowMode[] = ['kiosk', 'app', 'fullscreen', 'default'];

export class ChromeConfig {
  @IsString()
  path!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  devToolsPort?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  readyTimeout?: number;

  @IsOptional()
  @IsIn(CHROME_WINDOW_MODES)
  windowMode?: ChromeWindowMode;

  @IsOptional()
  @IsString()
  userDataDir?: string;
}

export class ObsConfig {
  @IsString()
  path!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  readyTimeout?: number;

  @IsOptional()
  @IsString()
  profilePath?: string;
}

export class TelegramConfig {
  @IsOptional()
  @IsString()
  botToken?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedUsers?: string[];
}

export class IdleConfig {
  @IsNumber()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  viewsPath!: string;
}

export class WatchdogConfig {
  @IsOptional()
  @IsNumber()
  @Min(1)
  checkIntervalMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  restartMinIntervalMs?: number;
}

export class AppConfig {
  @IsIn(['info', 'warn', 'error', 'debug'])
  logLevel!: 'info' | 'warn' | 'error' | 'debug';

  @IsOptional()
  @IsString()
  lastUrlStatePath?: string;

  @ValidateNested()
  @Type(() => ChromeConfig)
  chrome!: ChromeConfig;

  @ValidateNested()
  @Type(() => ObsConfig)
  obs!: ObsConfig;

  @ValidateNested()
  @Type(() => TelegramConfig)
  telegram!: TelegramConfig;

  @ValidateNested()
  @Type(() => IdleConfig)
  idle!: IdleConfig;

  @ValidateNested()
  @Type(() => WatchdogConfig)
  watchdog!: WatchdogConfig;
}
```

---

## 3. Переписать validate.ts

**Файл (изменить):** `src/modules/config/validate.ts`

Убрать все ручные функции. Вместо них: маппинг env → объект класса `AppConfig`, вызов `validateSync()` из `class-validator`, форматирование ошибок (включая вложенные).

```typescript
import 'reflect-metadata';
import { validateSync, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AppConfig,
  ChromeConfig,
  ObsConfig,
  TelegramConfig,
  IdleConfig,
  WatchdogConfig,
} from './types';

function getEnv(name: string): string | undefined {
  return process.env[name];
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = parseInt(value.trim(), 10);
  return Number.isNaN(n) ? undefined : n;
}

/** Рекурсивно собирает текстовые сообщения из массива ValidationError */
function collectMessages(errors: ValidationError[], prefix = ''): string[] {
  const messages: string[] = [];
  for (const err of errors) {
    const path = prefix ? `${prefix}.${err.property}` : err.property;
    if (err.constraints) {
      messages.push(...Object.values(err.constraints).map((m) => `${path}: ${m}`));
    }
    if (err.children?.length) {
      messages.push(...collectMessages(err.children, path));
    }
  }
  return messages;
}

/**
 * Read and validate environment variables, return typed config.
 * On validation error: throws Error listing all validation issues.
 */
export function validateEnv(): AppConfig {
  const allowedRaw = getEnv('ALLOWED_TELEGRAM_USERS');
  const allowedTelegramUsers =
    allowedRaw === undefined || allowedRaw.trim() === ''
      ? undefined
      : allowedRaw.split(',').map((s) => s.trim()).filter(Boolean);

  const plain = {
    logLevel: getEnv('LOG_LEVEL')?.toLowerCase().trim(),
    lastUrlStatePath: getEnv('LAST_URL_STATE_PATH')?.trim() || undefined,
    chrome: plainToInstance(ChromeConfig, {
      path: getEnv('CHROME_PATH')?.trim(),
      devToolsPort: parseOptionalInt(getEnv('DEVTOOLS_PORT')),
      readyTimeout: parseOptionalInt(getEnv('CHROME_READY_TIMEOUT')),
      windowMode: getEnv('CHROME_WINDOW_MODE')?.toLowerCase().trim() || 'default',
      userDataDir: getEnv('CHROME_USER_DATA_DIR')?.trim() || undefined,
    }),
    obs: plainToInstance(ObsConfig, {
      path: getEnv('OBS_PATH')?.trim(),
      readyTimeout: parseOptionalInt(getEnv('OBS_READY_TIMEOUT')),
      profilePath: getEnv('OBS_PROFILE_PATH')?.trim() || undefined,
    }),
    telegram: plainToInstance(TelegramConfig, {
      botToken: getEnv('TELEGRAM_BOT_TOKEN')?.trim() || undefined,
      allowedUsers: allowedTelegramUsers,
    }),
    idle: plainToInstance(IdleConfig, {
      port: parseOptionalInt(getEnv('IDLE_PORT')),
      viewsPath: getEnv('IDLE_VIEWS_PATH')?.trim(),
    }),
    watchdog: plainToInstance(WatchdogConfig, {
      checkIntervalMs: parseOptionalInt(getEnv('WATCHDOG_CHECK_INTERVAL_MS')),
      restartMinIntervalMs: parseOptionalInt(getEnv('WATCHDOG_RESTART_MIN_INTERVAL_MS')),
    }),
  };

  const instance = plainToInstance(AppConfig, plain);
  const errors = validateSync(instance, { whitelist: false });

  if (errors.length > 0) {
    const messages = collectMessages(errors);
    throw new Error(`Config validation failed:\n${messages.join('\n')}`);
  }

  return instance;
}
```

---

## 4. Обновить index.ts конфига

**Файл (изменить):** `src/modules/config/index.ts`

Тип кеша теперь `AppConfig` (класс). Обработка ошибок остаётся прежней — `validateEnv()` уже бросает `Error` со всеми сообщениями.

```typescript
import 'reflect-metadata';
import { validateEnv } from './validate';
import { AppConfig } from './types';

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached === null) {
    try {
      cached = validateEnv();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(msg);
      process.exit(1);
    }
  }
  return cached;
}

export function resetConfigForTesting(): void {
  cached = null;
}

export { AppConfig } from './types';
export { validateEnv } from './validate';
```

> Изменение: `export type { AppConfig }` → `export { AppConfig }` (класс, а не только тип).

---

## 5. Обновить потребителей конфига (пути к полям)

Все файлы используют плоские поля `config.xxx` — заменить на секционные `config.chrome.xxx`, `config.obs.xxx` и т.д.

### 5a. `src/modules/chrome/args.ts`

**Файл (изменить):** `src/modules/chrome/args.ts`

```typescript
// было:
const userDataDir = config.chromeUserDataDir;
const mode = config.chromeWindowMode ?? 'default';

// стало:
const userDataDir = config.chrome.userDataDir;
const mode = config.chrome.windowMode ?? 'default';
```

### 5b. `src/modules/chrome/index.ts`

**Файл (изменить):** `src/modules/chrome/index.ts`

Заменить обращения:
- `config.chromePath` → `config.chrome.path`
- `config.devToolsPort` → `config.chrome.devToolsPort`
- `config.chromeReadyTimeout` → `config.chrome.readyTimeout`

### 5c. `src/modules/obs/args.ts`

**Файл (изменить):** `src/modules/obs/args.ts`

- `config.obsProfilePath` → `config.obs.profilePath`

### 5d. `src/modules/obs/index.ts`

**Файл (изменить):** `src/modules/obs/index.ts`

- `config.obsPath` → `config.obs.path`
- `config.obsReadyTimeout` → `config.obs.readyTimeout`

### 5e. `src/modules/idle-server/index.ts`

**Файл (изменить):** `src/modules/idle-server/index.ts`

- `config.idlePort` → `config.idle.port`
- `config.idleViewsPath` → `config.idle.viewsPath`

### 5f. `src/modules/logger/index.ts`

**Файл (изменить):** `src/modules/logger/index.ts`

- `config.logLevel` → остаётся `config.logLevel` (поле верхнего уровня)

### 5g. `src/modules/watchdog/index.ts`

**Файл (изменить):** `src/modules/watchdog/index.ts`

- `config.watchdogCheckIntervalMs` → `config.watchdog.checkIntervalMs`
- `config.watchdogRestartMinIntervalMs` → `config.watchdog.restartMinIntervalMs`

### 5h. `src/modules/users/fromConfig.ts`

**Файл (изменить):** `src/modules/users/fromConfig.ts`

- `config.allowedTelegramUsers` → `config.telegram.allowedUsers`

### 5i. `src/modules/telegram-bot/types.ts`

**Файл (изменить):** `src/modules/telegram-bot/types.ts`

Проверить, нет ли прямых обращений к плоским полям (через `AppConfig`). Обновить если есть.

### 5j. `src/modules/startup-checks/index.ts`

**Файл (изменить):** `src/modules/startup-checks/index.ts`

- `config.chromePath` → `config.chrome.path`
- `config.obsPath` → `config.obs.path`

### 5k. `src/index.ts`

**Файл (изменить):** `src/index.ts`

- `config.logLevel` → `config.logLevel` (без изменений)
- `config.watchdogCheckIntervalMs` → `config.watchdog.checkIntervalMs`
- `config.lastUrlStatePath` → `config.lastUrlStatePath`
- `config.telegramBotToken` → `config.telegram.botToken`

---

## 6. Обновить тесты

**Файл (изменить):** `test/config.test.ts`

Обновить:
1. **Новые пути к полям** в happy path: `config.chrome.path`, `config.obs.path`, `config.idle.port`, `config.idle.viewsPath`, `config.logLevel`, `config.chrome.devToolsPort`
2. **Сообщения об ошибках** — теперь формат `Config validation failed:\n<поле>: <сообщение>`:
   - Пропущенный `CHROME_PATH`: проверять `/chrome\.path/` вместо `/Missing required environment variable: CHROME_PATH/`
   - Невалидный `IDLE_PORT`: проверять `/idle\.port/` вместо `/Invalid port in IDLE_PORT/`
   - Невалидный `LOG_LEVEL`: проверять `/logLevel/` вместо `/Invalid LOG_LEVEL.*expected one of/`
3. **Telegram поля**: `cfg.telegramBotToken` → `cfg.telegram.botToken`, `cfg.allowedTelegramUsers` → `cfg.telegram.allowedUsers`
4. **OBS profile path**: `config.obsProfilePath` → `config.obs.profilePath`

```typescript
// Пример обновлённых проверок:

// happy path
assert.strictEqual(config.chrome.path, '/usr/bin/chrome');
assert.strictEqual(config.obs.path, '/usr/bin/obs');
assert.strictEqual(config.idle.port, 3000);
assert.strictEqual(config.idle.viewsPath, './views');
assert.strictEqual(config.logLevel, 'info');
assert.strictEqual(config.chrome.devToolsPort, undefined);

// ошибки
assert.throws(() => validateEnv(), /chrome\.path/);
assert.throws(() => validateEnv(), /idle\.port/);
assert.throws(() => validateEnv(), /logLevel/);

// telegram
assert.strictEqual(cfg.telegram.botToken, '123:ABC');
assert.deepStrictEqual(cfg.telegram.allowedUsers, ['123456789', 'johndoe']);
```

---

## 7. Документация

**Файл (изменить):** `docs/env.md`

Проверить, нет ли устаревших имён переменных или неверных описаний. Обновить при необходимости.

**Файл (создать):** `docs/architecture/config.md`

Описание структуры конфигурации: секции, поля, соответствие env-переменных. Пример:
```markdown
# Структура конфигурации

AppConfig делится на секции:
- `chrome` — Chrome браузер (CHROME_PATH, DEVTOOLS_PORT, CHROME_WINDOW_MODE, ...)
- `obs` — OBS Studio (OBS_PATH, OBS_READY_TIMEOUT, OBS_PROFILE_PATH)
- `telegram` — Telegram бот (TELEGRAM_BOT_TOKEN, ALLOWED_TELEGRAM_USERS)
- `idle` — Idle сервер (IDLE_PORT, IDLE_VIEWS_PATH)
- `watchdog` — Watchdog (WATCHDOG_CHECK_INTERVAL_MS, WATCHDOG_RESTART_MIN_INTERVAL_MS)
- Верхний уровень: `logLevel` (LOG_LEVEL), `lastUrlStatePath` (LAST_URL_STATE_PATH)
```

---

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `package.json` |
| Изменить | `tsconfig.json` |
| Изменить | `src/index.ts` |
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `src/modules/config/index.ts` |
| Изменить | `src/modules/chrome/args.ts` |
| Изменить | `src/modules/chrome/index.ts` |
| Изменить | `src/modules/obs/args.ts` |
| Изменить | `src/modules/obs/index.ts` |
| Изменить | `src/modules/idle-server/index.ts` |
| Изменить | `src/modules/logger/index.ts` |
| Изменить | `src/modules/watchdog/index.ts` |
| Изменить | `src/modules/users/fromConfig.ts` |
| Изменить | `src/modules/telegram-bot/types.ts` |
| Изменить | `src/modules/startup-checks/index.ts` |
| Изменить | `test/config.test.ts` |
| Изменить | `docs/env.md` |
| Создать  | `docs/architecture/config.md` |

## Ссылки
- [analyze.md](./analyze.md)
