# План реализации: Переключение URL через CDP

Реализовать переключение страницы в уже открытом окне Chrome через Chrome DevTools Protocol: подключение к DevTools по порту из конфигурации, выбор активного target (вкладка типа page), навигация командой `Page.navigate`. После успешной навигации сохранять URL в файл для восстановления после рестарта (этапы 5 и 7). В MVP валидация URL не требуется.

## 1. Зависимость для CDP

**Файл (изменить):** `package.json`

Добавить зависимость `puppeteer-core` для подключения к Chrome по порту и вызова CDP (например, `Page.navigate`). Не использовать полный `puppeteer`, чтобы не тянуть загрузку Chromium.

```json
"dependencies": {
  "dotenv": "^16.4.5",
  "ejs": "^3.1.10",
  "express": "^4.21.0",
  "puppeteer-core": "^23.0.0"
}
```

После добавления выполнить `npm install`.

## 2. Конфиг: путь к файлу состояния (последний URL)

**Файл (изменить):** `src/modules/config/types.ts`

Добавить опциональное поле для пути к файлу, в котором хранится последний успешный URL (для восстановления после рестарта сервиса/Chrome).

```typescript
export interface AppConfig {
  // ... существующие поля
  /** Optional path to file storing last navigated URL for recovery after restart. */
  lastUrlStatePath?: string;
}
```

**Файл (изменить):** `src/modules/config/validate.ts`

Добавить чтение опциональной переменной окружения (например, `LAST_URL_STATE_PATH`). Если не задана — не заполнять поле; в модуле Chrome использовать дефолтный путь (например, в текущей рабочей директории или рядом с данными приложения).

```typescript
// В validateEnv():
const lastUrlStatePath = getEnv('LAST_URL_STATE_PATH')?.trim();
return {
  // ...
  lastUrlStatePath: lastUrlStatePath || undefined,
};
```

## 3. Сохранение и чтение последнего URL

**Файл (создать):** `src/modules/chrome/lastUrlState.ts`

Реализовать две функции: запись URL в файл после успешной навигации и чтение при старте/по запросу. Использовать `fs.promises.writeFile` и `fs.promises.readFile` с кодировкой `utf-8`. Путь к файлу передавать параметром (из конфига или дефолт, например `./.last-url` или в директории данных). При ошибке чтения (файл не существует) возвращать `null`; при ошибке записи — логировать и не падать.

```typescript
import { readFile, writeFile } from 'node:fs/promises';

export async function readLastUrl(filePath: string): Promise<string | null> {
  try {
    const data = await readFile(filePath, 'utf-8');
    return data.trim() || null;
  } catch {
    return null;
  }
}

export async function writeLastUrl(filePath: string, url: string): Promise<void> {
  await writeFile(filePath, url, 'utf-8');
}
```

Экспорт этих функций для использования в CDP-модуле и при восстановлении (этапы 5/7).

## 4. Подключение к CDP и навигация

**Файл (создать):** `src/modules/chrome/cdp.ts`

Логика:
- Подключение к Chrome по порту через `puppeteer-core.connect({ browserURL: \`http://127.0.0.1:${port}\` })` (или эквивалент по порту).
- Получение списка страниц: у Puppeteer после `connect` можно получить `browser.pages()` или через целевой target. Выбрать первый target типа `page` (или единственную страницу).
- Вызов навигации на выбранной странице: `page.goto(url, { waitUntil: 'domcontentloaded', timeout })` или низкоуровнево через CDP `Page.navigate` — по возможностям выбранной библиотеки.
- При успешной навигации вызвать `writeLastUrl(statePath, url)`.
- Обработка ошибок: таймаут, разрыв соединения, отсутствие page-target — логировать, не блокировать основной цикл, пробрасывать ошибку вызывающему коду.
- Сигнатура: функция `navigateToUrl(port: number, url: string, statePath: string, logger: Logger): Promise<void>`. При необходимости передавать также `timeoutMs` (опционально из конфига).

```typescript
import type { Logger } from '../logger';
import { writeLastUrl } from './lastUrlState';
// puppeteer-core: connect, затем page.goto или CDP

export async function navigateToUrl(
  port: number,
  url: string,
  statePath: string,
  logger: Logger,
  options?: { timeoutMs?: number }
): Promise<void> {
  const browser = await connect({ browserURL: `http://127.0.0.1:${port}` });
  try {
    const pages = await browser.pages();
    const page = pages[0] ?? (await browser.newPage());
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options?.timeoutMs ?? 30000 });
    await writeLastUrl(statePath, url);
    logger.info('Navigated to URL', { url });
  } finally {
    await browser.close();
  }
}
```

Учесть: при одном окне/вкладке обычно уже есть одна page; если список пуст — можно создать новую вкладку или взять единственный target из `browser.targets()`. Детали зависят от API puppeteer-core.

## 5. API навигации в модуле Chrome

**Файл (изменить):** `src/modules/chrome/index.ts`

- После успешного `launchChrome` модуль должен предоставлять способ вызвать навигацию. Варианты: экспортировать функцию `navigateToUrl`, принимающую `(url: string)` и использующую `config.devToolsPort`, `config.lastUrlStatePath` и общий logger; либо возвращать из `createChromeModule` объект с методом `navigateToUrl(url: string)`.
- Поскольку оркестратор вызывает только `start()`, API навигации нужен для внешнего кода (бот, тест, скрипт). Поэтому разумно экспортировать функцию, которая принимает конфиг и logger и возвращает `navigateToUrl(url)`, либо хранить в замыкании модуля порт и statePath после `start()` и экспортировать одну функцию `navigateToUrl(url: string)` из модуля chrome, вызывающую внутреннюю реализацию с текущими портом и путём к state-файлу.
- Рекомендация: в `createChromeModule` сохранять в замыкании (или в объекте модуля) порт и statePath после старта; экспортировать из `src/modules/chrome/index.ts` функцию, например `getChromeNavigate(): ((url: string) => Promise<void>) | null`, которая возвращает функцию навигации только после успешного `start()` (иначе `null`). Либо проще: экспортировать `navigateToUrl(config: AppConfig, logger: Logger, url: string): Promise<void>`, внутри проверять `getChromeProcess()` и порт из config, вызывать `cdp.navigateToUrl(...)`.
- Уточнённый вариант: экспортировать асинхронную функцию `navigateToUrl(url: string, deps: { config: AppConfig; logger: Logger }): Promise<void>`, чтобы не хранить состояние в модуле. Внутри: порт = deps.config.devToolsPort ?? 9222, statePath = deps.config.lastUrlStatePath ?? './.last-url'; проверить `getChromeProcess() != null`; вызвать `navigateToUrl` из `cdp.ts`.

```typescript
// В index.ts после createChromeModule добавить экспорт:
import { navigateToUrl as cdpNavigateToUrl } from './cdp';
import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';

export async function navigateToUrl(
  url: string,
  deps: { config: AppConfig; logger: Logger }
): Promise<void> {
  if (getChromeProcess() == null) {
    throw new Error('Chrome is not running');
  }
  const port = deps.config.devToolsPort ?? 9222;
  const statePath = deps.config.lastUrlStatePath ?? './.last-url';
  await cdpNavigateToUrl(port, url, statePath, deps.logger);
}
```

И при необходимости экспортировать `readLastUrl` из `lastUrlState.ts` для этапов восстановления.

## 6. Тесты

**Файл (изменить):** `test/chrome.test.ts` (или добавить `test/chrome-cdp.test.ts`)

Сценарии:
- **lastUrlState:** запись URL в файл и чтение обратно; чтение при отсутствии файла возвращает `null`; запись перезаписывает предыдущее значение.
- **navigateToUrl (юнит с моками):** при отсутствии запущенного Chrome `navigateToUrl` выбрасывает ошибку (или возвращает отрицательный результат — в зависимости от выбранной сигнатуры). Можно мокать `getChromeProcess()` и вызов CDP; проверять, что при успешной навигации вызывается `writeLastUrl` с нужным URL.
- **Интеграционный тест (опционально):** если в окружении доступен Chrome с DevTools, запустить браузер на тестовом порту, вызвать навигацию на `about:blank` или локальный URL, проверить сохранение в state-файл и закрыть браузер. Пометить тест как skip при отсутствии Chrome или переменной окружения.

Пример структуры тестов:

```typescript
describe('lastUrlState', () => {
  it('writes and reads URL from file', async () => {
    const tmp = join(tmpdir(), `last-url-${Date.now()}`);
    await writeLastUrl(tmp, 'https://example.com');
    const read = await readLastUrl(tmp);
    assert.strictEqual(read, 'https://example.com');
  });
  it('returns null when file does not exist', async () => {
    const read = await readLastUrl('/nonexistent/path');
    assert.strictEqual(read, null);
  });
});

describe('navigateToUrl', () => {
  it('throws when Chrome process is not running', async () => {
    // mock getChromeProcess to return null
    await assert.rejects(() => navigateToUrl('http://example.com', { config, logger }), /Chrome is not running/);
  });
});
```

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `package.json` |
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Создать  | `src/modules/chrome/lastUrlState.ts` |
| Создать  | `src/modules/chrome/cdp.ts` |
| Изменить | `src/modules/chrome/index.ts` |
| Изменить | `test/chrome.test.ts` (или создать `test/chrome-cdp.test.ts`) |

## Ссылки

- [analyze.md](./analyze.md) текущей задачи
- docs/plan-execution.md — Этап 3
- docs/requirements/init.md — требования к переключению URL и восстановлению
