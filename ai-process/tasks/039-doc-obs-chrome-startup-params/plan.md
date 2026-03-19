# План реализации: Документ — параметры запуска OBS и Chrome для корректной конфигурации

Создать один структурированный MD-документ в `docs/`, в котором собраны все параметры запуска OBS и Chrome (путь, аргументы CLI, переменные окружения) и требования к состоянию приложений для работы управления (WebSocket у OBS, CDP у Chrome). Документ позволит при ручном или внешнем запуске задать те же параметры, что и при запуске из приложения. Код не меняется — только новый файл документации.

## 1. Создать документ и секцию «OBS»

**Файл (создать):** `docs/obs-chrome-startup.md`

В начале файла — краткое введение: для кого документ, что в нём (параметры запуска и требования для управления), что не входит (логика управления — см. задачи 037, 038).

Затем секция **OBS** с подразделами:

- **Путь к исполняемому файлу**  
  Источник: конфиг `obs.path` → переменная окружения `OBS_PATH` (см. `config/validate.ts`). Описать, что при запуске приложением используется именно это значение.

- **Аргументы командной строки**  
  Взять из `src/modules/obs/args.ts`: при наличии `config.obs.profilePath` добавляется один аргумент `--profile=<profilePath>`. Указать источник: `OBS_PROFILE_PATH` (опционально). Привести пример полной команды:
  ```bash
  # Пример (без env)
  /path/to/obs --profile=/path/to/profile
  ```

- **Переменные окружения при запуске**  
  Из `obs/launch.ts` и `obs/index.ts`: при запуске в процесс передаётся `env = { ...process.env, XDG_CONFIG_HOME: config.obs.configDir }`. Указать: `OBS_CONFIG_DIR` задаёт каталог конфигурации OBS через `XDG_CONFIG_HOME`. Таблица: переменная окружения → влияние на запуск.

- **Требования к состоянию OBS для управления**  
  По `obs-scenes/client.ts`: для управления сценой и проектором нужен включённый WebSocket-сервер в OBS; host, port и password должны совпадать с настройками приложения. Указать переменные: `OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD` и кратко — что они должны соответствовать настройкам WebSocket в OBS.

## 2. Секция «Chrome»

**Файл (изменить):** `docs/obs-chrome-startup.md`

Добавить секцию **Chrome** с подразделами:

- **Путь к исполняемому файлу**  
  Источник: `config.chrome.path` → `CHROME_PATH`.

- **Аргументы командной строки (флаги)**  
  Выписать из `src/modules/chrome/args.ts` полный набор флагов и условий:
  - Обязательные: `--remote-debugging-port=<port>`, `--no-first-run`, `--no-default-browser-check`, `--disable-default-apps`, `<initialUrl>`.
  - Опционально: `--user-data-dir` (из `CHROME_USER_DATA_DIR`), режимы окна: `--kiosk` (+ `--noerrdialogs`, `--disable-infobars`), `--app=<url>`, `--start-fullscreen`; `--window-position`, `--window-size`; `--force-device-scale-factor`; `--ozone-platform`.
  - Указать соответствие: `DEVTOOLS_PORT`, `CHROME_USER_DATA_DIR`, `CHROME_WINDOW_MODE` (kiosk/app/fullscreen/default), `CHROME_KIOSK`, `CHROME_WINDOW_WIDTH`, `CHROME_WINDOW_HEIGHT`, `CHROME_WINDOW_POSITION_X/Y`, `CHROME_DEVICE_SCALE_FACTOR`, `CHROME_OZONE_PLATFORM`.
  - initialUrl при запуске из приложения: `http://localhost:<IDLE_PORT>/` (из `idle.port` → `IDLE_PORT`). Для внешнего запуска пояснить: либо поднять idle-сервер на том же порту, либо подставить свой URL с пониманием влияния на CDP и переход на «idle».

- **Переменные окружения при запуске**  
  Из `chrome/launch.ts`: окружение не переопределяется (наследуется от процесса). Явных env для Chrome в коде нет — указать это в документе.

- **Требования к состоянию Chrome для управления**  
  Порт CDP должен совпадать с `DEVTOOLS_PORT` (по умолчанию 9222); приложение подключается к Chrome по этому порту. Кратко упомянуть зависимость от initialUrl/idle для сценариев перехода на idle-страницу.

## 3. Сводные таблицы и ссылки

**Файл (изменить):** `docs/obs-chrome-startup.md`

- Добавить в конец документа:
  - **Сводная таблица переменных окружения для запуска** (только те, что влияют на запуск OBS и Chrome): OBS_PATH, OBS_PROFILE_PATH, OBS_CONFIG_DIR; CHROME_PATH, DEVTOOLS_PORT, CHROME_USER_DATA_DIR, CHROME_WINDOW_*, CHROME_DEVICE_SCALE_FACTOR, CHROME_OZONE_PLATFORM, CHROME_WINDOW_MODE, CHROME_KIOSK; IDLE_PORT (для initialUrl). Можно разбить на две таблицы: OBS / Chrome.
  - **Ссылки:** `docs/env.md` (общий справочник переменных окружения), задачи 037 и 038 (логика управления OBS и Chrome).

## 4. Проверка документа

Убедиться по чек-листу (без автоматических тестов):

- Все параметры запуска из `obs/args.ts`, `obs/launch.ts`, `obs/index.ts` и `config/validate.ts` для OBS отражены в документе.
- Все флаги и параметры из `chrome/args.ts`, `chrome/launch.ts`, `chrome/index.ts` и `config/validate.ts` для Chrome отражены в документе.
- Требования к состоянию (WebSocket для OBS, CDP и initialUrl для Chrome) сформулированы ясно.
- Документ не описывает логику управления (только параметры запуска и требования для управления).

## Сводка файлов

| Действие | Файл |
|----------|------|
| Создать  | `docs/obs-chrome-startup.md` |

## Ссылки

- [analyze.md](analyze.md) текущей задачи
- [description.md](description.md) текущей задачи
- Задачи 037 (OBS), 038 (Chrome) — логика управления
- `docs/env.md` — переменные окружения
