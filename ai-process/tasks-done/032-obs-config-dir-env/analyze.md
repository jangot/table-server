# Анализ: OBS config-dir через переменную окружения

## Общее описание функциональности

Требуется добавить поддержку CLI-аргумента `--config-dir <path>` при запуске OBS.
Путь к папке конфигурации задаётся через переменную окружения `OBS_CONFIG_DIR`, которая является **обязательной** — приложение не запустится без неё.

Цель: позволить выносить конфигурацию OBS в произвольное место файловой системы, не зависящее от домашней директории пользователя. Это полезно при контейнеризации или запуске от системного пользователя.

## Связанные модули и сущности

| Модуль/файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/config/types.ts` | TypeScript-классы конфига с декораторами валидации (class-validator) | Добавить поле `configDir` в `ObsConfig` |
| `src/modules/config/validate.ts` | Читает переменные окружения, строит и валидирует `AppConfig` | Добавить чтение `OBS_CONFIG_DIR` в блок `obs` |
| `src/modules/obs/args.ts` | Строит массив CLI-аргументов для запуска OBS | Добавить генерацию `--config-dir <path>` |
| `.env.example` | Шаблон переменных окружения для деплоя | Добавить `OBS_CONFIG_DIR=` как обязательную переменную |
| `test/obs.test.ts` | Юнит-тесты для `buildObsArgs` и прочих OBS-утилит | Добавить тест-кейс для `configDir` |
| `test/config.test.ts` | Тесты валидации конфига через env-переменные | Добавить `OBS_CONFIG_DIR` в `REQUIRED`, дополнить `after()` и добавить тест |

## Текущие интерфейсы и API

### `ObsConfig` (`src/modules/config/types.ts`, строки 69–105)
```ts
export class ObsConfig {
  @IsString()
  path!: string;

  @IsOptional()
  @IsString()
  profilePath?: string;   // аналог — опциональная, для --profile=<path>

  @IsString()
  @IsNotEmpty()
  host!: string;
  // ... port, password, projector-поля
}
```
Новое поле `configDir` должно быть без `@IsOptional()` — обязательное строковое поле.

### `validateEnv` (`src/modules/config/validate.ts`, строки 80–90)
```ts
obs: plainToInstance(ObsConfig, {
  path: getEnv('OBS_PATH')?.trim(),
  readyTimeout: parseOptionalInt(getEnv('OBS_READY_TIMEOUT')),
  profilePath: getEnv('OBS_PROFILE_PATH')?.trim() || undefined,
  // ... host, port, password, projector-поля
}),
```
Паттерн для строковых опциональных полей: `getEnv('VAR')?.trim() || undefined`.
Для обязательного поля используется: `getEnv('OBS_CONFIG_DIR')?.trim()` (без `|| undefined`).

### `buildObsArgs` (`src/modules/obs/args.ts`, строки 7–13)
```ts
export function buildObsArgs(config: AppConfig): string[] {
  const args: string[] = [];
  if (config.obs.profilePath) {
    args.push(`--profile=${config.obs.profilePath}`);  // формат: --key=value
  }
  return args;
}
```
Аналог для нового аргумента — **другой синтаксис**: OBS принимает `--config-dir <path>` как два отдельных элемента массива, а не `--config-dir=<path>`.

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить/создать |
|---|---|---|
| `src/modules/config/types.ts` | Класс `ObsConfig` (строки 69–105) | Добавить поле `configDir!: string` с декоратором `@IsString()` и `@IsNotEmpty()` (без `@IsOptional()`) |
| `src/modules/config/validate.ts` | Блок `obs` в `validateEnv` (строки 80–90) | Добавить строку `configDir: getEnv('OBS_CONFIG_DIR')?.trim()` |
| `src/modules/obs/args.ts` | Функция `buildObsArgs` (строки 7–13) | Добавить генерацию `args.push('--config-dir', config.obs.configDir)` |
| `.env.example` | Секция OBS (строки 12–19 и 39–67) | Добавить `OBS_CONFIG_DIR=` в обе секции: обязательную и первую (без комментария «optional») |
| `test/obs.test.ts` | `baseConfig` и тесты `buildObsArgs` (строки 15–51) | Добавить `configDir` в сигнатуру `baseConfig`, добавить тест-кейс для `--config-dir` |
| `test/config.test.ts` | Объект `REQUIRED` (строки 10–21) и `after()` (строки 40–59) | Добавить `OBS_CONFIG_DIR` в `REQUIRED` и в список очищаемых ключей; добавить тест прохождения значения |

## Зависимости и ограничения

- **Обязательность поля**: `configDir` без `@IsOptional()` означает, что валидация упадёт, если `OBS_CONFIG_DIR` не задана. Тесты конфига обязаны добавить её в `REQUIRED`, иначе существующий `before()` будет устанавливать неполный набор переменных и тесты упадут.
- **Формат аргумента**: `--config-dir <path>` (два элемента), а не `--config-dir=<path>` — в отличие от `--profile=<path>`. Нужно убедиться, что `spawn` вызывается с `shell: false` (уже так), поэтому пробел в значении пути безопасен при передаче двумя отдельными строками.
- **Порядок аргументов**: OBS обрабатывает `--config-dir` до загрузки профиля, поэтому `--config-dir` должен идти **перед** `--profile` в массиве аргументов.
- **`.env.example` имеет две секции**: первая (строки 1–20) — «рабочий» пример, вторая (строки 39–68) — структурированный шаблон с `# Required` / `# Optional`. `OBS_CONFIG_DIR` должна быть добавлена в обе секции как обязательная.
- **Нет внешних зависимостей**: изменения чисто конфигурационные, не требуют новых пакетов.
