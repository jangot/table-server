# План реализации: Повторно исправить запуск Chrome — kiosk и масштаб контента

Задача устраняет три корневые причины: 1) поле `kiosk: boolean` в `ChromeConfig` никогда не заполняется из env (`CHROME_KIOSK` не существует); 2) при запуске Chrome не логируются реальные аргументы — нельзя проверить что передаётся; 3) на Wayland `--kiosk` и `--force-device-scale-factor` могут молча игнорироваться без `--ozone-platform`.

---

## 1. Добавить маппинг `CHROME_KIOSK` в `validate.ts`

**Файл (изменить):** `src/modules/config/validate.ts`

Поле `kiosk?: boolean` уже есть в `ChromeConfig`, но `validate.ts` его не заполняет из env. Добавить парсинг `CHROME_KIOSK=true|1|false|0` в блок сборки `ChromeConfig`.

```typescript
// В validate.ts, внутри plainToInstance(ChromeConfig, { ... })
kiosk: (() => {
  const raw = getEnv('CHROME_KIOSK')?.toLowerCase().trim();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return undefined;
})(),
```

**Почему**: без этого `CHROME_KIOSK=true` в `.env` не даёт никакого эффекта — `config.chrome.kiosk` остаётся `undefined`, и `args.ts` не добавляет `--kiosk`.

---

## 2. Добавить поддержку `CHROME_OZONE_PLATFORM` (Wayland/X11)

**Файл (изменить):** `src/modules/config/types.ts`

Добавить опциональное поле `ozonePlatform` в `ChromeConfig`:

```typescript
// В class ChromeConfig
@IsOptional()
@IsString()
ozonePlatform?: string;
```

**Файл (изменить):** `src/modules/config/validate.ts`

Добавить маппинг:

```typescript
// В plainToInstance(ChromeConfig, { ... })
ozonePlatform: getEnv('CHROME_OZONE_PLATFORM')?.toLowerCase().trim() || undefined,
```

**Файл (изменить):** `src/modules/chrome/args.ts`

Добавить флаг `--ozone-platform` в конец `buildChromeArgs`:

```typescript
// После блока deviceScaleFactor
if (config.chrome.ozonePlatform) {
  args.unshift(`--ozone-platform=${config.chrome.ozonePlatform}`);
}
```

**Почему**: на Wayland без `--ozone-platform=wayland` Chrome может запускаться в XWayland и игнорировать `--kiosk`. На X11 можно явно задать `CHROME_OZONE_PLATFORM=x11`, чтобы форсировать X11-режим.

---

## 3. Логировать аргументы Chrome при запуске

**Файл (изменить):** `src/modules/chrome/launch.ts`

Добавить `logger.info` с аргументами перед `spawn`, чтобы операторы могли проверить реальные флаги через `journalctl` или pm2 logs:

```typescript
export async function launchChrome(
  chromePath: string,
  args: string[],
  port: number,
  timeoutMs: number,
  logger: Logger
): Promise<void> {
  logger.info('Launching Chrome', { chromePath, args });  // <-- добавить
  chromeProcess = spawn(chromePath, args, { stdio: 'ignore', shell: false });
  // ... остальной код без изменений
```

**Почему**: без этого единственный способ проверить реальные аргументы — `ps aux | grep chrome`. Лог позволяет быстро диагностировать несоответствие конфига и реального вызова.

---

## 4. Обновить `.env.example`

**Файл (изменить):** `.env.example`

Добавить/раскомментировать/уточнить переменные, относящиеся к kiosk и масштабу:

```dotenv
# Optional
# CHROME_WINDOW_MODE=default    # kiosk | app | fullscreen | default
# CHROME_KIOSK=false            # true/1 — включить kiosk независимо от windowMode
# CHROME_DEVICE_SCALE_FACTOR=1  # масштаб контента (0.1–10); обязателен для изменения DPI
# CHROME_OZONE_PLATFORM=        # x11 | wayland — явный выбор дисплейного сервера (Wayland-хосты)
```

**Почему**: `CHROME_KIOSK` новая переменная и её нет в примере. `CHROME_DEVICE_SCALE_FACTOR` закомментирован — пользователи не знают что его нужно явно задать.

---

## 5. Тесты

**Файл (изменить):** `test/chrome.test.ts`

### Новые тест-кейсы для `buildChromeArgs`:

**Сценарий 1** — `kiosk: true` через boolean-поле (не windowMode):
```typescript
it('kiosk flag true: --kiosk present even without windowMode=kiosk', () => {
  const config = baseConfig({ kiosk: true });
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(args.includes('--kiosk'));
  assert.ok(args.includes('--noerrdialogs'));
  assert.ok(args.includes('--disable-infobars'));
});
```

**Сценарий 2** — `kiosk: false` с `windowMode: 'default'` — kiosk не должен включаться:
```typescript
it('kiosk flag false: no --kiosk when windowMode is default', () => {
  const config = baseConfig({ kiosk: false, windowMode: 'default' });
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(!args.includes('--kiosk'));
});
```

**Сценарий 3** — `ozonePlatform: 'x11'` добавляет флаг:
```typescript
it('ozonePlatform x11: adds --ozone-platform=x11', () => {
  const config = baseConfig({ ozonePlatform: 'x11' } as any);
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(args.includes('--ozone-platform=x11'));
});
```

**Сценарий 4** — `ozonePlatform` не задан — флаг отсутствует:
```typescript
it('ozonePlatform undefined: no --ozone-platform arg', () => {
  const config = baseConfig();
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(!args.some((a) => a.startsWith('--ozone-platform=')));
});
```

**Сценарий 5** — `kiosk: true` + `deviceScaleFactor` + `ozonePlatform` — все флаги вместе:
```typescript
it('kiosk + scale + ozone: all flags present', () => {
  const config = baseConfig({ kiosk: true, deviceScaleFactor: 2, ozonePlatform: 'wayland' } as any);
  const args = buildChromeArgs(config, 9222, 'http://localhost:3000/');
  assert.ok(args.includes('--kiosk'));
  assert.ok(args.includes('--force-device-scale-factor=2'));
  assert.ok(args.includes('--ozone-platform=wayland'));
});
```

> Примечание: `baseConfig` принимает частичные поля через тип `chromeOverrides`. Для `ozonePlatform` нужно расширить тип параметра функции `baseConfig`, добавив `ozonePlatform?: string`.

---

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/chrome/args.ts` |
| Изменить | `src/modules/chrome/launch.ts` |
| Изменить | `.env.example` |
| Изменить | `test/chrome.test.ts` |

---

## Ссылки
- [analyze.md](./analyze.md)
- Код аргументов: `src/modules/chrome/args.ts`
- Конфиг: `src/modules/config/validate.ts`, `src/modules/config/types.ts`
- Тесты: `test/chrome.test.ts`
