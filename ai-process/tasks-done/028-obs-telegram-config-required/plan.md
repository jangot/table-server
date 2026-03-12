# План реализации: Сделать параметры OBS WebSocket и Telegram обязательными в конфиге

Переводим пять env-переменных (`OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `ALLOWED_TELEGRAM_USERS`) из опциональных в обязательные. После изменения при отсутствии любой из них приложение не запустится, выведя явное сообщение об ошибке через существующий механизм `validateSync → getConfig() → process.exit(1)`. Попутно удаляем ставшую бессмысленной функцию `isObsScenesEnabled`.

---

## 1. Обновить декораторы и типы в `ObsConfig` и `TelegramConfig`

**Файл (изменить):** `src/modules/config/types.ts`

Добавить импорт `IsNotEmpty` и `ArrayMinSize`. Для `ObsConfig` — убрать `@IsOptional()` с `host`, `port`, `password`, добавить `@IsNotEmpty()` к `host`, изменить типы с `?:` на `!:`. Для `TelegramConfig` — убрать `@IsOptional()` с `botToken` и `allowedUsers`, добавить `@IsNotEmpty()` к `botToken`, добавить `@ArrayMinSize(1)` к `allowedUsers`, изменить типы с `?:` на `!:`. Удалить функцию `isObsScenesEnabled`.

```typescript
// Было:
import { IsString, IsNumber, IsOptional, IsIn, Min, Max, IsArray, ValidateNested, IsBoolean } from 'class-validator';

// Стало:
import { IsString, IsNumber, IsOptional, IsIn, Min, Max, IsArray, ValidateNested, IsBoolean, IsNotEmpty, ArrayMinSize } from 'class-validator';

// ObsConfig — было:
@IsOptional()
@IsString()
host?: string;

@IsOptional()
@IsNumber()
@Min(1)
@Max(65535)
port?: number;

@IsOptional()
@IsString()
password?: string;

// ObsConfig — стало:
@IsString()
@IsNotEmpty()
host!: string;

@IsNumber()
@Min(1)
@Max(65535)
port!: number;

@IsString()
password!: string;  // пустая строка разрешена (OBS без пароля)

// TelegramConfig — было:
@IsOptional()
@IsString()
botToken?: string;

@IsOptional()
@IsArray()
@IsString({ each: true })
allowedUsers?: string[];

// TelegramConfig — стало:
@IsString()
@IsNotEmpty()
botToken!: string;

@IsArray()
@IsString({ each: true })
@ArrayMinSize(1)
allowedUsers!: string[];

// Удалить функцию isObsScenesEnabled (строки 102–110)
```

---

## 2. Исправить парсинг env в `validate.ts`

**Файл (изменить):** `src/modules/config/validate.ts`

Убрать преобразование в `undefined` для `OBS_HOST` и `TELEGRAM_BOT_TOKEN` (чтобы пустая строка попадала в валидатор и падала через `@IsNotEmpty()`). Исправить парсинг `ALLOWED_TELEGRAM_USERS` — при пустой строке возвращать `[]` (падёт через `@ArrayMinSize(1)`), при отсутствии переменной — `undefined` (падёт через `@IsArray()`). Парсинг `OBS_PORT` и `OBS_PASSWORD` оставить как есть.

```typescript
// obs.host — было:
host: getEnv('OBS_HOST')?.trim() || undefined,

// obs.host — стало:
host: getEnv('OBS_HOST')?.trim(),

// telegram.botToken — было:
botToken: getEnv('TELEGRAM_BOT_TOKEN')?.trim() || undefined,

// telegram.botToken — стало:
botToken: getEnv('TELEGRAM_BOT_TOKEN')?.trim(),

// ALLOWED_TELEGRAM_USERS — было:
const allowedRaw = getEnv('ALLOWED_TELEGRAM_USERS');
const allowedTelegramUsers =
  allowedRaw === undefined || allowedRaw.trim() === ''
    ? undefined
    : allowedRaw.split(',').map((s) => s.trim()).filter(Boolean);

// ALLOWED_TELEGRAM_USERS — стало:
const allowedRaw = getEnv('ALLOWED_TELEGRAM_USERS');
const allowedTelegramUsers =
  allowedRaw != null
    ? allowedRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;
// undefined → fails @IsArray(); [] → fails @ArrayMinSize(1); ['a'] → ok
```

---

## 3. Удалить экспорт `isObsScenesEnabled` из `config/index.ts`

**Файл (изменить):** `src/modules/config/index.ts`

```typescript
// Было:
export { AppConfig, ObsConfig, isObsScenesEnabled } from './types';

// Стало:
export { AppConfig, ObsConfig } from './types';
```

---

## 4. Упростить `createObsScenesService` в `obs-scenes/index.ts`

**Файл (изменить):** `src/modules/obs-scenes/index.ts`

Удалить импорт `isObsScenesEnabled`, удалить его реэкспорт, убрать guard-проверку в теле функции (теперь `host`/`port`/`password` всегда заданы), изменить возвращаемый тип на `ObsScenesService` (без `null`).

```typescript
// Удалить строку:
import { isObsScenesEnabled } from '../config';

// Удалить строку:
export { isObsScenesEnabled } from '../config';

// Функция — было:
export function createObsScenesService(
  config: ObsConfig,
  logger: Logger,
  scenesConfigPath?: string
): ObsScenesService | null {
  if (!isObsScenesEnabled(config) || config.host == null || config.port == null || config.password === undefined) {
    return null;
  }
  // ...
}

// Функция — стало:
export function createObsScenesService(
  config: ObsConfig,
  logger: Logger,
  scenesConfigPath?: string
): ObsScenesService {
  const { projectorMonitorIndex } = config;
  // ... (остальное тело без изменений)
}
```

---

## 5. Убрать guard в `src/index.ts`

**Файл (изменить):** `src/index.ts`

Guard `if (config.telegram.botToken)` стал избыточным — `botToken` всегда задан. Раскрыть тело `if` на верхний уровень.

```typescript
// Было:
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
    obsScenes: obsScenesService ?? undefined,
  }).catch((err) => {
    logger.error('Telegram bot failed to start', err);
  });
}

// Стало:
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
  obsScenes: obsScenesService ?? undefined,
}).catch((err) => {
  logger.error('Telegram bot failed to start', err);
});
```

---

## 6. Обновить `.env.example`

**Файл (изменить):** `.env.example`

Добавить `TELEGRAM_BOT_TOKEN` и `ALLOWED_TELEGRAM_USERS` в секцию `# Required`. OBS-переменные уже там есть.

```dotenv
# Required
CHROME_PATH=/usr/bin/google-chrome
OBS_PATH=/usr/bin/obs
OBS_HOST=localhost
OBS_PORT=4455
OBS_PASSWORD=              # Tools → WebSocket Server Settings в OBS
TELEGRAM_BOT_TOKEN=        # токен от @BotFather
ALLOWED_TELEGRAM_USERS=    # comma-separated: user_id или username
IDLE_PORT=3000
IDLE_VIEWS_PATH=./views
LOG_LEVEL=info
```

---

## 7. Обновить тесты конфига

**Файл (изменить):** `test/config.test.ts`

**7.1** Добавить в `REQUIRED` пять новых переменных:

```typescript
const REQUIRED = {
  CHROME_PATH: '/usr/bin/chrome',
  OBS_PATH: '/usr/bin/obs',
  OBS_HOST: 'localhost',
  OBS_PORT: '4455',
  OBS_PASSWORD: '',
  IDLE_PORT: '3000',
  IDLE_VIEWS_PATH: './views',
  LOG_LEVEL: 'info',
  TELEGRAM_BOT_TOKEN: 'test-token',
  ALLOWED_TELEGRAM_USERS: 'test-user',
};
```

**7.2** Также добавить новые ключи в `unsetEnv` в блоке `after` (они уже могут быть — проверить):
```typescript
unsetEnv([
  ...Object.keys(REQUIRED),
  // остальные optional ключи
]);
```

**7.3** Тест `obs.host, obs.port, obs.password are undefined when env not set` — заменить на `throws`:

```typescript
// Было: проверяет cfg.obs.host === undefined
// Стало:
it('validateEnv throws when OBS WebSocket env not set', () => {
  resetConfigForTesting();
  setEnv(REQUIRED);
  delete process.env.OBS_HOST;
  delete process.env.OBS_PORT;
  delete process.env.OBS_PASSWORD;
  assert.throws(() => validateEnv(), /obs\.(host|port|password)/);
  setEnv(REQUIRED);
});
```

**7.4** Тест `telegramBotToken is absent when TELEGRAM_BOT_TOKEN not set` — заменить на `throws`:

```typescript
// Было: проверяет cfg.telegram.botToken === undefined
// Стало:
it('validateEnv throws when TELEGRAM_BOT_TOKEN not set', () => {
  resetConfigForTesting();
  setEnv(REQUIRED);
  delete process.env.TELEGRAM_BOT_TOKEN;
  assert.throws(() => validateEnv(), /telegram\.botToken/);
  setEnv(REQUIRED);
});
```

**7.5** Добавить тест на `@ArrayMinSize(1)`:

```typescript
it('validateEnv throws when ALLOWED_TELEGRAM_USERS is empty string', () => {
  resetConfigForTesting();
  setEnv(REQUIRED);
  process.env.ALLOWED_TELEGRAM_USERS = '';
  assert.throws(() => validateEnv(), /allowedUsers/);
  setEnv(REQUIRED);
});
```

**7.6** Тест `ALLOWED_TELEGRAM_USERS with spaces and commas parses to array without empty elements` — убрать явный `process.env.TELEGRAM_BOT_TOKEN = 'x'` (теперь уже в REQUIRED):

```typescript
it('ALLOWED_TELEGRAM_USERS with spaces and commas parses to array without empty elements', () => {
  resetConfigForTesting();
  setEnv(REQUIRED);
  process.env.ALLOWED_TELEGRAM_USERS = ' a , , b ,  ';
  const cfg = validateEnv();
  assert.deepStrictEqual(cfg.telegram.allowedUsers, ['a', 'b']);
  unsetEnv(['ALLOWED_TELEGRAM_USERS']);
});
```

**7.7** Тесты OBS boundary (`OBS_PORT boundary: 1 and 65535 are valid`, `validateEnv throws when OBS_PORT is 0/65536`) уже явно ставят OBS_HOST и OBS_PASSWORD — изменений не требуют.

---

## 8. Обновить тесты obs-scenes

**Файл (изменить):** `test/obs-scenes.test.ts`

**8.1** Удалить импорт `isObsScenesEnabled` из `../src/modules/obs-scenes`.

**8.2** Удалить весь блок `describe('isObsScenesEnabled', ...)` (строки 66–91, 5 тест-кейсов).

**8.3** Удалить тест `returns null when WebSocket config is not set` из `describe('createObsScenesService', ...)` — функция больше не возвращает null. ObsConfig без host/port/password теперь не компилируется, тест невалиден.

**8.4** Тип `createdService` исправить на `ObsScenesService | null` → `ObsScenesService | null` оставить (для `after`-блока cleanup) или изменить на `ObsScenesService | undefined`. Инициализацию можно поменять на `undefined`.

---

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `src/modules/config/index.ts` |
| Изменить | `src/modules/obs-scenes/index.ts` |
| Изменить | `src/index.ts` |
| Изменить | `.env.example` |
| Изменить | `test/config.test.ts` |
| Изменить | `test/obs-scenes.test.ts` |

## Ссылки
- [analyze.md](./analyze.md)
