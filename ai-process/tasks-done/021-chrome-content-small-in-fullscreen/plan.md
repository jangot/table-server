# План реализации: Контент в Chrome отображается маленьким в fullscreen

Задача устраняет три независимые причины, из-за которых контент в kiosk/fullscreen-режиме занимает лишь часть экрана: отсутствие `--force-device-scale-factor` по умолчанию, пустой стиль `idle.ejs` и отсутствие viewport-перекрытия в CDP-навигации.

---

## 1. `args.ts` — добавить дефолтный `--force-device-scale-factor=1` для kiosk/fullscreen

**Файл (изменить):** `src/modules/chrome/args.ts`

**Проблема:** Флаг `--force-device-scale-factor` добавляется только при явной установке `CHROME_DEVICE_SCALE_FACTOR`. На HiDPI-экране (DPR=2) Chrome использует CSS-viewport 960×540 при физическом разрешении 1920×1080 — контент рисуется в левом верхнем углу.

**Решение:** Когда активен kiosk или fullscreen и пользователь не задал `deviceScaleFactor` явно — автоматически подставить `--force-device-scale-factor=1`.

```typescript
// Было:
if (config.chrome.deviceScaleFactor !== undefined) {
  args.unshift(`--force-device-scale-factor=${config.chrome.deviceScaleFactor}`);
}

// Стало:
const scaleFactor = config.chrome.deviceScaleFactor ?? (useKiosk || mode === 'fullscreen' ? 1 : undefined);
if (scaleFactor !== undefined) {
  args.unshift(`--force-device-scale-factor=${scaleFactor}`);
}
```

**Порядок важен:** вычисление `scaleFactor` должно идти после вычисления `useKiosk` и `mode`, которые уже есть в коде.

---

## 2. `idle.ejs` — CSS для полного заполнения viewport

**Файл (изменить):** `views/idle.ejs`

**Проблема:** `idle.ejs` — начальная страница Chrome при запуске. Сейчас у неё нет CSS: `html`, `body` не занимают 100% высоты/ширины, что при некоторых конфигурациях выглядит как пустой белый холст.

**Решение:** Добавить минимальный стиль, чтобы страница занимала весь viewport.

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Waiting</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #000;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: sans-serif;
    }
  </style>
</head>
```

---

## 3. `cdp.ts` — опциональный viewport override через puppeteer

**Файл (изменить):** `src/modules/chrome/cdp.ts`

**Проблема:** `navigateToUrl` не вызывает `page.setViewport()` — viewport определяется Chrome при старте и может не совпадать с реальным размером окна.

**Решение:** Добавить опциональный параметр `viewport` в `options`. Если он передан — вызвать `page.setViewport()` перед `page.goto()`.

```typescript
export async function navigateToUrl(
  port: number,
  url: string,
  statePath: string,
  logger: Logger,
  options?: {
    timeoutMs?: number;
    viewport?: { width: number; height: number; deviceScaleFactor?: number };
  }
): Promise<void> {
  const browser = await connect({ browserURL: `http://127.0.0.1:${port}` });
  try {
    const pages = await browser.pages();
    const page = pages[0] ?? (await browser.newPage());
    if (options?.viewport) {
      await page.setViewport({
        width: options.viewport.width,
        height: options.viewport.height,
        deviceScaleFactor: options.viewport.deviceScaleFactor ?? 1,
      });
    }
    const timeout = options?.timeoutMs ?? 30000;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await writeLastUrl(statePath, url);
    logger.info('Navigated to URL', { url });
  } finally {
    await browser.disconnect();
  }
}
```

> **Примечание:** Этот шаг необязателен для базового фикса — важнее шаги 1 и 2. Но он полезен для надёжного управления viewport при навигации.

---

## 4. `.env.example` — уточнить рекомендацию для kiosk

**Файл (изменить):** `.env.example`

**Цель:** Дать пользователю явный сигнал, что в kiosk-режиме `CHROME_DEVICE_SCALE_FACTOR=1` теперь применяется автоматически, но можно переопределить.

```bash
# CHROME_DEVICE_SCALE_FACTOR=1  # По умолчанию 1 в kiosk/fullscreen; задайте явно для HiDPI (например, 2)
```

---

## 5. Тесты

**Файл (изменить):** `test/chrome.test.ts`

Шаг 1 меняет логику `buildChromeArgs` — нужно добавить/обновить тесты.

**Новые сценарии:**

```typescript
// Happy path: kiosk без явного deviceScaleFactor — должен получить --force-device-scale-factor=1
it('kiosk mode without deviceScaleFactor: auto-adds --force-device-scale-factor=1', () => {
  const config = baseConfig({ windowMode: 'kiosk' });
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(args.includes('--force-device-scale-factor=1'));
});

// Happy path: fullscreen без явного deviceScaleFactor — должен получить --force-device-scale-factor=1
it('fullscreen mode without deviceScaleFactor: auto-adds --force-device-scale-factor=1', () => {
  const config = baseConfig({ windowMode: 'fullscreen' });
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(args.includes('--force-device-scale-factor=1'));
});

// Happy path: явный deviceScaleFactor=2 в kiosk — переопределяет дефолт
it('kiosk mode with explicit deviceScaleFactor=2: uses 2, not 1', () => {
  const config = baseConfig({ windowMode: 'kiosk', deviceScaleFactor: 2 });
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(args.includes('--force-device-scale-factor=2'));
  assert.ok(!args.includes('--force-device-scale-factor=1'));
});

// Без kiosk/fullscreen: default mode без deviceScaleFactor — флаг НЕ добавляется
it('default mode without deviceScaleFactor: no --force-device-scale-factor', () => {
  const config = baseConfig({ windowMode: 'default' });
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(!args.some((a) => a.startsWith('--force-device-scale-factor=')));
});

// kiosk flag=true без windowMode: тоже получает дефолт scale=1
it('kiosk=true flag without windowMode: auto-adds --force-device-scale-factor=1', () => {
  const config = baseConfig({ kiosk: true });
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(args.includes('--force-device-scale-factor=1'));
});
```

**Изменить существующий тест:**

Тест `'deviceScaleFactor undefined: no --force-device-scale-factor arg'` (строка 179) теперь проверяет только `default` режим:

```typescript
it('deviceScaleFactor undefined in default mode: no --force-device-scale-factor arg', () => {
  const config = baseConfig({ windowMode: 'default' });
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(!args.some((a) => a.startsWith('--force-device-scale-factor=')));
});
```

---

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/chrome/args.ts` |
| Изменить | `views/idle.ejs` |
| Изменить | `src/modules/chrome/cdp.ts` |
| Изменить | `.env.example` |
| Изменить | `test/chrome.test.ts` |

---

## Ссылки

- [analyze.md](./analyze.md)
