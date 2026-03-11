# Анализ: Размер и позиция окна Chrome из переменных окружения

## Общее описание функциональности

Нужно дать возможность задавать при запуске Google Chrome размер окна (ширина × высота) и позицию окна (X, Y) через переменные окружения. Если переменные заданы — в аргументы запуска добавляются `--window-size=WIDTH,HEIGHT` и при необходимости `--window-position=X,Y`. Если не заданы — поведение без изменений.

Задача решает сценарии, когда приложение должно запускать Chrome в окне фиксированного размера и/или в определённой позиции на экране (в т.ч. при мультимониторных конфигурациях), без изменения кода — только через конфигурацию/окружение.

## Связанные модули и сущности

| Модуль/файл | Назначение | Что затрагивает задача |
|-------------|------------|------------------------|
| `src/modules/config/` | Типы конфигурации, чтение и валидация из env | Добавление полей размера и позиции в `ChromeConfig`, маппинг новых переменных окружения в `validate.ts` |
| `src/modules/chrome/args.ts` | Сборка CLI-аргументов Chrome | Добавление `--window-size` и `--window-position` при наличии значений в config |
| `src/modules/chrome/launch.ts` | Запуск процесса Chrome | Не меняется — получает уже собранный массив `args` |
| `src/modules/chrome/index.ts` | Модуль Chrome, вызов `buildChromeArgs` | Не меняется — передаёт config в `buildChromeArgs` |
| `docs/architecture/config.md` | Документация конфигурации | Таблица переменных окружения, описание полей ChromeConfig |
| `test/chrome.test.ts` | Тесты сборки аргументов Chrome | Новые кейсы для window-size и window-position |
| `test/config.test.ts` | Тесты валидации конфигурации | Опционально: кейсы для новых переменных и граничных значений |

## Текущие интерфейсы и API

- **`ChromeConfig`** (src/modules/config/types.ts) — класс с полями: `path`, `devToolsPort`, `readyTimeout`, `windowMode`, `userDataDir`. Валидация через `class-validator` (`@IsOptional`, `@IsNumber`, `@Min`, `@Max`, `@IsIn`, `@IsString`).
- **`buildChromeArgs(config: AppConfig, devToolsPort: number, initialUrl: string): string[]`** (src/modules/chrome/args.ts) — формирует массив аргументов; уже учитывает `userDataDir`, `windowMode` (kiosk, app, fullscreen, default). Порядок: при наличии `userDataDir` — он первым, затем режим окна (kiosk/app/fullscreen), затем `--remote-debugging-port`, остальное, в конце `initialUrl` (или внутри `--app=` при mode app).
- **`validateEnv(): AppConfig`** (src/modules/config/validate.ts) — читает env через `getEnv()`, числа через `parseOptionalInt()`, собирает объект `chrome` и передаёт в `plainToInstance(ChromeConfig, …)`, затем `validateSync(instance)`.
- Переменные Chrome уже маппятся так: `CHROME_PATH`, `DEVTOOLS_PORT`, `CHROME_READY_TIMEOUT`, `CHROME_WINDOW_MODE`, `CHROME_USER_DATA_DIR`.

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить/создать |
|------|----------------|----------------------------|
| `src/modules/config/types.ts` | `ChromeConfig` | Добавить опциональные поля для размера окна (например `windowWidth`, `windowHeight`) и позиции (`windowPositionX`, `windowPositionY`) с декораторами валидации (целые числа, допустимые диапазоны). |
| `src/modules/config/validate.ts` | Сборка `chrome` из env | Чтение новых переменных (формат — на этапе плана: две переменные на размер/позицию или одна составная), парсинг и передача в plain-объект для ChromeConfig. При необходимости добавить парсер для формата вида `WIDTHxHEIGHT` или `X,Y`. |
| `src/modules/chrome/args.ts` | `buildChromeArgs` | При наличии в config заданного размера — добавить `--window-size=WIDTH,HEIGHT`. При наличии позиции — добавить `--window-position=X,Y`. Уточнить в плане: добавлять ли эти аргументы при полноэкранных режимах (kiosk/fullscreen) или только для default/app. |
| `docs/architecture/config.md` | Таблица env и описание ChromeConfig | Добавить новые переменные в таблицу; в секции ChromeConfig описать новые поля и допустимые значения. |
| `test/chrome.test.ts` | Тесты `buildChromeArgs` | Тесты: размер задан — есть `--window-size=...`; позиция задана — есть `--window-position=...`; не заданы — соответствующих аргументов нет. При необходимости — кейсы для режимов kiosk/fullscreen. |
| `test/config.test.ts` | Тесты `validateEnv` | Опционально: проверка парсинга новых переменных, граничные/невалидные значения (если валидация их отвергает). В `after` добавить сброс новых env-ключей в `unsetEnv`. |

## Зависимости и ограничения

- **Chrome CLI:** аргументы `--window-size=WIDTH,HEIGHT` и `--window-position=X,Y` — стандартные для Chromium/Chrome; ожидается поддержка в используемой версии.
- **Валидация размера:** по ТЗ — целые положительные числа в разумных пределах (например 1–7680). Если задана только одна из сторон — поведение уточнить в плане (не применять размер или использовать значение по умолчанию для второй стороны).
- **Валидация позиции:** X и Y — целые числа (допустимы отрицательные для второго монитора), разумные пределы. Если задана только одна координата — не применять позицию или явно описать в плане.
- **Режимы окна:** при kiosk/fullscreen размер и позиция могут игнорироваться браузером. В плане нужно зафиксировать: всегда добавлять аргументы при заданных переменных или только для режимов default/app.
- **Обратная совместимость:** при отсутствии новых переменных поведение должно оставаться как сейчас (без `--window-size` и `--window-position`).
- **Открытые вопросы (из description.md):** формат переменных для размера (две `CHROME_WINDOW_WIDTH`/`CHROME_WINDOW_HEIGHT` или одна `CHROME_WINDOW_SIZE=1280x720`) и для позиции (две `CHROME_WINDOW_POSITION_X`/`Y` или одна `CHROME_WINDOW_POSITION=100,200`) — решить на этапе плана.
