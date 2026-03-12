# План реализации: Скрипты по доменам/URL при открытии ссылок в Chrome

При навигации Chrome на URL автоматически выполняется JS-скрипт в контексте страницы, если домен зарегистрирован в конфиге. Реестр скриптов — папка с JS-файлами; маппинг домен→файл хранится в JSON-файле. Скрипт и мап читаются при каждой навигации (без кеша), чтобы изменения применялись без рестарта сервера.

## 1. Создать `src/modules/chrome/scriptRegistry.ts`

**Файл (создать):** `src/modules/chrome/scriptRegistry.ts`

Содержит: тип `ScriptMap`, функцию `loadScriptMap`, функцию `resolveScript`.

**Решение по безопасности:** имя файла из мап-файла валидируется через `path.basename` — если оно содержит `..` или `/`, файл игнорируется с warn-логом.

**Решение по стратегии чтения:** мап и скрипт читаются синхронно при каждой навигации, чтобы изменения применялись без рестарта.

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Logger } from '../logger';

/** Содержимое domains.json: { "hostname": "script.js" } */
export type ScriptMap = Record<string, string>;

/**
 * Загружает JSON мап-файл домен→файл.
 * Возвращает null при отсутствии пути, ошибке чтения или неверном формате.
 */
export function loadScriptMap(mapPath: string | undefined, logger: Logger): ScriptMap | null {
  if (!mapPath || mapPath.trim() === '') return null;
  try {
    const raw = fs.readFileSync(mapPath, 'utf-8');
    const data = JSON.parse(raw);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      logger.warn('Chrome script map: invalid format (expected object)', { mapPath });
      return null;
    }
    // Фильтруем только string-значения
    const result: ScriptMap = {};
    for (const [key, val] of Object.entries(data)) {
      if (typeof val === 'string') result[key] = val;
    }
    return result;
  } catch {
    logger.warn('Chrome script map: failed to read or parse', { mapPath });
    return null;
  }
}

/**
 * По URL ищет домен в mapе, читает соответствующий JS-файл из scriptsDir.
 * Возвращает содержимое скрипта или null (без ошибки).
 */
export function resolveScript(
  url: string,
  scriptsDir: string,
  scriptMap: ScriptMap,
  logger: Logger
): string | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }

  const fileName = scriptMap[hostname];
  if (!fileName) return null;

  // Безопасность: только basename
  const safe = path.basename(fileName);
  if (safe !== fileName || safe === '' || safe.includes('..')) {
    logger.warn('Chrome script map: unsafe filename ignored', { fileName });
    return null;
  }

  const scriptPath = path.join(scriptsDir, safe);
  try {
    return fs.readFileSync(scriptPath, 'utf-8');
  } catch {
    logger.warn('Chrome script: failed to read script file', { scriptPath });
    return null;
  }
}
```

## 2. Изменить `src/modules/config/types.ts`

**Файл (изменить):** `src/modules/config/types.ts`

Добавить два поля в класс `AppConfig` после `scenesConfigPath`:

```typescript
@IsOptional()
@IsString()
chromeScriptsDir?: string;

@IsOptional()
@IsString()
chromeScriptsMap?: string;
```

## 3. Изменить `src/modules/config/validate.ts`

**Файл (изменить):** `src/modules/config/validate.ts`

В объекте `plain` добавить два поля после `scenesConfigPath`:

```typescript
chromeScriptsDir: getEnv('CHROME_SCRIPTS_DIR')?.trim() || undefined,
chromeScriptsMap: getEnv('CHROME_SCRIPTS_MAP')?.trim() || undefined,
```

## 4. Изменить `src/modules/chrome/cdp.ts`

**Файл (изменить):** `src/modules/chrome/cdp.ts`

Добавить `scriptRegistry` в параметр `options`. После успешного `page.goto` вызвать `resolveScript` и если результат есть — `page.evaluate`.

```typescript
import { connect } from 'puppeteer-core';
import type { Logger } from '../logger';
import { writeLastUrl } from './lastUrlState';
import type { ScriptMap } from './scriptRegistry';
import { resolveScript } from './scriptRegistry';

export async function navigateToUrl(
  port: number,
  url: string,
  statePath: string,
  logger: Logger,
  options?: {
    timeoutMs?: number;
    viewport?: { width: number; height: number; deviceScaleFactor?: number };
    scriptRegistry?: { scriptsDir: string; scriptMap: ScriptMap };
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

    // Выполнить скрипт для домена, если зарегистрирован
    if (options?.scriptRegistry) {
      const { scriptsDir, scriptMap } = options.scriptRegistry;
      const script = resolveScript(url, scriptsDir, scriptMap, logger);
      if (script) {
        await page.evaluate(script);
        logger.info('Chrome script executed for URL', { url });
      }
    }

    await writeLastUrl(statePath, url);
    logger.info('Navigated to URL', { url });
  } finally {
    await browser.disconnect();
  }
}
```

## 5. Изменить `src/modules/chrome/index.ts`

**Файл (изменить):** `src/modules/chrome/index.ts`

В функции `navigateToUrl` загружать мап и передавать `scriptRegistry` в cdp.

```typescript
import { loadScriptMap } from './scriptRegistry';

export async function navigateToUrl(
  url: string,
  deps: { config: AppConfig; logger: Logger }
): Promise<void> {
  if (getChromeProcess() == null) {
    throw new Error('Chrome is not running');
  }
  const port = deps.config.chrome.devToolsPort ?? 9222;
  const statePath = deps.config.lastUrlStatePath ?? './.last-url';
  const { windowWidth, windowHeight, deviceScaleFactor } = deps.config.chrome;
  const viewport =
    windowWidth !== undefined && windowHeight !== undefined
      ? { width: windowWidth, height: windowHeight, deviceScaleFactor: deviceScaleFactor ?? 1 }
      : undefined;

  // Загружаем мап при каждой навигации (чтобы изменения применялись без рестарта)
  const { chromeScriptsDir, chromeScriptsMap } = deps.config;
  let scriptRegistry: { scriptsDir: string; scriptMap: Record<string, string> } | undefined;
  if (chromeScriptsDir && chromeScriptsMap) {
    const scriptMap = loadScriptMap(chromeScriptsMap, deps.logger);
    if (scriptMap) {
      scriptRegistry = { scriptsDir: chromeScriptsDir, scriptMap };
    }
  }

  await cdpNavigateToUrl(port, url, statePath, deps.logger, { viewport, scriptRegistry });
}
```

## 6. Добавить документацию в `docs/env.md`

**Файл (изменить):** `docs/env.md`

Добавить две строки в таблицу Optional:

```markdown
| `CHROME_SCRIPTS_DIR` | Path to directory with JS script files for domain automation | `/etc/table-server/scripts` |
| `CHROME_SCRIPTS_MAP` | Path to JSON file mapping hostnames to script filenames (`{ "example.com": "login.js" }`) | `/etc/table-server/scripts/domains.json` |
```

Обе переменные должны быть заданы одновременно, чтобы функция работала. Если одна из них не задана — скрипты не выполняются.

## 7. Тесты

**Файл (создать):** `test/chrome-script-registry.test.ts`

Сценарии:

- **Happy path — loadScriptMap:** читает корректный JSON-файл, возвращает объект `ScriptMap`
- **Happy path — resolveScript:** по домену находит файл, читает и возвращает содержимое
- **loadScriptMap: файл не существует** → возвращает null, warn в logger
- **loadScriptMap: невалидный JSON** → возвращает null, warn в logger
- **loadScriptMap: JSON не объект (массив)** → возвращает null, warn в logger
- **loadScriptMap: пустой/undefined путь** → возвращает null без warn
- **resolveScript: домен не в мапе** → возвращает null
- **resolveScript: некорректный URL** → возвращает null
- **resolveScript: небезопасное имя файла (`../evil.js`)** → возвращает null, warn в logger
- **resolveScript: файл скрипта не существует** → возвращает null, warn в logger

```typescript
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScriptMap, resolveScript } from '../src/modules/chrome/scriptRegistry';

// Mock logger
const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };

describe('loadScriptMap', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'script-registry-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads valid map file', () => {
    const mapPath = path.join(tmpDir, 'domains.json');
    fs.writeFileSync(mapPath, JSON.stringify({ 'example.com': 'login.js' }));
    expect(loadScriptMap(mapPath, mockLogger)).toEqual({ 'example.com': 'login.js' });
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('returns null for undefined path', () => {
    expect(loadScriptMap(undefined, mockLogger)).toBeNull();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('returns null and warns for missing file', () => {
    expect(loadScriptMap('/nonexistent/map.json', mockLogger)).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('returns null and warns for invalid JSON', () => {
    const mapPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(mapPath, 'not json');
    expect(loadScriptMap(mapPath, mockLogger)).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('returns null and warns when JSON is an array', () => {
    const mapPath = path.join(tmpDir, 'arr.json');
    fs.writeFileSync(mapPath, '[]');
    expect(loadScriptMap(mapPath, mockLogger)).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});

describe('resolveScript', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scripts-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns script content for matching domain', () => {
    const scriptPath = path.join(tmpDir, 'login.js');
    fs.writeFileSync(scriptPath, 'console.log("hello")');
    const result = resolveScript(
      'https://example.com/page',
      tmpDir,
      { 'example.com': 'login.js' },
      mockLogger
    );
    expect(result).toBe('console.log("hello")');
  });

  it('returns null when domain not in map', () => {
    expect(resolveScript('https://other.com/', tmpDir, {}, mockLogger)).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(resolveScript('not-a-url', tmpDir, { '': 'x.js' }, mockLogger)).toBeNull();
  });

  it('returns null and warns for unsafe filename with path traversal', () => {
    const result = resolveScript(
      'https://evil.com/',
      tmpDir,
      { 'evil.com': '../secret.js' },
      mockLogger
    );
    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('returns null and warns when script file not found', () => {
    const result = resolveScript(
      'https://example.com/',
      tmpDir,
      { 'example.com': 'missing.js' },
      mockLogger
    );
    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
```

## Сводка файлов

| Действие | Файл |
|----------|------|
| Создать  | `src/modules/chrome/scriptRegistry.ts` |
| Изменить | `src/modules/chrome/cdp.ts` |
| Изменить | `src/modules/chrome/index.ts` |
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `docs/env.md` |
| Создать  | `test/chrome-script-registry.test.ts` |

## Ссылки
- [analyze.md](./analyze.md)
