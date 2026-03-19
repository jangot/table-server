# Анализ: Документ — логика управления Chrome (без запуска)

## Общее описание функциональности

Задача — собрать в один MD-документ полное описание **логики управления уже запущенным Chrome** в текущем POC: подключение по CDP, получение данных, действия (навигация, viewport, скрипты по домену), привязка окна к OBS, конфигурация именно для управления, источники команд. Документ нужен для переноса в другой репозиторий, где Chrome не запускается приложением; в документ **не включаются** параметры и настройки запуска Chrome (путь к бинарнику, флаги, kiosk, userDataDir и т.п.).

## Связанные модули и сущности

| Модуль/файл | Назначение | Что затрагивает задача |
|-------------|------------|-------------------------|
| `src/modules/chrome/cdp.ts` | Подключение к Chrome по CDP (puppeteer-core), навигация, viewport, выполнение скрипта по домену, запись последнего URL | Основной источник: endpoint, порт, страницы, setViewport, goto, evaluate, lastUrl |
| `src/modules/chrome/scriptRegistry.ts` | Загрузка мапы домен→скрипт, разрешение скрипта по URL (hostname) | Логика скриптов по домену, формат мапы, безопасность имён файлов |
| `src/modules/chrome/lastUrlState.ts` | Чтение/запись последнего URL в файл | Состояние «текущий URL» для управления |
| `src/modules/chrome/waitDevTools.ts` | Ожидание готовности DevTools (GET /json/version по порту) | Переподключение/ожидание — часть логики «доступен ли Chrome» (в новом проекте без запуска может использоваться для проверки готовности) |
| `src/modules/chrome/index.ts` | Публичный API: navigateToUrl, readLastUrl, isChromeAlive, restartChrome; оркестрация с launch | Какие параметры конфига передаются в CDP (viewport, scriptRegistry), откуда берутся port, statePath, idleUrl; **isChromeAlive** сейчас через getChromeProcess (запуск) — в документе описать альтернативу по CDP |
| `src/modules/obs-scenes/chrome-window-bind.ts` | Поиск окна Chrome через xdotool, привязка источника OBS к XID | Привязка окна к OBS: как определяется окно, какой API OBS |
| `src/modules/obs-scenes/index.ts` | Создание OBS-сервиса, onConnected → bindChromeWindow | Когда вызывается привязка (при подключении/реконнекте OBS) |
| `src/modules/config/types.ts` | Типы конфига (ChromeConfig, AppConfig) | Выделить поля, используемые только для **управления** (не для запуска) |
| `src/modules/config/validate.ts` | Чтение конфига из env | Соответствие env-переменных полям управления |
| `src/modules/telegram-bot/handlers.ts` | Команды /idle, /restart, текст с URL → navigateToUrl | Откуда приходят команды на навигацию и idle |
| `src/index.ts` | Старт: readLastUrl → navigateToUrl после оркестратора; передача navigateToUrl, isChromeAlive, restartChrome в бота | Зависимости: кто вызывает Chrome-логику при старте и из бота |
| `src/modules/idle-server/index.ts` | HTTP: /health (chrome/obs alive), /obs/scenes, POST /obs/scene | HTTP не вызывает navigateToUrl — только health и сцены OBS |
| `docs/requirements/obs_chrome_window_binding.md` | Спека привязки окна Chrome к OBS | Доп. контекст по XID, xdotool, SetInputSettings |

## Текущие интерфейсы и API (если есть)

- **cdp.ts**
  - `navigateToUrl(port, url, statePath, logger, options?)` — подключается к `http://127.0.0.1:${port}`, берёт `pages[0]` или создаёт `newPage()`, при наличии `options.viewport` вызывает `page.setViewport()`, делает `page.goto(url, { waitUntil: 'domcontentloaded', timeout })`, при наличии `options.scriptRegistry` выполняет скрипт для домена через `resolveScript(url, ...)` и `page.evaluate(script)`, пишет URL в файл через `writeLastUrl(statePath, url)`, отключается `browser.disconnect()`.
- **scriptRegistry.ts**
  - `loadScriptMap(mapPath, logger)` → ScriptMap | null — JSON-объект hostname → имя файла.
  - `resolveScript(url, scriptsDir, scriptMap, logger)` → string | null — по hostname URL находит файл в scriptsDir, возвращает содержимое (только basename, без `..`).
- **lastUrlState.ts**
  - `readLastUrl(filePath)` → Promise<string | null>
  - `writeLastUrl(filePath, url)` → Promise<void>
- **chrome/index.ts**
  - `navigateToUrl(url, { config, logger })` — проверяет getChromeProcess(), берёт port (config.chrome.devToolsPort ?? 9222), statePath (config.lastUrlStatePath ?? './.last-url'), viewport из config.chrome (windowWidth, windowHeight, deviceScaleFactor), при наличии chromeScriptsDir и chromeScriptsMap собирает scriptRegistry и вызывает cdpNavigateToUrl.
  - `readLastUrl(statePath)` — реэкспорт.
  - `isChromeAlive(config)` — сейчас по getChromeProcess() (процесс, запущенный приложением); для «только управление» в документе описать проверку по CDP (например, GET /json/version или connect).
- **waitDevTools.ts**
  - `waitForDevTools(port, timeoutMs)` — опрос `http://127.0.0.1:${port}/json/version` каждые 250 ms до 200 или таймаут.
- **chrome-window-bind.ts**
  - `bindChromeWindow(client, sourceName, logger, execFileFn?, timeoutMs?)` — в цикле до deadline: `xdotool search --onlyvisible --class chrome`, берёт первый XID из stdout, вызывает `client.setInputSettings(sourceName, { capture_window: xid })`, при ошибке логирует и повторяет через 500 ms. Таймаут по умолчанию 10 s.

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить/создать |
|------|--------------|----------------------------|
| `src/modules/chrome/cdp.ts` | CDP: connect(browserURL), pages(), newPage(), setViewport(), goto(), evaluate(), writeLastUrl(), disconnect() | Документировать: endpoint (127.0.0.1:port), порядок операций, опции (viewport, scriptRegistry, timeoutMs) |
| `src/modules/chrome/scriptRegistry.ts` | loadScriptMap, resolveScript; формат мапы { "hostname": "script.js" }, scriptsDir, безопасность basename | Документировать: формат мапы, привязка по hostname URL, откуда конфиг (chromeScriptsDir, chromeScriptsMap) |
| `src/modules/chrome/lastUrlState.ts` | readLastUrl, writeLastUrl | Документировать: путь из конфига (lastUrlStatePath), когда читается/пишется |
| `src/modules/chrome/waitDevTools.ts` | Ожидание GET /json/version на port | Документировать: URL, интервал, таймаут (readyTimeout); применимость при «только управление» (проверка готовности без запуска) |
| `src/modules/chrome/index.ts` | navigateToUrl (config → port, statePath, viewport, scriptRegistry), readLastUrl, isChromeAlive (getChromeProcess), restartChrome | Документировать: какие поля config используются для управления; отметить, что isChromeAlive сейчас завязан на процесс, в новом проекте — проверка по CDP |
| `src/modules/obs-scenes/chrome-window-bind.ts` | xdotool search --onlyvisible --class chrome, setInputSettings(sourceName, { capture_window: xid }) | Документировать: определение окна (X11, класс chrome), OBS SetInputSettings(capture_window), таймаут и ретраи |
| `src/modules/obs-scenes/index.ts` | onConnected → bindChromeWindow(client, chromeSourceName, logger) | Документировать: момент привязки (при подключении/реконнекте OBS), конфиг chromeSourceName |
| `src/modules/config/types.ts` | ChromeConfig (path, devToolsPort, readyTimeout, windowMode, kiosk, userDataDir, windowWidth/Height, position, deviceScaleFactor, ozonePlatform), AppConfig (lastUrlStatePath, chromeScriptsDir, chromeScriptsMap, idle, obs.chromeSourceName) | В документе перечислить только поля для управления: devToolsPort, readyTimeout, windowWidth, windowHeight, deviceScaleFactor; lastUrlStatePath; chromeScriptsDir, chromeScriptsMap; idle.port (URL по умолчанию); obs.chromeSourceName |
| `src/modules/telegram-bot/handlers.ts` | /idle → navigateToUrl(idleUrl), текст с URL → navigateToUrl(url), /restart chrome | Документировать: источники команд (Telegram), какие действия вызывают navigateToUrl |
| `src/index.ts` | После runOrchestrator: readLastUrl → navigateToUrl(lastUrl); передача в бота navigateToUrl, isChromeAlive, restartChrome | Документировать: восстановление lastUrl при старте приложения; зависимости модулей от Chrome-логики |
| **Результат задачи** | — | **Создать** один MD-файл (в рамках задачи 038 — не в этом шаге; здесь только анализ для плана) с описанием логики управления Chrome по структуре из description.md |

## Зависимости и ограничения

- **Подключение к Chrome:** используется `puppeteer-core` и `connect({ browserURL: 'http://127.0.0.1:${port}' })`. Chrome должен быть запущен с remote debugging на этом порту. В текущем POC порт задаётся при запуске; в новом проекте порт будет единственным способом «подключиться к уже запущенному» Chrome.
- **Переподключение:** явного переподключения при обрыве в коде нет — каждый вызов navigateToUrl создаёт новое подключение и отключается. Ожидание готовности — только waitForDevTools (при старте/рестарте). Для документа: описать возможность проверки готовности через GET /json/version или connect без логики запуска.
- **Вкладки/окна:** используется только первая страница `pages[0]` или одна новая; управление несколькими вкладками/окнами в коде отсутствует. Zoom, fullscreen через CDP не используются — только viewport (ширина, высота, deviceScaleFactor).
- **Скрипты по домену:** привязка по hostname из URL; мапа загружается при каждой навигации из файла (chromeScriptsMap). Ограничение: только один скрипт на домен, выполняется после goto (domcontentloaded).
- **OBS:** привязка окна зависит от X11 и xdotool (класс `chrome`). В коде используется ключ `capture_window` в SetInputSettings (в docs/requirements — пример с `window`; возможна разница версий OBS/obs-websocket). Документ должен описать фактическое поведение кода (capture_window, имя источника из конфига).
- **Конфигурация управления:** источник — env через config (validate.ts). В документ включить только переменные, относящиеся к управлению (DEVTOOLS_PORT, CHROME_READY_TIMEOUT, CHROME_WINDOW_WIDTH/HEIGHT, CHROME_DEVICE_SCALE_FACTOR, LAST_URL_STATE_PATH, CHROME_SCRIPTS_DIR, CHROME_SCRIPTS_MAP, IDLE_PORT для idle URL, OBS_CHROME_SOURCE_NAME). Не включать: CHROME_PATH, CHROME_USER_DATA_DIR, CHROME_WINDOW_MODE, CHROME_KIOSK, CHROME_WINDOW_POSITION_*, CHROME_OZONE_PLATFORM.
- **Источники команд:** Telegram (navigateToUrl при /idle и при сообщении с URL; restartChrome при /restart chrome/all). HTTP (idle-server) навигацию в Chrome не вызывает — только health и переключение сцен OBS. При старте приложения — однократный вызов navigateToUrl(lastUrl) после запуска модулей.
- **Риски:** в новом репозитории не будет getChromeProcess() — проверка «Chrome жив» должна быть переведена на опрос CDP или /json/version; restartChrome в старом виде (kill + launch) не применим, в документе описать только текущую логику управления без рестарта процесса.
