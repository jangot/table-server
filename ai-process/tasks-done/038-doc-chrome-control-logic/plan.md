# План реализации: Документ — логика управления Chrome (без запуска)

Собрать в один MD-документ полное описание логики управления уже запущенным Chrome: CDP (подключение, навигация, viewport, скрипты по домену), состояние последнего URL, привязка окна к OBS, конфигурация только для управления. Документ предназначен для переноса в другой репозиторий; параметры и настройки запуска Chrome в документ не включать.

## 1. Создать файл документа и вводный раздел

**Файл (создать):** `docs/chrome-control-logic.md`

Создать файл с заголовком, кратким назначением документа (для переноса в другой репозиторий, только управление уже запущенным Chrome по CDP) и оглавлением по разделам ниже. Явно указать, что параметры запуска Chrome (path, userDataDir, kiosk, флаги, ozonePlatform и т.п.) в документ не входят.

```markdown
# Chrome control logic (without launch)

This document describes how the application controls an already running Chrome instance via CDP...
```

## 2. Раздел: подключение к Chrome по CDP

**Файл (изменить):** `docs/chrome-control-logic.md`

Описать на основе `src/modules/chrome/cdp.ts` и `src/modules/chrome/waitDevTools.ts`:
- Endpoint: `http://127.0.0.1:${port}` (порт из конфига, по умолчанию 9222). Подключение через `puppeteer-core` — `connect({ browserURL })`.
- Ожидание готовности: GET `http://127.0.0.1:${port}/json/version`, опрос каждые 250 ms до ответа 200 или таймаут (`waitForDevTools(port, timeoutMs)`). Применимость при «только управление» — проверка готовности без запуска процесса.
- Переподключение: в текущем коде явного переподключения при обрыве нет; каждый вызов навигации создаёт новое подключение и отключается (`browser.disconnect()`). В документе описать возможность проверки готовности через GET /json/version или connect.

Источники: `cdp.ts` (connect, disconnect), `waitDevTools.ts` (URL, интервал, таймаут).

## 3. Раздел: получение данных

**Файл (изменить):** `docs/chrome-control-logic.md`

На основе `src/modules/chrome/lastUrlState.ts` и `src/modules/chrome/cdp.ts` выписать:
- **Текущий URL:** чтение из файла — `readLastUrl(filePath)` (Promise<string | null>). Путь из конфига `lastUrlStatePath` (по умолчанию `./.last-url`). Запись — при каждой успешной навигации через `writeLastUrl(statePath, url)`.
- **Вкладки/страницы:** в коде используется только первая страница `pages[0]` или одна новая `newPage()`; управление несколькими вкладками/окнами отсутствует.
- **Размеры окна (viewport):** передаются в CDP при навигации — `page.setViewport({ width, height, deviceScaleFactor })`; значения из конфига (windowWidth, windowHeight, deviceScaleFactor). Zoom/fullscreen через CDP в коде не используются.

## 4. Раздел: действия управления (навигация, viewport, скрипты)

**Файл (изменить):** `docs/chrome-control-logic.md`

На основе `src/modules/chrome/cdp.ts` и `src/modules/chrome/scriptRegistry.ts` описать:

- **Навигация:** `navigateToUrl(port, url, statePath, logger, options?)` — подключение к browserURL, получение/создание страницы, при наличии `options.viewport` — `page.setViewport()`, затем `page.goto(url, { waitUntil: 'domcontentloaded', timeout })`, при наличии `options.scriptRegistry` — выполнение скрипта для домена (см. ниже), запись URL в файл `writeLastUrl(statePath, url)`, отключение `browser.disconnect()`.
- **Скрипты по домену:** мапа hostname → имя файла загружается из JSON (`loadScriptMap(mapPath)`); при навигации по URL вызывается `resolveScript(url, scriptsDir, scriptMap, logger)` — по hostname URL возвращается содержимое файла из scriptsDir (только basename, без `..`). Скрипт выполняется после goto через `page.evaluate(script)`. Ограничение: один скрипт на домен, выполняется после domcontentloaded.
- Конфиг: `chromeScriptsDir`, `chromeScriptsMap` (путь к JSON-мапе).

```typescript
// Порядок в cdp: connect → page → setViewport? → goto → resolveScript? → evaluate? → writeLastUrl → disconnect
```

## 5. Раздел: привязка окна Chrome к источнику OBS

**Файл (изменить):** `docs/chrome-control-logic.md`

На основе `src/modules/obs-scenes/chrome-window-bind.ts` и `src/modules/obs-scenes/index.ts`:
- **Момент вызова:** при подключении/реконнекте OBS — `onConnected` → `bindChromeWindow(client, chromeSourceName, logger)`.
- **Определение окна:** X11, команда `xdotool search --onlyvisible --class chrome`, первый XID из stdout.
- **Действие:** вызов OBS WebSocket `client.setInputSettings(sourceName, { capture_window: xid })`. В цикле до deadline при ошибке — лог и повтор через 500 ms; таймаут по умолчанию 10 s.
- Конфиг: `obs.chromeSourceName` (имя источника в OBS).
- Ссылка на существующую спеку: `docs/requirements/obs_chrome_window_binding.md` (XID, xdotool, SetInputSettings). Указать фактическое поведение кода (ключ `capture_window`).

## 6. Раздел: конфигурация управления (сводная таблица)

**Файл (изменить):** `docs/chrome-control-logic.md`

Одна таблица переменных окружения и полей конфига **только для управления** (без path, userDataDir, kiosk, windowMode, position, ozonePlatform и т.д.). Источники: `src/modules/config/types.ts`, `src/modules/config/validate.ts`.

Перечислить:
- `devToolsPort` (DEVTOOLS_PORT) — порт CDP, по умолчанию 9222.
- `readyTimeout` (CHROME_READY_TIMEOUT) — таймаут ожидания готовности DevTools.
- `windowWidth`, `windowHeight`, `deviceScaleFactor` (CHROME_WINDOW_*, CHROME_DEVICE_SCALE_FACTOR) — viewport при навигации.
- `lastUrlStatePath` (LAST_URL_STATE_PATH) — путь к файлу последнего URL.
- `chromeScriptsDir`, `chromeScriptsMap` (CHROME_SCRIPTS_DIR, CHROME_SCRIPTS_MAP) — каталог скриптов и путь к JSON-мапе домен→файл.
- `idle` (IDLE_PORT или аналог для URL по умолчанию) — URL при /idle и т.п.
- `obs.chromeSourceName` (OBS_CHROME_SOURCE_NAME) — имя источника OBS для привязки окна.

Явно перечислить, что **не включается**: CHROME_PATH, CHROME_USER_DATA_DIR, CHROME_WINDOW_MODE, CHROME_KIOSK, CHROME_WINDOW_POSITION_*, CHROME_OZONE_PLATFORM.

## 7. Раздел: зависимости и источники команд

**Файл (изменить):** `docs/chrome-control-logic.md`

На основе `src/modules/telegram-bot/handlers.ts`, `src/index.ts`, `src/modules/idle-server/index.ts`:
- **При старте приложения:** после запуска оркестратора — однократный вызов `readLastUrl(statePath)` → `navigateToUrl(lastUrl)` для восстановления последнего URL.
- **Telegram:** команда `/idle` → `navigateToUrl(idleUrl)`; сообщение с URL (текст) → `navigateToUrl(url)`; команда `/restart chrome` (или all) → `restartChrome` (в новом проекте без запуска рестарт процесса не применим — в документе описать только текущую логику вызова).
- **HTTP (idle-server):** навигацию в Chrome не вызывает — только /health (chrome/obs alive), /obs/scenes, POST /obs/scene.
- Передача в бота: `navigateToUrl`, `isChromeAlive`, `restartChrome` из `src/index.ts`.

## 8. Раздел: проверка «Chrome жив» (isChromeAlive)

**Файл (изменить):** `docs/chrome-control-logic.md`

На основе `src/modules/chrome/index.ts`:
- **Текущая реализация в POC:** проверка через `getChromeProcess()` — процесс, запущенный приложением. В новом репозитории процесса не будет.
- **Рекомендация для «только управление»:** проверка по CDP — например GET `/json/version` на порту или успешный `connect()`; при неудаче считать Chrome недоступным. Описать в документе как альтернативу для переноса.

## 9. Проверка полноты документа

**Файл (изменить):** `docs/chrome-control-logic.md` (чеклист можно оформить в конце или в отдельном подразделе)

Убедиться, что в документе покрыто всё из description.md и analyze.md:
- Подключение к Chrome (CDP: endpoint, порт, переподключение/готовность).
- Получение данных: текущий URL, вкладки/окна (фактически одна страница), viewport.
- Действия: смена URL, viewport, скрипты по домену (формат мапы, hostname, безопасность basename).
- Привязка окна Chrome к OBS (xdotool, XID, SetInputSettings(capture_window), момент вызова).
- Конфигурация только для управления и список исключённых переменных запуска.
- Зависимости: кто вызывает Chrome-логику (старт, Telegram, idle-server — что не вызывает).
- isChromeAlive: текущая реализация и рекомендуемая по CDP для нового проекта.

Сценарии проверки: документ можно передать разработчику нового репозитория — по нему должна быть возможна реализация управления без чтения текущего кода; все перечисленные в analyze модули/файлы отражены в разделах.

## Сводка файлов

| Действие | Файл |
|----------|------|
| Создать  | `docs/chrome-control-logic.md` |
| Изменить | `docs/chrome-control-logic.md` (все последующие шаги — дополнение того же файла) |

## Ссылки

- [analyze.md](analyze.md) текущей задачи
- [description.md](description.md) текущей задачи
- `docs/requirements/obs_chrome_window_binding.md` — спеку привязки окна Chrome к OBS
