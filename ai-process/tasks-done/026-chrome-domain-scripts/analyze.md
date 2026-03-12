# Анализ: Скрипты по доменам/URL при открытии ссылок в Chrome

## Общее описание функциональности

При навигации Chrome на URL нужно автоматически выполнять JS-скрипт в контексте страницы, если домен URL зарегистрирован в конфиге. Архитектура:

- **Реестр скриптов** — папка с JS-файлами (по одному файлу на скрипт).
- **Мап** — JSON-файл вида `{ "example.com": "login.js", "other.com": "accept.js" }`, связывает домен с именем файла в папке реестра.
- **При навигации:** извлекается hostname из URL → ищется в мапе → если есть совпадение, читается JS-файл → выполняется через `page.evaluate()` после загрузки страницы. Если домена нет в мапе — ничего не происходит.

## Связанные модули и сущности

| Модуль/Файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/chrome/cdp.ts` | Навигация через puppeteer-core — `page.goto()` | Добавить вызов скрипта после навигации, принять `scriptRegistry` как опцию |
| `src/modules/chrome/index.ts` | Публичный API модуля Chrome: `navigateToUrl`, `restartChrome` | Загружать и передавать реестр скриптов в cdp.ts |
| `src/modules/config/types.ts` | Классы конфигурации AppConfig с class-validator | Добавить два поля: `chromeScriptsDir` и `chromeScriptsMap` |
| `src/modules/config/validate.ts` | Читает env-переменные → AppConfig | Добавить чтение `CHROME_SCRIPTS_DIR` и `CHROME_SCRIPTS_MAP` |
| `src/modules/obs-scenes/scenes-config.ts` | Синхронная загрузка JSON конфига | Паттерн для загрузки файла мапы |
| `docs/env.md` | Документация переменных окружения | Добавить описание двух новых переменных |

## Текущие интерфейсы и API (если есть)

### `navigateToUrl` (cdp.ts:5)
```
navigateToUrl(port, url, statePath, logger, options?) → Promise<void>
```
- `options` сейчас принимает `timeoutMs` и `viewport`
- Нужно добавить необязательный параметр `scriptRegistry?: ScriptRegistry`

### `navigateToUrl` (chrome/index.ts:46)
```
navigateToUrl(url, { config, logger }) → Promise<void>
```
- Обёртка, формирует параметры из конфига и вызывает cdp.ts
- Здесь нужно загружать реестр скриптов и передавать его вниз

### `loadScenesConfigSync` (obs-scenes/scenes-config.ts:9)
Паттерн: синхронная загрузка JSON по пути из конфига, возвращает `null` при ошибке/отсутствии файла — аналогично нужно реализовать загрузку мап-файла.

### `AppConfig` (config/types.ts:145)
Сейчас имеет `scenesConfigPath?: string` — по аналогии добавить `chromeScriptsDir?: string` и `chromeScriptsMap?: string`.

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить/создать |
|---|---|---|
| `src/modules/chrome/scriptRegistry.ts` | — (не существует) | Создать: тип `ScriptRegistry`, функция загрузки мап-файла (`loadScriptMap`), функция поиска и чтения скрипта по URL (`resolveScript`) |
| `src/modules/chrome/cdp.ts` | Функция навигации через puppeteer | Принять `scriptRegistry` в options; после `page.goto` вызвать `resolveScript(url)` и если результат есть — `page.evaluate(script)` |
| `src/modules/chrome/index.ts` | Публичный API модуля chrome | В `navigateToUrl` загружать мап (`loadScriptMap`) и передавать в cdp; экспортировать новые утилиты |
| `src/modules/config/types.ts` | AppConfig | Добавить `chromeScriptsDir?: string` и `chromeScriptsMap?: string` |
| `src/modules/config/validate.ts` | Чтение env → AppConfig | Добавить `chromeScriptsDir` и `chromeScriptsMap` из env |
| `test/chrome-script-registry.test.ts` | — (не существует) | Тесты: загрузка мап, матчинг домена, чтение файла скрипта, невалидный формат, отсутствие файла |
| `docs/env.md` | Документация переменных | Добавить `CHROME_SCRIPTS_DIR` и `CHROME_SCRIPTS_MAP` |

## Зависимости и ограничения

- **puppeteer-core** уже подключён — `page.evaluate(scriptContent)` доступно без новых зависимостей.
- **Структура файлов:**
  - `CHROME_SCRIPTS_DIR` — путь к папке, например `/etc/table-server/scripts/`
  - `CHROME_SCRIPTS_MAP` — путь к JSON-файлу, например `/etc/table-server/scripts/domains.json`
  - Содержимое мап-файла: `{ "hostname": "filename.js" }`, где `filename.js` — имя файла в `CHROME_SCRIPTS_DIR`
- **Матчинг:** только по `hostname` (`new URL(url).hostname`), без path. Без wildcards на первом этапе.
- **Чтение файла скрипта:** синхронно при каждой навигации (скрипты могут обновляться без рестарта сервера) или один раз при старте — нужно определить при планировании.
- **Graceful fallback:** если `CHROME_SCRIPTS_MAP` не задан, файл не найден или домен не в мапе — навигация проходит без изменений, ошибка не выбрасывается (только warn в логгер).
- **Безопасность:** JS-файлы выполняются в контексте страницы через CDP; скрипты не должны попадать в репозиторий — документировать в `docs/security.md`. Имена файлов из мап-файла должны валидироваться (только basename, без `../`).
