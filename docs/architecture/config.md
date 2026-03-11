# Структура конфигурации

Конфигурация приложения описывается классом `AppConfig` с вложенными секциями. Валидация выполняется через `class-validator` при старте приложения. При ошибке выводятся все нарушения сразу, после чего процесс завершается с кодом 1.

## Секции AppConfig

| Секция | Поле | Переменные окружения |
|--------|------|----------------------|
| `chrome` | Chrome браузер | `CHROME_PATH`, `DEVTOOLS_PORT`, `CHROME_READY_TIMEOUT`, `CHROME_WINDOW_MODE`, `CHROME_USER_DATA_DIR`, `CHROME_WINDOW_WIDTH`, `CHROME_WINDOW_HEIGHT`, `CHROME_WINDOW_POSITION_X`, `CHROME_WINDOW_POSITION_Y` |
| `obs` | OBS Studio | `OBS_PATH`, `OBS_READY_TIMEOUT`, `OBS_PROFILE_PATH` |
| `telegram` | Telegram бот | `TELEGRAM_BOT_TOKEN`, `ALLOWED_TELEGRAM_USERS` |
| `idle` | Idle HTTP сервер | `IDLE_PORT`, `IDLE_VIEWS_PATH` |
| `watchdog` | Watchdog | `WATCHDOG_CHECK_INTERVAL_MS`, `WATCHDOG_RESTART_MIN_INTERVAL_MS` |
| (верхний уровень) | Общие | `LOG_LEVEL`, `LAST_URL_STATE_PATH` |

## Классы-секции

### ChromeConfig
- `path` (string, обязательный) — путь к исполняемому файлу Chrome
- `devToolsPort` (number, 1–65535, опциональный) — порт DevTools
- `readyTimeout` (number, ≥1, опциональный) — таймаут готовности (мс)
- `windowMode` ('kiosk' | 'app' | 'fullscreen' | 'default', опциональный) — режим окна
- `userDataDir` (string, опциональный) — директория пользовательских данных Chrome
- `windowWidth` (number, 1–7680, опциональный) — ширина окна в пикселях; применяется только вместе с `windowHeight`
- `windowHeight` (number, 1–7680, опциональный) — высота окна в пикселях; применяется только вместе с `windowWidth`
- `windowPositionX` (number, опциональный) — координата X левого верхнего угла окна (допустимы отрицательные значения для мультимониторных конфигураций)
- `windowPositionY` (number, опциональный) — координата Y; позиция применяется только когда заданы обе координаты

В режимах kiosk и fullscreen браузер может игнорировать размер и позицию окна; аргументы `--window-size` и `--window-position` передаются в любом случае при заданных переменных окружения.

### ObsConfig
- `path` (string, обязательный) — путь к исполняемому файлу OBS
- `readyTimeout` (number, ≥1, опциональный) — таймаут готовности (мс)
- `profilePath` (string, опциональный) — путь к профилю OBS

### TelegramConfig
- `botToken` (string, опциональный) — токен Telegram Bot API
- `allowedUsers` (string[], опциональный) — разрешённые user id или usernames

### IdleConfig
- `port` (number, 1–65535, обязательный) — порт idle HTTP сервера
- `viewsPath` (string, обязательный) — путь к директории EJS-шаблонов

### WatchdogConfig
- `checkIntervalMs` (number, ≥1, опциональный) — интервал проверок (мс); если не задан, watchdog отключён
- `restartMinIntervalMs` (number, ≥1, опциональный) — минимальный интервал между перезапусками (мс)

## Публичное API

```typescript
import { getConfig, resetConfigForTesting, validateEnv } from './modules/config';

// Получить конфиг (с кешированием)
const config = getConfig();

// Обращение к полям
config.logLevel              // 'info' | 'warn' | 'error' | 'debug'
config.chrome.path           // string
config.chrome.devToolsPort   // number | undefined
config.obs.path              // string
config.idle.port             // number
config.idle.viewsPath        // string
config.telegram.botToken     // string | undefined
config.telegram.allowedUsers // string[] | undefined
config.watchdog.checkIntervalMs // number | undefined
```
