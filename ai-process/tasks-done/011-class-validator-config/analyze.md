# Анализ: Интеграция class-validator для валидации конфигурации

## Общее описание функциональности

Нужно заменить ручную валидацию переменных окружения (набор функций в `validate.ts`) на декларативную валидацию через библиотеку `class-validator`. Одновременно плоская структура `AppConfig` разбивается на секции (chrome, obs, telegram, idle, watchdog), каждая из которых — отдельный класс с декораторами валидации. Основной класс конфига объединяет секции как поля с вложенной валидацией (`@ValidateNested()`). Поведение публичного API (`getConfig()`, `resetConfigForTesting()`, кеш, `process.exit(1)` при ошибке) сохраняется.

Задача решает проблему: ручная валидация громоздка, сложно добавлять новые поля, ошибки собираются не все сразу.

---

## Связанные модули и сущности

| Модуль / файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/config/types.ts` | Тип `AppConfig` (плоский интерфейс) + `ChromeWindowMode` | Полная замена: интерфейс → классы-секции + основной класс |
| `src/modules/config/validate.ts` | Функции ручной валидации + `validateEnv()` | Полная замена: декоратор-based классы + вызов `validate()` из class-validator |
| `src/modules/config/index.ts` | `getConfig()`, `resetConfigForTesting()`, реэкспорт | Обновление обработки ошибок (массив `ValidationError`), обновление реэкспортов |
| `src/modules/chrome/args.ts` | Читает `config.chromePath`, `config.chromeUserDataDir`, `config.chromeWindowMode` | Обновление путей к полям (секция chrome) |
| `src/modules/obs/args.ts` | Читает `config.obsProfilePath` | Обновление пути к полю (секция obs) |
| `src/modules/watchdog/index.ts` | Читает `config.watchdogCheckIntervalMs`, `config.watchdogRestartMinIntervalMs` | Обновление путей к полям (секция watchdog) |
| `src/modules/telegram-bot/types.ts` | Тип `TelegramBotDeps` использует `AppConfig` | Обновление типов при изменении интерфейса |
| `src/modules/idle-server/index.ts` | Читает `config.idlePort`, `config.idleViewsPath` | Обновление путей (секция idle) |
| `src/modules/logger/index.ts` | Читает `config.logLevel` | Обновление пути (поле верхнего уровня или секция) |
| `src/modules/startup-checks/index.ts` | Использует `AppConfig` | Обновление путей к полям |
| `src/modules/chrome/index.ts` | Использует `AppConfig` | Обновление путей к полям |
| `src/modules/obs/index.ts` | Использует `AppConfig` | Обновление путей к полям |
| `src/modules/users/fromConfig.ts` | Читает `config.allowedTelegramUsers` | Обновление пути (секция telegram) |
| `test/config.test.ts` | Тесты для `getConfig()` и `validateEnv()` | Обновление: новые пути к полям, новые паттерны сообщений об ошибках |
| `docs/env.md` | Документация переменных окружения | Возможное обновление при изменении семантики |
| `docs/architecture/` | Не существует | Создать новый файл с описанием структуры конфигурации |
| `package.json` | Зависимости проекта | Добавить `class-validator`, `class-transformer`, `reflect-metadata` |
| `tsconfig.json` | Настройки TypeScript | Добавить `experimentalDecorators: true`, `emitDecoratorMetadata: true` |

---

## Текущие интерфейсы и API

### `AppConfig` (плоская структура)
```
src/modules/config/types.ts
```
- `chromePath: string`
- `obsPath: string`
- `idlePort: number`
- `idleViewsPath: string`
- `logLevel: 'info' | 'warn' | 'error' | 'debug'`
- `devToolsPort?: number`
- `chromeReadyTimeout?: number`
- `chromeWindowMode?: ChromeWindowMode` (kiosk | app | fullscreen | default)
- `obsReadyTimeout?: number`
- `obsProfilePath?: string`
- `lastUrlStatePath?: string`
- `chromeUserDataDir?: string`
- `watchdogCheckIntervalMs?: number`
- `watchdogRestartMinIntervalMs?: number`
- `telegramBotToken?: string`
- `allowedTelegramUsers?: string[]`

### Функции валидации (`validate.ts`)
- `requireEnv(name)` — обязательная переменная, бросает Error
- `parsePort(name, value)` — число 1–65535
- `parseLogLevel(name, value)` — одно из info/warn/error/debug
- `parseOptionalPort(name, value)` — опциональный порт
- `parseOptionalPositiveInt(name, value)` — опциональное положительное целое
- `parseChromeWindowMode(name, value)` — одно из kiosk/app/fullscreen/default
- `validateEnv(): AppConfig` — строит и возвращает конфиг (экспортируется)

### Публичное API конфига (`index.ts`)
- `getConfig(): AppConfig` — кешированная валидация; при ошибке — `console.error()` + `process.exit(1)`
- `resetConfigForTesting(): void` — сбрасывает кеш

### Тесты (`test/config.test.ts`)
Покрывают:
- Успешная загрузка (happy path)
- Парсинг опциональных полей (DEVTOOLS_PORT, OBS_PROFILE_PATH)
- Ошибки при отсутствии обязательных переменных
- Ошибки невалидных значений (порт, log level)
- Парсинг Telegram-полей (токен + список пользователей)

Тесты проверяют сообщения об ошибках регулярными выражениями (`/Missing required environment variable: CHROME_PATH/`, `/Invalid port in IDLE_PORT/` и т.д.) — при переходе на class-validator сообщения изменятся, тесты нужно обновить.

---

## Файлы и места в коде

| Файл | Что содержит | Что нужно сделать |
|---|---|---|
| `src/modules/config/types.ts` | Интерфейс `AppConfig`, тип `ChromeWindowMode` | Заменить интерфейс на классы-секции (ChromeConfig, ObsConfig, TelegramConfig, IdleConfig, WatchdogConfig) и основной класс конфига |
| `src/modules/config/validate.ts` | Ручные функции валидации, `validateEnv()` | Переписать: маппинг env → объект класса + вызов `validate()`, форматирование ошибок |
| `src/modules/config/index.ts` | `getConfig()`, кеш, реэкспорт | Обновить обработку ошибок (собирать все ValidationError), обновить реэкспорты |
| `src/modules/chrome/args.ts` | Использует `config.chromePath`, `config.chromeUserDataDir`, `config.chromeWindowMode` | Обновить пути полей под новую структуру |
| `src/modules/chrome/index.ts` | Использует `AppConfig` | Обновить пути полей |
| `src/modules/obs/args.ts` | Использует `config.obsProfilePath` | Обновить путь поля |
| `src/modules/obs/index.ts` | Использует `AppConfig` | Обновить пути полей |
| `src/modules/idle-server/index.ts` | Использует `config.idlePort`, `config.idleViewsPath` | Обновить пути полей |
| `src/modules/logger/index.ts` | Использует `config.logLevel` | Обновить путь поля |
| `src/modules/startup-checks/index.ts` | Использует `AppConfig` | Обновить пути полей |
| `src/modules/watchdog/index.ts` | Использует `config.watchdogCheckIntervalMs`, `config.watchdogRestartMinIntervalMs` | Обновить пути полей |
| `src/modules/users/fromConfig.ts` | Использует `config.allowedTelegramUsers` | Обновить путь поля |
| `src/modules/telegram-bot/types.ts` | Тип `TelegramBotDeps` с `AppConfig` | Обновить тип при необходимости |
| `test/config.test.ts` | Тесты конфига | Обновить: новые пути полей, новые паттерны ошибок, возможно новые тест-кейсы для nested validation |
| `package.json` | Зависимости | Добавить `class-validator`, `class-transformer`, `reflect-metadata` в dependencies |
| `tsconfig.json` | Настройки TS | Добавить `experimentalDecorators`, `emitDecoratorMetadata` |
| `docs/env.md` | Документация переменных | Обновить при изменении семантики переменных |
| `docs/architecture/config.md` (новый) | — | Создать с описанием структуры секций конфига |

---

## Зависимости и ограничения

### Новые зависимости
- **`class-validator`** — декораторы валидации (`@IsString`, `@IsNumber`, `@IsOptional`, `@Min`, `@Max`, `@IsIn`, `@ValidateNested`, `@IsArray` и т.д.)
- **`class-transformer`** — трансформация типов при маппинге из env (`@Transform()`, `plainToInstance()`), нужна для `@ValidateNested()`
- **`reflect-metadata`** — требуется для работы декораторов с метаданными TypeScript

### Ограничения TypeScript
- `tsconfig.json` без `experimentalDecorators` и `emitDecoratorMetadata` — декораторы работать не будут
- Флаг `emitDecoratorMetadata` требует, чтобы во входную точку `src/index.ts` был импортирован `reflect-metadata` первым (или как минимум до любого кода с декораторами)

### Поведенческие ограничения
- `validateEnv()` должна оставаться экспортированной — она используется напрямую в тестах
- Сообщения об ошибках изменятся (class-validator генерирует другой формат) — тесты нужно обновить под новые регулярные выражения
- Все ошибки должны собираться и выводиться за один вызов (не первая попавшаяся)
- Кеш и `resetConfigForTesting()` должны работать так же

### Риски
- **Широкое затрагивание кода**: при переименовании полей (flat → sectioned) нужно обновить 10+ файлов. Есть риск пропустить использование.
- **Форматирование ошибок class-validator**: сообщения `ValidationError` вложенные (для `@ValidateNested`) — нужно рекурсивно собирать тексты ошибок.
- **`@Transform()` и типизация**: при использовании `plainToInstance` вместо ручного маппинга — сложнее читать имена переменных (CHROME_PATH → chrome.path). Ручной маппинг может остаться явным в коде.
- **Тест-инфраструктура**: тесты используют `node:test` (не jest/vitest) — class-validator работает с любым тест-раннером, проблем быть не должно.
