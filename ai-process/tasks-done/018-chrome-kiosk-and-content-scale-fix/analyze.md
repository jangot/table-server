# Анализ: Исправить запуск Chrome — размер контента и режим киоска

## Общее описание функциональности

Задача решает две проблемы при запуске Chrome:

1. **Масштаб контента**: окно открывается нужного размера, но контент внутри браузера отображается меньше ожидаемого. Причина, вероятно, в отсутствии флага `--force-device-scale-factor=1`, который явно задаёт масштаб пикселей.

2. **Режим киоска**: системный интерфейс (рамки окна, панель задач) продолжает отображаться, что говорит о неполной активации kiosk-режима. Флага `--kiosk` может быть недостаточно на некоторых Linux DE/WM.

## Связанные модули и сущности

| Модуль/файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/chrome/args.ts` | Построение CLI-аргументов для запуска Chrome | Основной файл — добавление новых флагов |
| `src/modules/chrome/launch.ts` | Запуск процесса Chrome через `spawn`, ожидание DevTools | Не изменяется |
| `src/modules/chrome/index.ts` | Публичный API модуля Chrome | Не изменяется |
| `src/modules/config/types.ts` | Типы конфига (`ChromeConfig`, `AppConfig`) | Возможно добавление нового поля |
| `src/modules/config/validate.ts` | Парсинг env-переменных в конфиг | Возможно добавление нового env-поля |
| `test/chrome.test.ts` | Тесты для `buildChromeArgs` и смежных функций | Нужно добавить тесты для новых флагов |
| `.env.example` | Пример конфигурации | Возможно добавление новой переменной |

## Текущие интерфейсы и API

### `buildChromeArgs(config, devToolsPort, initialUrl): string[]`
Расположен в `src/modules/chrome/args.ts:8`.

Текущие флаги, формируемые функцией:
- `--remote-debugging-port=PORT` — всегда
- `--no-first-run`, `--no-default-browser-check`, `--disable-default-apps` — всегда
- `--kiosk` — если `config.chrome.kiosk === true` или `windowMode === 'kiosk'`
- `--start-fullscreen` — если `windowMode === 'fullscreen'`
- `--app=URL` — если `windowMode === 'app'`
- `--window-size=W,H` — если заданы `windowWidth` и `windowHeight`
- `--window-position=X,Y` — если заданы `windowPositionX` и `windowPositionY`
- `--user-data-dir=PATH` — если задан `userDataDir`

**Отсутствующие флаги** (потенциальные причины проблем):
- `--force-device-scale-factor=1` — не добавляется нигде; именно он управляет масштабом контента
- `--noerrdialogs`, `--disable-infobars` — вспомогательные kiosk-флаги, отсутствуют

### `ChromeConfig` (`src/modules/config/types.ts:7`)
Поля, доступные сейчас:
- `windowMode?: 'kiosk' | 'app' | 'fullscreen' | 'default'`
- `kiosk?: boolean` (устаревший/дублирующий путь)
- `windowWidth/Height`, `windowPositionX/Y`, `userDataDir`

**Отсутствующее поле**: нет `deviceScaleFactor` или `forceDeviceScaleFactor`.

### Env-переменные (из `validate.ts`)
- `CHROME_WINDOW_MODE` — управляет режимом окна
- `CHROME_WINDOW_WIDTH/HEIGHT` — размер окна
- Нет переменной для `force-device-scale-factor`

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить/создать |
|---|---|---|
| `src/modules/chrome/args.ts` | Построение аргументов | Добавить флаг `--force-device-scale-factor` при kiosk/fullscreen или через отдельный конфиг; возможно добавить `--noerrdialogs`, `--disable-infobars` для kiosk |
| `src/modules/config/types.ts` | `ChromeConfig` | Возможно добавить поле `deviceScaleFactor?: number` |
| `src/modules/config/validate.ts` | Парсинг env | Возможно добавить парсинг `CHROME_DEVICE_SCALE_FACTOR` |
| `.env.example` | Документация переменных | Добавить новые переменные в пример |
| `test/chrome.test.ts` | Тесты `buildChromeArgs` | Добавить тесты для новых флагов |

## Зависимости и ограничения

- **Chrome запускается через `spawn` без shell** (`shell: false`): все флаги безопасно передаются как элементы массива, инъекция команд невозможна.
- **Linux kiosk без DE**: флаг `--kiosk` в Chrome убирает UI самого браузера (адресная строка, рамки Chrome), но не скрывает системный WM. Для полного скрытия нужен либо отдельный WM-конфиг, либо `--start-fullscreen` + `--kiosk` вместе — зависит от окружения (X11, Wayland, Xvfb).
- **`--force-device-scale-factor`** принимает число (например `1`, `1.5`, `2`). На HiDPI-экранах Chrome может выбирать значение автоматически — флаг переопределяет это поведение.
- **Регрессии**: изменения только в `args.ts` и конфиге; CDP-навигация, watchdog, Telegram-бот, OBS не затрагиваются.
- **Поле `kiosk?: boolean`** в `ChromeConfig` — дублирует `windowMode === 'kiosk'`. Этот факт важен при анализе логики в `args.ts:26`: оба пути ведут к одному флагу.
- **Конфигурируемость**: нужно решить, делать ли `force-device-scale-factor` настраиваемым через env или фиксировать как `1` при kiosk/fullscreen-режимах.
