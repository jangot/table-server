# План реализации: Исправить запуск Chrome — размер контента и режим киоска

Задача решает две проблемы: неверный масштаб контента в браузере (через добавление `--force-device-scale-factor`) и неполную активацию kiosk-режима (через добавление вспомогательных флагов `--noerrdialogs` и `--disable-infobars`). Изменения затрагивают только слой конфигурации и построения аргументов Chrome; CDP, watchdog, OBS и Telegram не затрагиваются.

---

## 1. Добавить поле `deviceScaleFactor` в `ChromeConfig`

**Файл (изменить):** `src/modules/config/types.ts`

Добавить необязательное числовое поле `deviceScaleFactor` в класс `ChromeConfig` после `windowPositionY`. Значение будет передаваться в `--force-device-scale-factor`. Типичные значения: `1` (стандартный экран), `2` (HiDPI).

```typescript
@IsOptional()
@IsNumber()
@Min(0.1)
@Max(10)
deviceScaleFactor?: number;
```

---

## 2. Добавить парсинг `CHROME_DEVICE_SCALE_FACTOR` в `validate.ts`

**Файл (изменить):** `src/modules/config/validate.ts`

В объекте `chrome` внутри функции `validateEnv()` добавить поле `deviceScaleFactor`:

```typescript
chrome: plainToInstance(ChromeConfig, {
  // ... существующие поля ...
  deviceScaleFactor: parseOptionalFloat(getEnv('CHROME_DEVICE_SCALE_FACTOR')),
}),
```

Вспомогательная функция `parseOptionalFloat` (добавить рядом с `parseOptionalInt`):

```typescript
function parseOptionalFloat(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = parseFloat(value.trim());
  return Number.isNaN(n) ? undefined : n;
}
```

---

## 3. Обновить `buildChromeArgs` — добавить новые флаги

**Файл (изменить):** `src/modules/chrome/args.ts`

### 3a. Флаг `--force-device-scale-factor`

Добавить в конец блока формирования `args` (после блока `windowWidth/Height`), перед `return args`:

```typescript
if (config.chrome.deviceScaleFactor !== undefined) {
  args.unshift(`--force-device-scale-factor=${config.chrome.deviceScaleFactor}`);
}
```

### 3b. Вспомогательные kiosk-флаги

В блоке `if (useKiosk)` добавить `--noerrdialogs` и `--disable-infobars`:

```typescript
if (useKiosk) {
  args.unshift('--kiosk');
  args.unshift('--noerrdialogs');
  args.unshift('--disable-infobars');
}
```

Итоговый вид функции (полный блок флагов):

```typescript
export function buildChromeArgs(
  config: AppConfig,
  devToolsPort: number,
  initialUrl: string
): string[] {
  const port = String(devToolsPort);
  const userDataDir = config.chrome.userDataDir;
  const args = [
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    initialUrl,
  ];
  if (userDataDir) {
    args.unshift(`--user-data-dir=${userDataDir}`);
  }
  const mode = config.chrome.windowMode ?? 'default';
  const useKiosk = config.chrome.kiosk === true || mode === 'kiosk';
  if (useKiosk) {
    args.unshift('--kiosk');
    args.unshift('--noerrdialogs');
    args.unshift('--disable-infobars');
  } else if (mode === 'app') {
    args.pop();
    args.unshift(`--app=${initialUrl}`);
  } else if (mode === 'fullscreen') {
    args.unshift('--start-fullscreen');
  }
  const { windowWidth, windowHeight, windowPositionX, windowPositionY } = config.chrome;
  if (windowPositionX !== undefined && windowPositionY !== undefined) {
    args.unshift(`--window-position=${windowPositionX},${windowPositionY}`);
  }
  if (windowWidth !== undefined && windowHeight !== undefined) {
    args.unshift(`--window-size=${windowWidth},${windowHeight}`);
  }
  if (config.chrome.deviceScaleFactor !== undefined) {
    args.unshift(`--force-device-scale-factor=${config.chrome.deviceScaleFactor}`);
  }
  return args;
}
```

---

## 4. Обновить `.env.example`

**Файл (изменить):** `.env.example`

Добавить новую переменную в раздел `# Optional`:

```dotenv
# CHROME_DEVICE_SCALE_FACTOR=1
```

---

## 5. Тесты

**Файл (изменить):** `test/chrome.test.ts`

Обновить `baseConfig` — добавить `deviceScaleFactor` в тип chromeOverrides:

```typescript
function baseConfig(
  chromeOverrides: {
    windowMode?: ChromeWindowMode;
    userDataDir?: string;
    windowWidth?: number;
    windowHeight?: number;
    windowPositionX?: number;
    windowPositionY?: number;
    deviceScaleFactor?: number;   // <-- добавить
  } = {}
): AppConfig { ... }
```

### Новые тест-кейсы (добавить в `describe('buildChromeArgs', ...)`)

**Happy path — deviceScaleFactor:**
```typescript
it('deviceScaleFactor set: adds --force-device-scale-factor arg', () => {
  const config = baseConfig({ deviceScaleFactor: 1 });
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(args.includes('--force-device-scale-factor=1'));
});

it('deviceScaleFactor 2: adds --force-device-scale-factor=2', () => {
  const config = baseConfig({ deviceScaleFactor: 2 });
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(args.includes('--force-device-scale-factor=2'));
});

it('deviceScaleFactor undefined: no --force-device-scale-factor arg', () => {
  const config = baseConfig();
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(!args.some((a) => a.startsWith('--force-device-scale-factor=')));
});
```

**Happy path — kiosk helper flags:**
```typescript
it('kiosk mode: includes --noerrdialogs and --disable-infobars', () => {
  const config = baseConfig({ windowMode: 'kiosk' });
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(args.includes('--noerrdialogs'));
  assert.ok(args.includes('--disable-infobars'));
});
```

**Ошибки/граничные случаи:**
```typescript
it('fullscreen mode: does NOT include --noerrdialogs', () => {
  const config = baseConfig({ windowMode: 'fullscreen' });
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(!args.includes('--noerrdialogs'));
  assert.ok(!args.includes('--disable-infobars'));
});

it('default mode: does NOT include --noerrdialogs', () => {
  const config = baseConfig({ windowMode: 'default' });
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(!args.includes('--noerrdialogs'));
});

it('kiosk + deviceScaleFactor: all three extra flags present', () => {
  const config = baseConfig({ windowMode: 'kiosk', deviceScaleFactor: 1 });
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(args.includes('--kiosk'));
  assert.ok(args.includes('--noerrdialogs'));
  assert.ok(args.includes('--disable-infobars'));
  assert.ok(args.includes('--force-device-scale-factor=1'));
});
```

---

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `src/modules/chrome/args.ts` |
| Изменить | `.env.example` |
| Изменить | `test/chrome.test.ts` |

---

## Ссылки
- [analyze.md](./analyze.md)
