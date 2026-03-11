# Анализ: Контент в Chrome отображается маленьким в полноэкранном режиме

## Общее описание функциональности

Задача устраняет проблему отображения контента в Chrome в fullscreen/kiosk-режиме: браузер открывается правильно и без UI-элементов, но содержимое страницы выглядит как небольшой прямоугольник на большом пустом (белом) холсте. Задачи 018 и 019 уже добавили соответствующие флаги (`--force-device-scale-factor`, `--kiosk`, `--ozone-platform` и др.), но проблема не решена до конца — нужно выяснить, что именно является корневой причиной в реальной среде.

---

## Связанные модули и сущности

| Модуль / файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/chrome/args.ts` | Построение массива CLI-аргументов для Chrome | Флаги запуска, scale factor, window mode |
| `src/modules/chrome/cdp.ts` | CDP-навигация через puppeteer-core | `navigateToUrl` — нет viewport override после навигации |
| `src/modules/chrome/launch.ts` | Запуск Chrome через `spawn` | Логирует аргументы; не изменяется |
| `src/modules/chrome/index.ts` | Публичный API модуля Chrome | `navigateToUrl`, `restartChrome` |
| `src/modules/config/types.ts` | Типы конфига (`ChromeConfig`) | Поля: `deviceScaleFactor`, `windowWidth/Height`, `ozonePlatform` |
| `src/modules/config/validate.ts` | Маппинг env → конфиг | Все поля Chrome уже маппятся из env |
| `views/idle.ejs` | Idle-страница (начальный URL Chrome) | Viewport meta, CSS-оформление |
| `views/obs-scenes.ejs` | Страница управления сценами OBS | Имеет `max-width: 600px` — намеренно |
| `test/chrome.test.ts` | Тесты для `buildChromeArgs` | Полное покрытие текущих флагов |

---

## Текущие интерфейсы и API

### `buildChromeArgs` (`src/modules/chrome/args.ts:8`)

Функция собирает все аргументы CLI для Chrome. После задач 018 и 019 в неё добавлены:
- `--kiosk` + `--noerrdialogs` + `--disable-infobars` — при `kiosk === true` или `windowMode === 'kiosk'`
- `--start-fullscreen` — при `windowMode === 'fullscreen'`
- `--window-size=W,H` — если заданы `windowWidth` и `windowHeight`
- `--window-position=X,Y` — если заданы координаты
- `--force-device-scale-factor=N` — **только если** `deviceScaleFactor !== undefined` (т.е. явно задано в `CHROME_DEVICE_SCALE_FACTOR`)
- `--ozone-platform=...` — если задан `ozonePlatform`
- `--user-data-dir=...` — если задан `userDataDir`

**Критически важно**: `--force-device-scale-factor` не добавляется по умолчанию — только при явной установке `CHROME_DEVICE_SCALE_FACTOR` в `.env`. Без него Chrome использует системный DPI.

### `navigateToUrl` (`src/modules/chrome/cdp.ts:5`)

```typescript
export async function navigateToUrl(port, url, statePath, logger, options?)
```

Подключается к Chrome через puppeteer-core, берёт первую страницу и вызывает `page.goto(url)`. **Нет никаких вызовов** `page.setViewport()`, `Emulation.setDeviceMetricsOverride` или других CDP-методов управления viewport. После навигации Chrome полностью управляет размером viewport самостоятельно.

### Env-переменные (из `validate.ts` и `.env.example`)

| Переменная | Поле конфига | По умолчанию | Статус |
|---|---|---|---|
| `CHROME_WINDOW_MODE` | `windowMode` | `'default'` | активна |
| `CHROME_KIOSK` | `kiosk` | `undefined` | активна |
| `CHROME_WINDOW_WIDTH` | `windowWidth` | `undefined` | активна |
| `CHROME_WINDOW_HEIGHT` | `windowHeight` | `undefined` | активна |
| `CHROME_DEVICE_SCALE_FACTOR` | `deviceScaleFactor` | **`undefined`** (не задана по умолчанию) | опциональна |
| `CHROME_OZONE_PLATFORM` | `ozonePlatform` | `undefined` | опциональна |

### Viewport meta в шаблонах

Оба шаблона (`idle.ejs`, `obs-scenes.ejs`) имеют:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```
Это стандартный responsive viewport — ширина контента зависит от `deviceWidth` браузера, который определяется Chrome на основе фактического DPI и `deviceScaleFactor`.

**Дополнительная проблема в `obs-scenes.ejs`**: CSS содержит `max-width: 600px; margin: 2rem auto;` на элементе `body` — это намеренно ограничивает ширину страницы до 600px и центрирует её. Визуально это выглядит как «прямоугольник на белом холсте», что может быть вторичной причиной наблюдаемого эффекта.

---

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить / создать |
|---|---|---|
| `src/modules/chrome/cdp.ts` | CDP-навигация через puppeteer | Возможное место для установки viewport через `page.setViewport()` после `page.goto()` |
| `src/modules/chrome/args.ts` | Флаги Chrome | Возможная точка для условного добавления `--force-device-scale-factor=1` при kiosk/fullscreen без явного конфига |
| `views/obs-scenes.ejs` | UI управления сценами OBS | `max-width: 600px` на body — намеренное ограничение, но может быть причиной видимого эффекта |
| `views/idle.ejs` | Idle-страница | Viewport meta есть; нет CSS для full-page отображения |
| `src/modules/config/types.ts` | Типы конфига | Потенциально — новые поля для управления viewport |
| `src/modules/config/validate.ts` | Маппинг env | Потенциально — новые env-переменные |
| `.env.example` | Пример конфигурации | Возможно уточнение рекомендаций |
| `test/chrome.test.ts` | Тесты buildChromeArgs | Обновление при изменении логики args |

---

## Зависимости и ограничения

### Установленные факты по коду

1. **`--force-device-scale-factor` не применяется без `CHROME_DEVICE_SCALE_FACTOR`**
   - Если пользователь не установил эту переменную, Chrome использует системный DPR.
   - На HiDPI-экране (DPR=2) при разрешении 1920×1080 CSS-viewport Chrome будет 960×540 — контент отрисуется в левом верхнем углу 960px-ширины на физически большом экране.
   - Флаг `--force-device-scale-factor=1` заставляет Chrome считать физические пиксели == CSS-пикселям.

2. **`--window-size` — внешний размер окна, не viewport**
   - Флаг задаёт размер всего окна браузера, включая UI. В kiosk-режиме UI нет, поэтому размер viewport ≈ размеру окна. Но без `--window-size` Chrome может использовать дефолтный размер 800×600 или размер экрана в зависимости от среды.

3. **CSS `max-width: 600px` в `obs-scenes.ejs`**
   - Это фиксированное CSS-ограничение. Если пользователь открывает `/obs/scenes` в kiosk-режиме, визуально это будет центрированный блок 600px на широком экране — независимо от viewport-настроек Chrome.

4. **CDP-навигация не устанавливает viewport**
   - `page.goto()` без `page.setViewport()` оставляет viewport таким, каким его настроил Chrome при старте. Puppeteer-core позволяет вызвать `page.setViewport({ width, height, deviceScaleFactor })` для явного управления.

5. **Wayland vs X11**
   - `--force-device-scale-factor` может игнорироваться Chrome на Wayland — там DPI определяет compositor. На X11 флаг работает надёжно. `CHROME_OZONE_PLATFORM` уже есть для управления этим.

6. **Среда без X11/Wayland (Xvfb)**
   - Если Chrome запускается на виртуальном дисплее (Xvfb), разрешение Xvfb определяет реальный доступный размер. Несовпадение `--window-size` с разрешением Xvfb может приводить к некорректному отображению.

### Потенциальные риски

- Принудительная установка `--force-device-scale-factor=1` в kiosk-режиме без env-переменной изменит поведение по умолчанию — может сломать HiDPI-конфигурации
- Вызов `page.setViewport()` через CDP изменит поведение `navigateToUrl` — нужна осторожность с тестами
- `max-width: 600px` в `obs-scenes.ejs` — намеренная часть UI; её изменение затронет desktop-отображение
- Если проблема воспроизводится только на конкретных URL (не на idle), причина может быть в CSS страницы назначения, а не в Chrome-конфиге
