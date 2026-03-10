# План реализации: Watchdog и восстановление Chrome/OBS

Реализовать периодическую проверку состояния Chrome и OBS через соответствующие модули; при падении выполнять рестарт с ограничением частоты (backoff); интервал проверки и при необходимости параметры backoff задавать через переменные окружения. После восстановления Chrome открывать последний URL или idle-страницу. В логах выводить статусы ready/degraded.

## 1. Конфиг: интервал проверки и опционально backoff

**Файлы (изменить):** `src/modules/config/types.ts`, `src/modules/config/validate.ts`

В `AppConfig` добавить опциональные поля:

- `watchdogCheckIntervalMs?: number` — интервал периодической проверки статуса (env: `WATCHDOG_CHECK_INTERVAL_MS`). Если не задан — watchdog не запускать.
- `watchdogRestartMinIntervalMs?: number` — минимальный интервал (мс) между рестартами по инициативе watchdog (env: `WATCHDOG_RESTART_MIN_INTERVAL_MS`). При отсутствии — использовать значение по умолчанию в коде watchdog (например 10000).

В `validate.ts`: читать переменные через `getEnv` и `parseOptionalPositiveInt`, добавлять в возвращаемый объект.

```typescript
// types.ts
/** Interval (ms) for watchdog status checks. If not set, watchdog is disabled. */
watchdogCheckIntervalMs?: number;
/** Min interval (ms) between watchdog-triggered restarts. */
watchdogRestartMinIntervalMs?: number;
```

## 2. Chrome: проверка живости и рестарт

**Файлы (изменить):** `src/modules/chrome/launch.ts`, `src/modules/chrome/index.ts`

В `launch.ts`:

- Добавить функцию **killChromeProcess()**: если `chromeProcess` не null — вызвать `proc.kill('SIGTERM')`, присвоить `chromeProcess = null`. Использовать перед повторным запуском.

В `index.ts`:

- Экспортировать **isChromeAlive**(config): вернуть true, если `getChromeProcess()` не null и `proc.exitCode === null`.
- Экспортировать **restartChrome**(config, logger): вызвать `killChromeProcess()`, затем `launchChrome(...)` с параметрами из config (port, timeout, args через buildChromeArgs); после успешного запуска — `readLastUrl(statePath)`, затем `navigateToUrl(lastUrl ?? idleUrl, { config, logger })` (idleUrl = `http://localhost:${config.idlePort}/`). Ошибки логировать и пробрасывать.

```typescript
// chrome/index.ts
export function isChromeAlive(config: AppConfig): boolean {
  const proc = getChromeProcess();
  return proc != null && proc.exitCode === null;
}

export async function restartChrome(config: AppConfig, logger: Logger): Promise<void> {
  killChromeProcess();
  const port = config.devToolsPort ?? 9222;
  const timeoutMs = config.chromeReadyTimeout ?? 30000;
  const idleUrl = `http://localhost:${config.idlePort}/`;
  const args = buildChromeArgs(config, port, idleUrl);
  await launchChrome(config.chromePath, args, port, timeoutMs, logger);
  const statePath = config.lastUrlStatePath ?? './.last-url';
  const lastUrl = await readLastUrl(statePath);
  await navigateToUrl(lastUrl ?? idleUrl, { config, logger });
}
```

## 3. OBS: проверка живости и единая точка рестарта

**Файлы (изменить):** `src/modules/obs/index.ts`

В `index.ts`:

- Экспортировать **isObsAlive()**: вернуть true, если `getObsProcess()` не null и `proc.exitCode === null`.
- Вынести общую логику рестарта в функцию **performRestart** (внутри замыкания): вычислить задержку через `getRestartDelayMs(lastRestartAt, RESTART_MIN_INTERVAL_MS)`; при исчерпании лимита рестартов — залогировать и выйти; иначе после задержки вызвать `run()`, затем снова `scheduleRestart()`. Обработчик `proc.once('exit', ...)` вызывает только `performRestart()`.
- Экспортировать **restartObs**(config, logger): если `isObsAlive()` — ничего не делать; иначе вызвать `performRestart()`. Так и watchdog, и обработчик exit используют один backoff и один лимит рестартов.

В `launch.ts` менять не обязательно: `launchObs` уже перезаписывает `obsProcess`; после успешного `run()` вызывается `scheduleRestart()` из `performRestart`.

```typescript
// obs/index.ts — идея
function performRestart(): void {
  if (restartCount > MAX_RESTARTS) { logger.error('...'); return; }
  const delay = getRestartDelayMs(lastRestartAt, RESTART_MIN_INTERVAL_MS);
  const doRun = (): void => {
    lastRestartAt = Date.now();
    run().then(() => scheduleRestart()).catch((err) => logger.error('OBS restart failed', err));
  };
  if (delay > 0) setTimeout(doRun, delay);
  else doRun();
}
// exit handler: performRestart()
// export restartObs(): if (!isObsAlive()) performRestart();
```

## 4. Модуль Watchdog

**Файл (создать):** `src/modules/watchdog/index.ts`

Модуль экспортирует **startWatchdog**(config, logger, deps). deps — объект с методами: `isChromeAlive(config)`, `restartChrome(config, logger)`, `isObsAlive()`, `restartObs(config, logger)` (функции из модулей chrome и obs).

Логика:

- Если `config.watchdogCheckIntervalMs` отсутствует или <= 0 — не запускать цикл, сразу resolve.
- Иначе: setInterval с интервалом `watchdogCheckIntervalMs`. В колбеке — проверить Chrome и OBS; если оба живы — логировать ready (при смене статуса); если Chrome или OBS мёртв — логировать degraded, применить backoff (время последнего рестарта Chrome/OBS и `watchdogRestartMinIntervalMs` или дефолт 10000), вызвать соответствующий restart, обновить время рестарта.
- Логировать смену статуса (ready/degraded) и факты рестарта.

```typescript
export interface WatchdogDeps {
  isChromeAlive: (config: AppConfig) => boolean;
  restartChrome: (config: AppConfig, logger: Logger) => Promise<void>;
  isObsAlive: () => boolean;
  restartObs: (config: AppConfig, logger: Logger) => Promise<void>;
}

export function startWatchdog(
  config: AppConfig,
  logger: Logger,
  deps: WatchdogDeps
): Promise<void> {
  const intervalMs = config.watchdogCheckIntervalMs ?? 0;
  if (intervalMs <= 0) return Promise.resolve();
  const minRestartMs = config.watchdogRestartMinIntervalMs ?? 10000;
  let lastChromeRestartAt = 0;
  let lastObsRestartAt = 0;
  let status: 'ready' | 'degraded' = 'ready';

  const check = async (): Promise<void> => {
    const chromeAlive = deps.isChromeAlive(config);
    const obsAlive = deps.isObsAlive();
    if (chromeAlive && obsAlive) {
      if (status !== 'ready') { logger.info('Watchdog status: ready'); status = 'ready'; }
      return;
    }
    if (status !== 'degraded') { logger.warn('Watchdog status: degraded'); status = 'degraded'; }
    if (!chromeAlive) {
      const delay = Math.max(0, minRestartMs - (Date.now() - lastChromeRestartAt));
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
      try {
        await deps.restartChrome(config, logger);
        lastChromeRestartAt = Date.now();
      } catch (e) { logger.error('Watchdog Chrome restart failed', e); }
    }
    if (!deps.isObsAlive()) {
      const delay = Math.max(0, minRestartMs - (Date.now() - lastObsRestartAt));
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
      try {
        await deps.restartObs(config, logger);
        lastObsRestartAt = Date.now();
      } catch (e) { logger.error('Watchdog OBS restart failed', e); }
    }
  };

  setInterval(check, intervalMs);
  check();
  return Promise.resolve();
}
```

## 5. Подключение в точке входа

**Файл (изменить):** `src/index.ts`

После `await runOrchestrator([chromeModule, obsModule], logger)`: если задан `config.watchdogCheckIntervalMs` и > 0 — импортировать `startWatchdog` и вызвать с config, logger и deps: `isChromeAlive`, `restartChrome`, `isObsAlive`, `restartObs` из модулей chrome и obs. Процесс продолжает работать за счёт setInterval в watchdog.

```typescript
import { startWatchdog } from './modules/watchdog';
import * as chromeModule from './modules/chrome';
import * as obsModule from './modules/obs';

// после runOrchestrator:
if (config.watchdogCheckIntervalMs && config.watchdogCheckIntervalMs > 0) {
  startWatchdog(config, logger, {
    isChromeAlive: chromeModule.isChromeAlive,
    restartChrome: chromeModule.restartChrome,
    isObsAlive: obsModule.isObsAlive,
    restartObs: obsModule.restartObs,
  });
}
```

## 6. Документация и пример env

**Файлы (изменить):** `docs/env.md`, `.env.example`

В `docs/env.md` в секции Optional добавить:

- `WATCHDOG_CHECK_INTERVAL_MS` — интервал (мс) проверки статуса Chrome и OBS; если не задан, watchdog отключён.
- `WATCHDOG_RESTART_MIN_INTERVAL_MS` — минимальный интервал (мс) между рестартами по инициативе watchdog (по умолчанию 10000).

В `.env.example` добавить закомментированные строки:

```
# WATCHDOG_CHECK_INTERVAL_MS=15000
# WATCHDOG_RESTART_MIN_INTERVAL_MS=10000
```

## 7. Тесты

**Файлы (создать/изменить):** `test/watchdog.test.ts` (по структуре проекта тесты в `test/`); при необходимости дополнить `test/chrome.test.ts` и `test/obs.test.ts` для isChromeAlive/restartChrome и isObsAlive/restartObs.

Сценарии:

- **Watchdog:** при отсутствии `watchdogCheckIntervalMs` — startWatchdog сразу resolve, setInterval не вызывается; при заданном интервале — цикл запускается, при мёртвом Chrome вызывается restartChrome (мок), при мёртвом OBS — restartObs (мок); логирование ready/degraded при смене состояния.
- **Chrome:** isChromeAlive при отсутствии процесса — false; при живом процессе — true. restartChrome: мок launchChrome и navigateToUrl, после вызова проверять вызов navigateToUrl с lastUrl или idle.
- **OBS:** isObsAlive — false при exitCode !== null; restartObs при мёртвом процессе вызывает performRestart (проверить через мок launchObs или счётчик рестартов).

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `src/modules/chrome/launch.ts` |
| Изменить | `src/modules/chrome/index.ts` |
| Изменить | `src/modules/obs/index.ts` |
| Создать   | `src/modules/watchdog/index.ts` |
| Изменить | `src/index.ts` |
| Изменить | `docs/env.md` |
| Изменить | `.env.example` |
| Создать   | `test/watchdog.test.ts` (и при необходимости доп. сценарии в test/chrome.test.ts, test/obs.test.ts) |

## Ссылки

- [analyze.md](./analyze.md) текущей задачи
