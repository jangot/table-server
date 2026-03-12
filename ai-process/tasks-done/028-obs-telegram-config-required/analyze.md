# Анализ: Сделать параметры OBS WebSocket и Telegram обязательными в конфиге

## Общее описание функциональности

Нужно перевести пять env-переменных из опциональных в обязательные:
- OBS WebSocket: `OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD`
- Telegram: `TELEGRAM_BOT_TOKEN`, `ALLOWED_TELEGRAM_USERS`

Сейчас при их отсутствии приложение стартует без ошибок, но соответствующая функциональность молча не работает. После изменения — при отсутствии любой из переменных старт должен падать с явным сообщением через уже существующий механизм `validateSync` → `getConfig()` → `process.exit(1)`.

Причина: задача 024 выявила, что сцены OBS не работали без ошибок при старте из-за отсутствия `OBS_HOST`/`OBS_PORT`/`OBS_PASSWORD`.

## Связанные модули и сущности

| Модуль/файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/config/types.ts` | Классы конфига с декораторами class-validator | Удалить `@IsOptional()` с нужных полей, добавить `@IsNotEmpty()` где требуется |
| `src/modules/config/validate.ts` | Парсинг env → plain-объект, вызов validateSync | Изменить парсинг OBS/Telegram переменных — не конвертировать в `undefined` |
| `.env.example` | Документация переменных окружения | Добавить Telegram переменные в секцию Required |
| `test/config.test.ts` | Тесты валидации конфига | Обновить `REQUIRED`, изменить тесты проверяющие undefined-поведение |
| `src/modules/obs-scenes/index.ts` | Фабрика сервиса сцен OBS | Удалить импорт, реэкспорт и вызов `isObsScenesEnabled`; упростить `createObsScenesService` |
| `src/index.ts` | Точка входа приложения | Guard `if (config.telegram.botToken)` станет избыточным (botToken всегда задан) |
| `test/obs-scenes.test.ts` | Тесты obs-scenes | Удалить блок тестов `isObsScenesEnabled` |

## Текущие интерфейсы и API

### `ObsConfig` (types.ts:69)
```
host?: string      — @IsOptional() @IsString()
port?: number      — @IsOptional() @IsNumber() @Min(1) @Max(65535)
password?: string  — @IsOptional() @IsString()
```
Все три поля опциональны. Типы — `string | undefined` и `number | undefined`.

### `TelegramConfig` (types.ts:112)
```
botToken?: string      — @IsOptional() @IsString()
allowedUsers?: string[] — @IsOptional() @IsArray() @IsString({ each: true })
```
Оба поля опциональны.

### `isObsScenesEnabled(obs: ObsConfig): boolean` (types.ts:103)
Возвращает `true` если `host != null && host !== '' && port != null && password !== undefined`. Используется в `obs-scenes/index.ts:31` как guard перед созданием WebSocket-клиента.

### Парсинг в `validate.ts`
- `OBS_HOST`: `getEnv('OBS_HOST')?.trim() || undefined` — пустая строка превращается в `undefined`
- `OBS_PORT`: `parseOptionalInt(getEnv('OBS_PORT'))` — возвращает `undefined` если не задан
- `OBS_PASSWORD`: `getEnv('OBS_PASSWORD')` — передаётся as-is, пустая строка остаётся `""`
- `TELEGRAM_BOT_TOKEN`: `getEnv('TELEGRAM_BOT_TOKEN')?.trim() || undefined`
- `ALLOWED_TELEGRAM_USERS`: условный парсинг — если пусто/не задано, возвращает `undefined`

### `getConfig()` / `validateEnv()` (index.ts, validate.ts)
Механизм валидации уже существует: `validateSync` → при ошибках бросает `Error` → `getConfig()` перехватывает и вызывает `process.exit(1)` с выводом в stderr.

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить/создать |
|---|---|---|
| `src/modules/config/types.ts` | Декораторы `ObsConfig` и `TelegramConfig` | Удалить `@IsOptional()` с `host`, `port`, `password`, `botToken`, `allowedUsers`; добавить `@IsNotEmpty()` для `host` и `botToken`; типы полей обновить с `?: T` на `!: T` |
| `src/modules/config/validate.ts` | Парсинг env-переменных | Убрать `|| undefined` для `OBS_HOST` и `TELEGRAM_BOT_TOKEN`; заменить `parseOptionalInt` на обязательный парсинг для `OBS_PORT`; убрать условный парсинг `ALLOWED_TELEGRAM_USERS` |
| `.env.example` | Документация env-переменных | Добавить `TELEGRAM_BOT_TOKEN` и `ALLOWED_TELEGRAM_USERS` в секцию `# Required` |
| `test/config.test.ts` | Тесты конфига | Добавить в `REQUIRED` пять новых переменных; изменить тест `obs.host/port/password are undefined when env not set` → должен кидать ошибку; изменить тест `telegramBotToken is absent when TELEGRAM_BOT_TOKEN not set` → должен кидать ошибку; добавить тест на `@ArrayMinSize(1)` для пустого `ALLOWED_TELEGRAM_USERS` |

## Зависимости и ограничения

### Поведение password при пустой строке
`OBS_PASSWORD` может быть пустой строкой (OBS без пароля). Декоратор `@IsString()` без `@IsNotEmpty()` пропускает `""`. Но в `validate.ts` **нельзя** добавлять `|| undefined` для password — иначе пустая строка будет превращаться в `undefined` и не пройдёт валидацию. Текущее поведение (`getEnv('OBS_PASSWORD')` as-is) уже корректно.

### Побочное влияние на `src/index.ts`
Guard `if (config.telegram.botToken)` на строке 52 станет избыточным — botToken всегда задан после изменений. Можно убрать условие и всегда запускать бота.

### Тесты: большое количество затронутых тест-кейсов
`REQUIRED` в `config.test.ts` используется как базовый минимальный набор env для ~20 тестов. Добавление 5 переменных меняет baseline. Тесты, проверяющие что `host/port/password/botToken/allowedUsers == undefined` без этих env, превратятся в тесты на `throws`. Нужна внимательная ревизия каждого теста.

### Парсинг `ALLOWED_TELEGRAM_USERS`
Сейчас: если `ALLOWED_TELEGRAM_USERS=""` или не задан — `undefined`. После изменения переменная обязательна и должна содержать **хотя бы одного пользователя** — пустой массив недопустим. Нужно добавить `@ArrayMinSize(1)` на поле `allowedUsers`. Пустая строка или отсутствие переменной должны приводить к ошибке валидации.

### Удаление `isObsScenesEnabled`
Функция `isObsScenesEnabled` становится избыточной (все три поля всегда заданы) и должна быть удалена. Затрагивает:
- `src/modules/config/types.ts` — удалить определение функции
- `src/modules/config/index.ts` — удалить экспорт `isObsScenesEnabled`
- `src/modules/obs-scenes/index.ts` — удалить импорт, реэкспорт и вызов `isObsScenesEnabled`; упростить guard в `createObsScenesService` (убрать проверку или убрать весь `if`-блок возврата `null`)
- `test/obs-scenes.test.ts` — удалить тесты блока `isObsScenesEnabled`
