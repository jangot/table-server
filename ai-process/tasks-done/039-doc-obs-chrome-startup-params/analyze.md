# Анализ: Документ — параметры запуска OBS и Chrome для корректной конфигурации

## Общее описание функциональности

Нужно собрать в один MD-документ все параметры **запуска** OBS и Chrome, которые приложение использует при старте этих процессов (пути, аргументы CLI, переменные окружения), а также требования к состоянию приложений для работы управления (WebSocket у OBS, CDP у Chrome). Цель: при ручном или внешнем запуске OBS и Chrome можно было задать те же параметры, что и при запуске из приложения, для совместимости с логикой управления из задач 037 и 038. Результат — один структурированный MD-файл; описание самой логики управления в документ не входит.

## Связанные модули и сущности

| Модуль/файл | Назначение | Что затрагивает задача |
|--------------|------------|------------------------|
| `src/modules/obs/launch.ts` | Запуск процесса OBS (spawn), ожидание ready | Источник: путь, args, env при запуске |
| `src/modules/obs/args.ts` | Формирование аргументов командной строки OBS | Полный список CLI-аргументов OBS |
| `src/modules/obs/index.ts` | Модуль OBS: вызов launch с config и env | Откуда берутся path, timeout, env (XDG_CONFIG_HOME) |
| `src/modules/obs/ready.ts` | Критерий «OBS готов» (процесс жив) | Требования к состоянию после запуска (минимальные) |
| `src/modules/chrome/launch.ts` | Запуск процесса Chrome, ожидание DevTools | Источник: путь, args (env не переопределяются) |
| `src/modules/chrome/args.ts` | Формирование аргументов Chrome | Полный список флагов Chrome в зависимости от config |
| `src/modules/chrome/index.ts` | Модуль Chrome: порт, idleUrl, buildChromeArgs, launchChrome | Откуда берутся path, port, initialUrl, таймаут |
| `src/modules/config/validate.ts` | Чтение конфига из env | Соответствие переменных окружения полям config |
| `src/modules/config/types.ts` | Типы ObsConfig, ChromeConfig, AppConfig | Полный перечень полей, влияющих на запуск |
| `src/modules/obs-scenes/client.ts` | Подключение к OBS по WebSocket | Требования к OBS: host, port, password (включённый WebSocket) |
| `src/modules/idle-server/index.ts` | Idle HTTP-сервер | Порт idle (IDLE_PORT) — от него зависит initialUrl Chrome |
| `docs/env.md` | Документация переменных окружения | Существующий справочник; новый документ может ссылаться на него |

## Текущие интерфейсы и API (если есть)

- **`buildObsArgs(config: AppConfig): string[]`** (`obs/args.ts`) — возвращает массив аргументов для OBS. Использует только `config.obs.profilePath` (при наличии добавляется `--profile=...`).
- **`launchObs(obsPath, args, timeoutMs, logger, env?)`** (`obs/launch.ts`) — запускает OBS с заданными path, args и env. env при запуске из приложения: `{ ...process.env, XDG_CONFIG_HOME: config.obs.configDir }`.
- **`buildChromeArgs(config, devToolsPort, initialUrl): string[]`** (`chrome/args.ts`) — возвращает массив аргументов Chrome. Зависит от: `config.chrome` (userDataDir, windowMode, kiosk, window size/position, deviceScaleFactor, ozonePlatform), devToolsPort, initialUrl.
- **`launchChrome(chromePath, args, port, timeoutMs, logger)`** (`chrome/launch.ts`) — запускает Chrome с path и args; окружение не переопределяется (наследуется от процесса).
- Конфиг строится в **`validateEnv()`** из переменных окружения; типы — **`ObsConfig`**, **`ChromeConfig`** в `config/types.ts`.

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить/создать |
|------|----------------|----------------------------|
| `src/modules/obs/args.ts` | `buildObsArgs`: только `--profile=` при наличии profilePath | Только чтение: выписать все возможные аргументы OBS |
| `src/modules/obs/launch.ts` | spawn(obsPath, args, { env }) | Только чтение: env = XDG_CONFIG_HOME из configDir |
| `src/modules/obs/index.ts` | run(): args = buildObsArgs(config), env = { ...process.env, XDG_CONFIG_HOME: config.obs.configDir } | Только чтение: источник path, args, env |
| `src/modules/config/validate.ts` | obs: path, readyTimeout, profilePath, configDir, host, port, password, ... | Только чтение: маппинг env → параметры запуска OBS |
| `src/modules/config/types.ts` | ObsConfig, ChromeConfig | Только чтение: перечень полей для таблицы параметров |
| `src/modules/chrome/args.ts` | buildChromeArgs: remote-debugging-port, user-data-dir, window mode (kiosk/app/fullscreen/default), размер/позиция, scale, ozone-platform | Только чтение: полный список флагов Chrome и условий |
| `src/modules/chrome/index.ts` | port = config.chrome.devToolsPort ?? 9222, idleUrl = http://localhost:${config.idle.port}/ | Только чтение: источник port и initialUrl |
| `src/modules/chrome/launch.ts` | spawn(chromePath, args), без переопределения env | Только чтение: явных env для Chrome нет |
| `src/modules/obs-scenes/client.ts` | Подключение к ws://host:port с password | Только чтение: требования к OBS (WebSocket включён, host/port/password) |
| `docs/` | env.md и др. | **Создать** новый MD-документ (место и имя — на этапе plan), структурированный по секциям OBS / Chrome, с параметрами запуска и требованиями к состоянию для управления |

## Зависимости и ограничения

- **Источники параметров:** все значения берутся из конфига, конфиг строится только из переменных окружения (`validateEnv()`). Справочник переменных частично описан в `docs/env.md`; в нём нет части опциональных переменных (OBS_HOST, OBS_PORT, OBS_PASSWORD, OBS_CONFIG_DIR, CHROME_WINDOW_MODE, размеры окна и т.д.).
- **OBS:** при запуске приложением передаётся только одна доп. переменная окружения — `XDG_CONFIG_HOME` (из `OBS_CONFIG_DIR`). Путь к исполняемому файлу — `OBS_PATH`; аргументы — только опциональный `--profile=...` из `OBS_PROFILE_PATH`. Для управления сценой и проектором нужен включённый WebSocket-сервер в OBS и совпадение host/port/password с `OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD`.
- **Chrome:** путь — `CHROME_PATH`; аргументы полностью определяются конфигом (DEVTOOLS_PORT, CHROME_USER_DATA_DIR, CHROME_WINDOW_MODE, CHROME_KIOSK, размер/позиция окна, deviceScaleFactor, ozonePlatform) и значением initialUrl. initialUrl при запуске из приложения — `http://localhost:<IDLE_PORT>/`; для внешнего запуска нужно либо поднять idle-сервер на том же порту, либо заменить URL на свой (и понимать, что управление через CDP и переход на «idle» будут опираться на этот порт/сервер).
- **Риски:** в `docs/env.md` перечислены не все переменные, влияющие на запуск; новый документ должен дать полную выжимку именно для запуска OBS и Chrome, без дублирования всей логики управления (037, 038).
