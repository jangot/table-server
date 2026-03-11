# План реализации: Размер и позиция окна Chrome из переменных окружения

Добавить поддержку переменных окружения для задания размера окна Chrome (`--window-size=WIDTH,HEIGHT`) и позиции окна (`--window-position=X,Y`). Конфигурация читается в `ChromeConfig`, валидируется через `class-validator`, аргументы добавляются в `buildChromeArgs`. При отсутствии переменных поведение без изменений.

**Решения по открытым вопросам:**
- **Размер:** две переменные `CHROME_WINDOW_WIDTH` и `CHROME_WINDOW_HEIGHT` (целые 1–7680). Если задана только одна — размер не применяется.
- **Позиция:** две переменные `CHROME_WINDOW_POSITION_X` и `CHROME_WINDOW_POSITION_Y` (целые, допустимы отрицательные, разумные пределы, например ±16384). Если задана только одна — позиция не применяется.
- **Режимы окна:** аргументы `--window-size` и `--window-position` добавляются всегда при заданных переменных (в kiosk/fullscreen Chrome может их игнорировать; поведение документировать).

---

## 1. Поля размера и позиции в ChromeConfig

**Файл (изменить):** `src/modules/config/types.ts`

В класс `ChromeConfig` после `userDataDir` добавить опциональные поля:

- `windowWidth?: number` — ширина окна (1–7680).
- `windowHeight?: number` — высота окна (1–7680).
- `windowPositionX?: number` — координата X (допустимый диапазон задать, например от -16384 до 16384).
- `windowPositionY?: number` — координата Y (тот же диапазон).

Использовать декораторы: `@IsOptional()`, `@IsNumber()`, `@Min(...)`, `@Max(...)`. Для позиции — два декоратора `@Min`/`@Max` на одно поле не получится; использовать один общий диапазон (например `@Min(-16384)` и `@Max(16384)`).

```typescript
@IsOptional()
@IsNumber()
@Min(1)
@Max(7680)
windowWidth?: number;

@IsOptional()
@IsNumber()
@Min(1)
@Max(7680)
windowHeight?: number;

@IsOptional()
@IsNumber()
@Min(-16384)
@Max(16384)
windowPositionX?: number;

@IsOptional()
@IsNumber()
@Min(-16384)
@Max(16384)
windowPositionY?: number;
```

---

## 2. Чтение переменных окружения в validate.ts

**Файл (изменить):** `src/modules/config/validate.ts`

В объект, передаваемый в `plainToInstance(ChromeConfig, { ... })`, добавить:

- `windowWidth: parseOptionalInt(getEnv('CHROME_WINDOW_WIDTH'))`
- `windowHeight: parseOptionalInt(getEnv('CHROME_WINDOW_HEIGHT'))`
- `windowPositionX: parseOptionalInt(getEnv('CHROME_WINDOW_POSITION_X'))`
- `windowPositionY: parseOptionalInt(getEnv('CHROME_WINDOW_POSITION_Y'))`

Функция `parseOptionalInt` уже обрабатывает `undefined` и нечисловые значения. Дополнительных парсеров не требуется.

```typescript
chrome: plainToInstance(ChromeConfig, {
  path: getEnv('CHROME_PATH')?.trim(),
  devToolsPort: parseOptionalInt(getEnv('DEVTOOLS_PORT')),
  readyTimeout: parseOptionalInt(getEnv('CHROME_READY_TIMEOUT')),
  windowMode: getEnv('CHROME_WINDOW_MODE')?.toLowerCase().trim() || 'default',
  userDataDir: getEnv('CHROME_USER_DATA_DIR')?.trim() || undefined,
  windowWidth: parseOptionalInt(getEnv('CHROME_WINDOW_WIDTH')),
  windowHeight: parseOptionalInt(getEnv('CHROME_WINDOW_HEIGHT')),
  windowPositionX: parseOptionalInt(getEnv('CHROME_WINDOW_POSITION_X')),
  windowPositionY: parseOptionalInt(getEnv('CHROME_WINDOW_POSITION_Y')),
}),
```

---

## 3. Добавление --window-size и --window-position в buildChromeArgs

**Файл (изменить):** `src/modules/chrome/args.ts`

После блока с `windowMode` (и перед `return args`):

- Если заданы оба `config.chrome.windowWidth` и `config.chrome.windowHeight` — добавить в начало аргументов (например после userDataDir/mode) один аргумент: `--window-size=${width},${height}`.
- Если заданы оба `config.chrome.windowPositionX` и `config.chrome.windowPositionY` — добавить аргумент `--window-position=${x},${y}`.

Порядок: логично добавлять после режима окна (kiosk/app/fullscreen), чтобы размер/позиция шли рядом. Использовать `args.unshift(...)` для согласованности с остальным кодом, либо вставлять после префиксов: например, найти индекс первого «не-префиксного» аргумента и вставлять перед ним. Проще всего — после блока `if (userDataDir)` и блока `mode` выполнить два `if` и добавлять через `args.unshift('--window-size=...')` и `args.unshift('--window-position=...')` (порядок в итоговом массиве будет обратным порядку unshift: сначала выполнить unshift для position, затем для size, чтобы size шёл перед position в argv).

Пример:

```typescript
const { windowWidth, windowHeight, windowPositionX, windowPositionY } = config.chrome;
if (windowPositionX !== undefined && windowPositionY !== undefined) {
  args.unshift(`--window-position=${windowPositionX},${windowPositionY}`);
}
if (windowWidth !== undefined && windowHeight !== undefined) {
  args.unshift(`--window-size=${windowWidth},${windowHeight}`);
}
```

Разместить этот блок сразу после блока с `mode` (после `} else if (mode === 'fullscreen') { ... }`), перед `return args`.

---

## 4. Документация config.md

**Файл (изменить):** `docs/architecture/config.md`

- В таблице «Переменные окружения» в строке `chrome` дописать: `CHROME_WINDOW_WIDTH`, `CHROME_WINDOW_HEIGHT`, `CHROME_WINDOW_POSITION_X`, `CHROME_WINDOW_POSITION_Y`.
- В секции **ChromeConfig** добавить описание полей:
  - `windowWidth` (number, 1–7680, опциональный) — ширина окна в пикселях; применяется только вместе с `windowHeight`.
  - `windowHeight` (number, 1–7680, опциональный) — высота окна в пикселях; применяется только вместе с `windowWidth`.
  - `windowPositionX` (number, опциональный) — координата X левого верхнего угла окна (допустимы отрицательные значения для мультимониторных конфигураций).
  - `windowPositionY` (number, опциональный) — координата Y; позиция применяется только когда заданы обе координаты.
  - Кратко указать, что в режимах kiosk/fullscreen браузер может игнорировать размер и позицию.

---

## 5. Тесты buildChromeArgs (chrome.test.ts)

**Файл (изменить):** `test/chrome.test.ts`

Расширить фабрику `baseConfig` (или вызывать с переданным конфигом), чтобы можно было передавать `windowWidth`, `windowHeight`, `windowPositionX`, `windowPositionY`.

Сценарии:

- **Размер задан (оба значения):** конфиг с `windowWidth: 1280`, `windowHeight: 720` — в `args` есть элемент `'--window-size=1280,720'`.
- **Размер не задан:** без этих полей — в `args` нет аргумента, начинающегося с `--window-size=`.
- **Задана только ширина:** только `windowWidth: 1280` — аргумента `--window-size` нет.
- **Позиция задана (обе координаты):** конфиг с `windowPositionX: 100`, `windowPositionY: 200` — есть `'--window-position=100,200'`.
- **Позиция не задана:** без полей — нет аргумента `--window-position=`.
- **Задана только одна координата:** только `windowPositionX: 50` — аргумента `--window-position` нет.
- **Размер и позиция вместе:** оба набора заданы — в `args` присутствуют оба аргумента.
- **Совместимость с userDataDir и windowMode:** при заданных размере/позиции и, например, `userDataDir` или `windowMode: 'default'` — все ожидаемые аргументы присутствуют.

Типы: в `baseConfig` добавить в объект переопределений опциональные поля `windowWidth?`, `windowHeight?`, `windowPositionX?`, `windowPositionY?` и прокидывать их в `chrome` при создании `AppConfig`.

---

## 6. Тесты конфигурации (config.test.ts)

**Файл (изменить):** `test/config.test.ts`

- В `after` добавить в список `unsetEnv` ключи: `CHROME_WINDOW_WIDTH`, `CHROME_WINDOW_HEIGHT`, `CHROME_WINDOW_POSITION_X`, `CHROME_WINDOW_POSITION_Y`.
- **Happy path:** установить все четыре переменные, вызвать `validateEnv()` (или `getConfig()` после `resetConfigForTesting`), проверить что `config.chrome.windowWidth`, `windowHeight`, `windowPositionX`, `windowPositionY` равны заданным числам.
- **Опциональность:** без этих переменных конфиг валидируется и поля равны `undefined`.
- **Граничные значения:** например `CHROME_WINDOW_WIDTH=1`, `CHROME_WINDOW_HEIGHT=7680` — конфиг валиден; при `CHROME_WINDOW_WIDTH=0` или `7690` — `validateEnv()` бросает (ошибка валидации).
- **Позиция отрицательная:** `CHROME_WINDOW_POSITION_X=-100`, `CHROME_WINDOW_POSITION_Y=50` — конфиг валиден, значения в config соответствуют.

---

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `src/modules/chrome/args.ts` |
| Изменить | `docs/architecture/config.md` |
| Изменить | `test/chrome.test.ts` |
| Изменить | `test/config.test.ts` |

---

## Ссылки

- [analyze.md](./analyze.md) текущей задачи
- [description.md](./description.md) — исходное описание и контекст
