# Анализ: OBS config-dir через XDG_CONFIG_HOME

## Общее описание функциональности

Задача 032 добавила переменную окружения `OBS_CONFIG_DIR` и передавала её значение через CLI-флаг `--config-dir` при запуске OBS. Выяснилось, что используемая версия OBS не поддерживает этот флаг — он тихо игнорируется, и OBS продолжает читать конфиг из `~/.config/obs-studio/`.

Необходимо изменить способ передачи пути к конфигу: вместо CLI-аргумента использовать переменную окружения `XDG_CONFIG_HOME` при `spawn` OBS. OBS на Linux следует XDG Base Directory Specification и будет читать конфиг из `$XDG_CONFIG_HOME/obs-studio/`.

Переменная `OBS_CONFIG_DIR` и вся существующая логика её чтения/валидации остаётся без изменений.

## Связанные модули и сущности

| Модуль/файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/obs/args.ts` | Сборка CLI-аргументов для запуска OBS | Удалить `--config-dir` из аргументов |
| `src/modules/obs/launch.ts` | Запуск OBS через `spawn`, ожидание готовности | Добавить `env` с `XDG_CONFIG_HOME` в опции spawn |
| `src/modules/obs/index.ts` | Модуль OBS: создание, restart-логика | Передать `configDir` в `launchObs` (или через другой механизм) |
| `src/modules/config/types.ts` | Типы конфигурации (`AppConfig`, `ObsConfig`) | Без изменений |
| `src/modules/config/validate.ts` | Чтение и валидация env-переменных | Без изменений |
| `test/obs.test.ts` | Тесты для OBS-модуля | Обновить тесты `buildObsArgs` под новое поведение |

## Текущие интерфейсы и API

### `buildObsArgs(config: AppConfig): string[]` — `src/modules/obs/args.ts`
Текущее поведение: добавляет `['--config-dir', config.obs.configDir]` как первые элементы массива. Если `profilePath` задан — добавляет `--profile=...`.

### `launchObs(obsPath, args, timeoutMs, logger): Promise<void>` — `src/modules/obs/launch.ts`
Вызывает `spawn(obsPath, args, { stdio: [...], shell: false })`. Параметр `env` в опциях не передаётся (используется `process.env` по умолчанию). Функция принимает только `args`, но не конфигурацию целиком.

### `createObsModule(config, logger)` — `src/modules/obs/index.ts`
Вызывает `buildObsArgs(config)` и передаёт результат в `launchObs`. Имеет доступ к полному `config`, включая `config.obs.configDir`.

### `config.obs.configDir` — `src/modules/config/types.ts` / `validate.ts`
Тип `string` (обязательный, с `!`). Читается из `OBS_CONFIG_DIR` через `getEnv`. Валидация и тип без изменений.

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить/создать |
|---|---|---|
| `src/modules/obs/args.ts` | `buildObsArgs` — сборка аргументов | Убрать строку `args.push('--config-dir', config.obs.configDir)` |
| `src/modules/obs/launch.ts` | `launchObs` — spawn OBS | Добавить параметр для `env` (или принять `configDir` отдельно) и передать `{ ...process.env, XDG_CONFIG_HOME: configDir }` в опции spawn |
| `src/modules/obs/index.ts` | `createObsModule` — вызывает launch | Передать `config.obs.configDir` в `launchObs` |
| `test/obs.test.ts` | Тесты `buildObsArgs` и других функций | Обновить тест-кейсы для `buildObsArgs`: убрать проверки на `--config-dir`, добавить/обновить тест для `launchObs` с env |

## Зависимости и ограничения

- **Сигнатура `launchObs`:** функция принимает `(obsPath, args, timeoutMs, logger)` — не имеет доступа к конфигурации. Для передачи `XDG_CONFIG_HOME` нужно либо добавить параметр (например, `env?: NodeJS.ProcessEnv` или `configDir?: string`), либо формировать env снаружи и передавать готовым объектом.
- **Безопасность:** значение `XDG_CONFIG_HOME` берётся из конфигурации (env-переменная `OBS_CONFIG_DIR`), не из пользовательского ввода — риска инъекции нет. Комментарий безопасности в `launch.ts` можно расширить.
- **Тесты:** три тест-кейса `buildObsArgs` в `test/obs.test.ts` явно проверяют наличие `--config-dir` и его значение — после изменения они упадут и потребуют обновления.
- **XDG-поведение OBS:** `$XDG_CONFIG_HOME/obs-studio/` будет использован как директория конфига. Если `XDG_CONFIG_HOME` не установлен — OBS откатывается к `~/.config/`. После изменения `OBS_CONFIG_DIR` будет влиять на конфиг через env, а не через аргумент.
