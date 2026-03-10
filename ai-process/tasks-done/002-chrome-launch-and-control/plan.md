# План реализации: Запуск и контроль Chrome

Реализовать модуль Chrome в `src/modules/chrome/`: запуск процесса с remote debugging, ожидание готовности DevTools, открытие одного окна с idle-страницей. Модуль реализует `AppModule`; `start()` резолвится только после готовности DevTools, чтобы оркестратор запускал OBS после Chrome. Без новых npm-зависимостей; запуск через `child_process.spawn` без shell (защита от command injection).

## 1. Расширение конфигурации (режим окна и порт DevTools по умолчанию)

**Файлы (изменить):** `src/modules/config/types.ts`, `src/modules/config/validate.ts`

Добавить опциональное поле режима окна Chrome и задать значение по умолчанию для порта DevTools (чтобы модуль Chrome мог работать без обязательного `DEVTOOLS_PORT`).

В `types.ts` добавить тип и поле:

```typescript
export type ChromeWindowMode = 'kiosk' | 'app' | 'fullscreen' | 'default';

export interface AppConfig {
  // ... существующие поля
  devToolsPort?: number;        // если не задан — в модуле Chrome использовать 9222
  chromeWindowMode?: ChromeWindowMode;  // опционально, по умолчанию 'default'
  // ...
}
```

В `validate.ts`: добавить чтение опциональной переменной `CHROME_WINDOW_MODE`, валидацию по одному из значений `kiosk` | `app` | `fullscreen` | `default` (при пустом/отсутствующем — не добавлять в конфиг или задать `'default'`). Порт DevTools по-прежнему опционален (без изменений логики).

## 2. Формирование аргументов командной строки Chrome

**Файл (создать):** `src/modules/chrome/args.ts`

Функция, которая по `AppConfig` возвращает массив строк аргументов для Chrome. Никакого пользовательского ввода — только значения из конфига. Это позволит тестировать формирование аргументов без запуска процесса и исключит command injection.

Пример сигнатуры и использования:

```typescript
import type { AppConfig } from '../config/types';

/**
 * Build Chrome CLI args for remote debugging and single-window mode.
 * Uses only config values (no user input). Safe to pass to spawn(argv).
 */
export function buildChromeArgs(
  config: AppConfig,
  devToolsPort: number,
  initialUrl: string
): string[] {
  const port = String(devToolsPort);
  const args = [
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    initialUrl,
  ];
  const mode = config.chromeWindowMode ?? 'default';
  if (mode === 'kiosk') args.unshift('--kiosk');
  else if (mode === 'app') {
    args.pop(); // убрать initialUrl из конца
    args.unshift(`--app=${initialUrl}`);
  } else if (mode === 'fullscreen') args.unshift('--start-fullscreen');
  return args;
}
```

Уточнение: для `app` режима типичный вариант — `--app=<url>`. Тогда `initialUrl` подставляется только в `--app=...` и не дублируется. В плане оставить формирование так, чтобы один URL открывался в одном окне (одна вкладка).

## 3. Ожидание готовности DevTools

**Файл (создать):** `src/modules/chrome/waitDevTools.ts`

Функция `waitForDevTools(port: number, timeoutMs: number): Promise<void>`. До истечения `timeoutMs` периодически (например, каждые 200–300 мс) выполнять HTTP GET `http://127.0.0.1:{port}/json/version`. При успешном ответе (status 200 и валидный JSON) — резолвить. При таймауте — отклонить Promise с понятной ошибкой (например, `new Error('Chrome DevTools not ready within ${timeoutMs}ms')`). Использовать только `http.get` из Node.js (без новых пакетов). Ошибки сети (ECONNREFUSED и т.д.) считать «ещё не готов» и повторять попытки.

Пример каркаса:

```typescript
export function waitForDevTools(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  const intervalMs = 250;
  return new Promise((resolve, reject) => {
    function tick() {
      if (Date.now() - start >= timeoutMs) {
        reject(new Error(`Chrome DevTools not ready within ${timeoutMs}ms`));
        return;
      }
      const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
        if (res.statusCode === 200) {
          resolve();
          return;
        }
        setTimeout(tick, intervalMs);
      });
      req.on('error', () => setTimeout(tick, intervalMs));
      req.end();
    }
    tick();
  });
}
```

## 4. Запуск процесса Chrome и реализация start()

**Файл (создать):** `src/modules/chrome/launch.ts`

- Запуск: `child_process.spawn(config.chromePath, args, { stdio: 'ignore' })` — без shell, массив `args` из `buildChromeArgs`.
- Сохранить ссылку на процесс (например, в замыкании или объекте модуля), чтобы в задаче 003 можно было использовать CDP или закрывать процесс.
- После spawn вызвать `waitForDevTools(port, timeoutMs)`.
- Порт: `config.devToolsPort ?? 9222`. Таймаут: `config.chromeReadyTimeout ?? 30000`.
- URL для открытия: `http://localhost:${config.idlePort}/` (idle-страница).
- При успехе — резолвить Promise. При ошибке (spawn error, таймаут) — логировать, отклонить Promise (и при необходимости завершить процесс).

Не обрабатывать в этом шаге выбор target по CDP — только один URL при старте.

## 5. Модуль Chrome: фабрика и экспорт AppModule

**Файл (создать):** `src/modules/chrome/index.ts`

Экспорт фабрики:

```typescript
import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';
import type { AppModule } from '../orchestrator';
import { buildChromeArgs } from './args';
import { waitForDevTools } from './waitDevTools';
import { launchChrome } from './launch';

export function createChromeModule(config: AppConfig, logger: Logger): AppModule {
  return {
    name: 'Chrome',
    async start() {
      const port = config.devToolsPort ?? 9222;
      const timeoutMs = config.chromeReadyTimeout ?? 30000;
      const idleUrl = `http://localhost:${config.idlePort}/`;
      const args = buildChromeArgs(config, port, idleUrl);
      await launchChrome(config.chromePath, args, port, timeoutMs, logger);
    },
  };
}

export { buildChromeArgs } from './args';
export { waitForDevTools } from './waitDevTools';
```

В `launch.ts` реализовать `launchChrome(chromePath, args, port, timeoutMs, logger)`: spawn, ожидание DevTools, при ошибке — `reject` и логирование.

## 6. Подключение модуля Chrome в точку входа

**Файл (изменить):** `src/index.ts`

- Импортировать `createChromeModule` из `./modules/chrome`.
- Удалить заглушку `chromeStub`.
- Создать экземпляр: `const chromeModule = createChromeModule(config, logger)`.
- В `runOrchestrator` передать `[chromeModule, obsStub]` вместо `[chromeStub, obsStub]`.

## 7. Тесты

**Файл (создать):** `test/chrome.test.ts`

Сценарии:

- **Happy path (unit):** `buildChromeArgs(config, 9222, 'http://localhost:3000/')` возвращает массив, содержащий `--remote-debugging-port=9222` и переданный URL; при `chromeWindowMode: 'kiosk'` в начале массива есть `--kiosk`; при `'fullscreen'` — `--start-fullscreen`.
- **Режимы окна:** для каждого значения `kiosk` / `app` / `fullscreen` / `default` проверять наличие ожидаемых аргументов и отсутствие лишних.
- **Ошибки:** `waitForDevTools(port, 500)` при недоступном порте отклоняет Promise с сообщением о таймауте (мок порта не поднимаем — тест может быть слегка медленным или с маленьким таймаутом).
- По желанию: интеграционный тест с реальным коротким таймаутом и моком HTTP-сервера на порту 9222, отдающим `/json/version` — тогда `waitForDevTools(9222, 2000)` резолвится.

Использовать `node:test` и `assert` в стиле `test/config.test.ts`.

## Сводка файлов

| Действие | Файл |
|----------|------|
| Создать  | `src/modules/chrome/args.ts` |
| Создать  | `src/modules/chrome/waitDevTools.ts` |
| Создать  | `src/modules/chrome/launch.ts` |
| Создать  | `src/modules/chrome/index.ts` |
| Создать  | `test/chrome.test.ts` |
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `src/index.ts` |

## Ссылки

- [analyze.md](./analyze.md) текущей задачи
- [description.md](./description.md)
- [docs/plan-execution.md](../../docs/plan-execution.md) — Этап 2
