# План реализации: Запуск и контроль OBS

Реализовать модуль OBS: фабрика `createObsModule(config, logger)`, возвращающая `AppModule`; внутри `start()` — запуск OBS через spawn, ожидание готовности (процесс жив, опционально таймаут), при падении — перезапуск с ограничением частоты и логированием. Конфиг — опциональные путь к профилю/конфигу OBS и таймаут готовности. Подключить модуль в `src/index.ts` вместо заглушки.

## 1. Конфиг: поля для OBS (профиль, таймаут, лимиты рестартов)

**Файлы (изменить):** `src/modules/config/types.ts`, `src/modules/config/validate.ts`

В `AppConfig` добавить опциональные поля:
- `obsProfilePath?: string` — каталог профиля OBS (если OBS поддерживает запуск с профилем через CLI);
- при необходимости для этапа 4 можно зафиксировать лимиты рестартов в коде (например, minIntervalMs и maxBackoff), либо добавить `obsRestartMinIntervalMs?: number` в конфиг.

В `validate.ts` читать опциональную переменную `OBS_PROFILE_PATH` (или `OBS_CONFIG_PATH`), триммировать; при добавлении лимитов рестартов — опционально `OBS_RESTART_MIN_INTERVAL_MS`.

```typescript
// types.ts — добавить в AppConfig
obsProfilePath?: string;
// опционально: obsRestartMinIntervalMs?: number;
```

```typescript
// validate.ts — добавить
const obsProfilePath = getEnv('OBS_PROFILE_PATH')?.trim();
return {
  // ...
  obsProfilePath: obsProfilePath || undefined,
};
```

## 2. Аргументы запуска OBS

**Файл (создать):** `src/modules/obs/args.ts`

Функция `buildObsArgs(config: AppConfig): string[]` — возвращает массив аргументов для spawn: только путь к исполняемому не передаётся здесь (он первый аргумент в spawn). Если есть `config.obsProfilePath`, добавить аргумент вида `--profile-path=/path` или эквивалент, поддерживаемый OBS на Linux (при отсутствии единого стандарта — использовать документированный флаг или оставить пустой массив и передавать через переменную окружения рабочей директории; в плане указать передачу через args). Использовать только значения из конфига, без подстановки пользовательского ввода.

```typescript
import type { AppConfig } from '../config/types';

export function buildObsArgs(config: AppConfig): string[] {
  const args: string[] = [];
  if (config.obsProfilePath) {
    args.push(`--profile=${config.obsProfilePath}`);
  }
  return args;
}
```

Примечание: точный флаг уточнить по документации OBS (может быть `--profile` или путь как единственный аргумент); если OBS не поддерживает — оставить пустой массив.

## 3. Определение готовности OBS

**Файл (создать):** `src/modules/obs/ready.ts`

Функция `waitForObsReady(process: ChildProcess, timeoutMs: number): Promise<void>`. Критерий готовности для MVP: процесс жив (не событие `exit`). Poll в цикле с интервалом (например 250 ms): проверять `proc.exitCode === null && !proc.killed`; при первом тике, когда процесс жив, — resolve (считаем готовым); если процесс уже завершился — reject; при таймауте без перехода в «жив» — reject с сообщением.

```typescript
import type { ChildProcess } from 'node:child_process';

export function waitForObsReady(
  proc: ChildProcess,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  const intervalMs = 250;
  return new Promise((resolve, reject) => {
    function tick(): void {
      if (proc.exitCode !== null || proc.killed) {
        reject(new Error('OBS process exited before ready'));
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        reject(new Error(`OBS not ready within ${timeoutMs}ms`));
        return;
      }
      // Процесс жив дольше одного интервала — считаем готовым
      if (Date.now() - start >= intervalMs) {
        resolve();
        return;
      }
      setTimeout(tick, intervalMs);
    }
    setTimeout(tick, intervalMs);
  });
}
```

## 4. Запуск процесса OBS

**Файл (создать):** `src/modules/obs/launch.ts`

- Хранить текущий процесс OBS в переменной модуля (по аналогии с Chrome) и экспортировать `getObsProcess(): ChildProcess | null`.
- Функция `launchObs(obsPath: string, args: string[], timeoutMs: number, logger: Logger): Promise<void>`:
  - Вызвать `spawn(obsPath, args, { stdio: 'ignore', shell: false })`.
  - На событие `error` — обнулить процесс, залогировать, reject.
  - После `spawn` вызвать `waitForObsReady(proc, timeoutMs)`; при успехе — logger.info('OBS ready'), resolve; при reject — убить процесс, обнулить, reject.
- Не подписывать здесь на `exit` для рестарта — это в шаге 6.

```typescript
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { Logger } from '../logger';
import { waitForObsReady } from './ready';

let obsProcess: ChildProcess | null = null;

export function getObsProcess(): ChildProcess | null {
  return obsProcess;
}

export async function launchObs(
  obsPath: string,
  args: string[],
  timeoutMs: number,
  logger: Logger
): Promise<void> {
  obsProcess = spawn(obsPath, args, { stdio: 'ignore', shell: false });
  const proc = obsProcess;
  return new Promise((resolve, reject) => {
    proc.on('error', (err) => {
      obsProcess = null;
      logger.error('OBS spawn error', err);
      reject(err);
    });
    proc.on('spawn', () => {
      waitForObsReady(proc, timeoutMs)
        .then(() => {
          logger.info('OBS ready');
          resolve();
        })
        .catch((err) => {
          logger.error('OBS not ready', err);
          proc.kill('SIGTERM');
          obsProcess = null;
          reject(err);
        });
    });
  });
}
```

## 5. Перезапуск при падении (ограничение частоты)

**Файл (создать):** `src/modules/obs/restart.ts`

- Хранить `lastRestartAt: number` (timestamp) и при необходимости счётчик подряд идущих рестартов.
- Функция `scheduleRestart(fn: () => Promise<void>, deps: { config: AppConfig; logger: Logger }): void` — вызывается из модуля при событии `exit` процесса OBS. Логировать код выхода и сигнал (если есть).
- Ограничение частоты: минимальный интервал между рестартами (например 5000 ms — из конфига `obsRestartMinIntervalMs` или константа). Если с момента `lastRestartAt` прошло меньше — не перезапускать сразу, запланировать таймер (setTimeout) на оставшееся время, затем вызвать `fn()` (запуск OBS снова), обновить `lastRestartAt`. При желании — простой экспоненциальный backoff (удваивать интервал до максимума).
- `fn` — это по сути повторный вызов логики start (launchObs + подписка на exit снова). Чтобы не дублировать код, лучше передавать в модуль OBS колбэк «запустить OBS» и из restart вызывать его.

Альтернатива: логика рестарта целиком внутри модуля OBS (index.ts): при `exit` вызывать внутреннюю функцию `restart()`, которая проверяет интервал, ждёт при необходимости, затем снова вызывает `launchObs` и заново подписывается на `exit`. Тогда `restart.ts` экспортирует только хелперы: `canRestart(lastRestartAt, minIntervalMs): boolean` и `getDelayMs(lastRestartAt, minIntervalMs): number`.

```typescript
// restart.ts — хелперы для ограничения частоты
export function getRestartDelayMs(
  lastRestartAt: number,
  minIntervalMs: number
): number {
  const elapsed = Date.now() - lastRestartAt;
  return Math.max(0, minIntervalMs - elapsed);
}

export function shouldThrottleRestart(
  lastRestartAt: number,
  minIntervalMs: number
): boolean {
  return getRestartDelayMs(lastRestartAt, minIntervalMs) > 0;
}
```

## 6. Модуль OBS (фабрика AppModule и подписка на exit)

**Файл (создать):** `src/modules/obs/index.ts`

- `createObsModule(config: AppConfig, logger: Logger): AppModule`:
  - Возвращает `{ name: 'OBS', start }`.
  - В `start()`: вызвать `buildObsArgs(config)`, затем `launchObs(config.obsPath, args, config.obsReadyTimeout ?? 10000, logger)`. После успешного запуска подписаться на `proc.on('exit', (code, signal) => { ... })`. В обработчике: залогировать код/сигнал; вычислить задержку рестарта (restart.getRestartDelayMs); если задержка > 0 — setTimeout(..., delay, () => { снова вызвать логику запуска и подписаться на exit }); иначе — сразу повторить. Обновить lastRestartAt после фактического вызова запуска. Ограничить максимум рестартов подряд (например 5) или максимум задержки (например 60 s) — при превышении только логировать и не перезапускать (или один раз залогировать и перестать рестартить до следующего вызова start).
  - Хранить `lastRestartAt` и счётчик рестартов в замыкании модуля.
- Экспортировать `getObsProcess` из launch.ts через index (для этапа 5 watchdog).

```typescript
import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';
import type { AppModule } from '../orchestrator';
import { buildObsArgs } from './args';
import { getObsProcess, launchObs } from './launch';
import { getRestartDelayMs } from './restart';

const RESTART_MIN_INTERVAL_MS = 5000;
const MAX_RESTARTS = 10;

export function createObsModule(config: AppConfig, logger: Logger): AppModule {
  let lastRestartAt = 0;
  let restartCount = 0;

  function run(): Promise<void> {
    const args = buildObsArgs(config);
    const timeoutMs = config.obsReadyTimeout ?? 10000;
    return launchObs(config.obsPath, args, timeoutMs, logger);
  }

  function scheduleRestart(): void {
    const proc = getObsProcess();
    if (!proc) return;
    proc.once('exit', (code, signal) => {
      logger.warn('OBS exited', { code, signal });
      restartCount++;
      if (restartCount > MAX_RESTARTS) {
        logger.error('OBS max restarts reached, not restarting');
        return;
      }
      const delay = getRestartDelayMs(lastRestartAt, RESTART_MIN_INTERVAL_MS);
      const doRestart = () => {
        lastRestartAt = Date.now();
        run()
          .then(() => scheduleRestart())
          .catch((err) => logger.error('OBS restart failed', err));
      };
      if (delay > 0) setTimeout(doRestart, delay);
      else doRestart();
    });
  }

  return {
    name: 'OBS',
    async start() {
      await run();
      scheduleRestart();
    },
  };
}

export { getObsProcess } from './launch';
```

Важно: подписку на `exit` делать после того, как `launchObs` уже resolve (процесс запущен), иначе при первом старте событие exit может не успеть привязаться.

## 7. Подключение модуля OBS в точку входа

**Файл (изменить):** `src/index.ts`

Импортировать `createObsModule` из `./modules/obs`. Заменить `obsStub` на `createObsModule(config, logger)`. Передать вторым элементом в `runOrchestrator([chromeModule, obsModule], logger)`.

```typescript
import { createObsModule } from './modules/obs';

// ...
const obsModule = createObsModule(config, logger);
await runOrchestrator([chromeModule, obsModule], logger);
```

## 8. Документация env

**Файл (изменить):** `docs/env.md`

В секцию Optional добавить строку для `OBS_PROFILE_PATH` (если введена): описание и пример. При добавлении `OBS_RESTART_MIN_INTERVAL_MS` — тоже описать.

| Variable | Description | Example |
|----------|-------------|---------|
| `OBS_PROFILE_PATH` | Path to OBS profile/config directory (optional) | `/home/user/.config/obs-studio` |

## 9. Тесты

**Файл (создать):** `test/obs.test.ts`

Сценарии:
- **buildObsArgs:** без профиля — пустой массив (или без лишних аргументов); с `obsProfilePath` — массив содержит аргумент с путём.
- **waitForObsReady:** при уже завершённом процессе — reject с сообщением о выходе; при таймауте на «живом» мок-процессе (например, объект с exitCode: null) — reject по таймауту. Мок процесса: `{ exitCode: null, killed: false }` и через некоторое время симулировать «exit» (например, подменить на объект с exitCode: 0) для теста «reject when process exits».
- **launchObs:** при несуществующем исполняемом — spawn error, reject (или skip на платформах без OBS). При существующем пути — интеграционный тест можно пропустить или пометить как slow; юнит-тесты с моком spawn предпочтительнее.
- **getRestartDelayMs / shouldThrottleRestart:** lastRestartAt только что — задержка равна minIntervalMs; lastRestartAt давно в прошлом — задержка 0.
- **createObsModule:** возвращает объект с name 'OBS' и функцией start; вызов start с моком launchObs (подмена модуля или передача зависимостей) завершается без ошибки и вызывает launch с нужными аргументами.

Добавить в `package.json` в script `test` файл `test/obs.test.ts`.

```json
"test": "node -r ts-node/register --test test/config.test.ts test/idle-server.test.ts test/chrome.test.ts test/obs.test.ts"
```

## Сводка файлов

| Действие | Файл |
|----------|------|
| Создать  | `src/modules/obs/args.ts` |
| Создать  | `src/modules/obs/ready.ts` |
| Создать  | `src/modules/obs/launch.ts` |
| Создать  | `src/modules/obs/restart.ts` |
| Создать  | `src/modules/obs/index.ts` |
| Создать  | `test/obs.test.ts` |
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `src/index.ts` |
| Изменить | `docs/env.md` |
| Изменить | `package.json` (test script) |

## Ссылки

- [analyze.md](./analyze.md) текущей задачи
