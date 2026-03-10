# План реализации: Основа проекта и конфигурация

Задача — инициализировать Node.js-проект на TypeScript с модульной структурой, ввести конфигурацию только из переменных окружения с валидацией и типизацией, настроить логирование, поднять idle-страницу на Express с EJS, добавить проверку наличия Chrome/OBS при старте и заложить оркестрацию последовательного запуска приложений (без реализации модулей Chrome/OBS). Код не пишем — только план.

## 1. TypeScript и структура проекта

**Файлы (создать/изменить):** `package.json`, `tsconfig.json`, каталоги `src/`, `src/modules/`.

- В `package.json`: добавить зависимости `typescript`, `@types/node`, `express`, `ejs`, `ts-node`; dev-зависимости по необходимости (`@types/express`, `@types/ejs`). Скрипты: `build` (tsc), `start` (node dist/index.js или ts-node src/index.ts), `dev` (ts-node src/index.ts), `test` (запуск тестов).
- Создать `tsconfig.json`: компиляция в `dist/`, включить `src/`, строгие опции (strict или эквивалент), module/commonjs или ESM по выбору проекта.
- Убедиться, что есть каталоги `src/`, `src/modules/` (пустые или с заглушками).

```json
// tsconfig.json — пример
{
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

## 2. Модуль конфигурации

**Файлы (создать):** `src/modules/config/types.ts`, `src/modules/config/validate.ts`, `src/modules/config/index.ts`.

- **types.ts:** интерфейс конфига (TypeScript): `chromePath`, `obsPath`, `idlePort`, `idleViewsPath`, `devToolsPort?`, `chromeReadyTimeout?`, `obsReadyTimeout?`, `logLevel`, позже — `botToken`, `allowedUsers`, политика рестартов и т.д. Для этапа 001 достаточно полей, нужных idle-серверу и проверке исполняемых.
- **validate.ts:** чтение `process.env`, валидация обязательных переменных (например `CHROME_PATH`, `OBS_PATH`, `IDLE_PORT`, `IDLE_VIEWS_PATH`, `LOG_LEVEL`), проверка форматов (порт — число в диапазоне, путь — непустая строка, уровень логов — один из info/warn/error/debug). При ошибке — выбросить ошибку с понятным сообщением (или вызвать `process.exit(1)` после вывода в stderr).
- **index.ts:** экспорт одной функции `getConfig()` (или синглтон): при первом вызове выполнить валидацию и вернуть типизированный объект; при ошибке — throw. Экспорт типа конфига из `types.ts`.

```typescript
// types.ts — пример полей для этапа 001
export interface AppConfig {
  chromePath: string;
  obsPath: string;
  idlePort: number;
  idleViewsPath: string;
  logLevel: 'info' | 'warn' | 'error' | 'debug';
  devToolsPort?: number;
}
```

## 3. Модуль логирования

**Файл (создать):** `src/modules/logger/index.ts` (или `src/modules/log/index.ts`).

- Обёртка с методами `info`, `warn`, `error`, `debug`. Уровень логирования брать из конфига (через вызов `getConfig()` или передачу уровня в фабрику логгера). Сообщения ниже текущего уровня не выводить. Вывод в stdout/stderr (или через библиотеку pino/winston — по выбору).
- API: например `logger.info('message')`, `logger.error('message', error)`. При старте приложения логировать событие старта сервиса.

```typescript
// пример API
const logger = createLogger(config.logLevel);
logger.info('Service starting');
logger.error('Chrome not found', new Error('ENOENT'));
```

## 4. Проверка наличия исполняемых Chrome и OBS

**Файл (создать):** `src/modules/startup-checks/index.ts` или `src/utils/check-executables.ts`.

- Функция проверки существования файла по пути (например `fs.promises.access(path, fs.constants.X_OK)` или `fs.existsSync` + проверка режима). Для Linux — исполняемый по пути из конфига.
- Две проверки: Chrome по `config.chromePath`, OBS по `config.obsPath`. При отсутствии — логировать понятное сообщение (например «Chrome not found at …») и завершать процесс (`process.exit(1)`) или выбрасывать ошибку, которую обработает точка входа (выход с ненулевым кодом).
- Экспорт: например `checkChromeAndObs(config: AppConfig): void | never`.

```typescript
async function checkExecutable(path: string, name: string): Promise<void> {
  try {
    await fs.promises.access(path, fs.constants.X_OK);
  } catch {
    logger.error(`${name} not found at ${path}`);
    process.exit(1);
  }
}
```

## 5. Idle-сервер (Express + EJS)

**Файлы (создать):** `src/modules/idle-server/index.ts`, шаблон в каталоге представлений (путь из конфига, например `views/idle.ejs` в корне проекта).

- Инициализация Express, установка EJS как движка, `app.set('views', config.idleViewsPath)`, `app.set('view engine', 'ejs')`.
- Маршрут GET для idle-страницы (например `/` или `/idle` — по требованиям URL страницы ожидания). Рендер одного шаблона (например `idle.ejs`) с минимальным содержимым (заголовок «Waiting» или аналог).
- `app.listen(config.idlePort)` — сервер слушает порт из конфига. Экспорт функции `startIdleServer(config): Promise<http.Server>` или возврат сервера для последующего закрытия в тестах.

```typescript
// idle-server
export function startIdleServer(config: AppConfig): Promise<http.Server> {
  const app = express();
  app.set('views', config.idleViewsPath);
  app.set('view engine', 'ejs');
  app.get('/', (req, res) => res.render('idle'));
  return new Promise((resolve) => {
    const server = app.listen(config.idlePort, () => resolve(server));
  });
}
```

- Шаблон: создать каталог `views/` в корне (или путь из env), файл `idle.ejs` с минимальной разметкой (например заголовок и текст ожидания).

## 6. Оркестратор запуска приложений

**Файл (создать):** `src/modules/orchestrator/index.ts`.

- Контракт модуля приложения: объект с методом `start(): Promise<void>` (или функцией), который резолвится, когда приложение «ready». Например интерфейс `AppModule { name: string; start(): Promise<void> }`.
- Оркестратор принимает список таких модулей (порядок: Chrome, затем OBS). Цикл: для каждого модуля вызвать `start()`, дождаться разрешения промиса, затем перейти к следующему. Логировать старт каждого приложения.
- На этапе 001 реальных модулей Chrome/OBS нет: передать заглушки (модули, чей `start()` сразу резолвится с логом «Chrome module stub» / «OBS module stub») или пустой массив с комментарием, что порядок будет Chrome → OBS. Цель — проверить цепочку запуска и расширяемость.

```typescript
export interface AppModule {
  name: string;
  start(): Promise<void>;
}

export async function runOrchestrator(modules: AppModule[]): Promise<void> {
  for (const mod of modules) {
    logger.info(`Starting ${mod.name}`);
    await mod.start();
  }
}
```

## 7. Точка входа

**Файл (создать):** `src/index.ts`.

- Последовательность: загрузить конфиг через `getConfig()` (при ошибке валидации процесс завершится или throw); создать логгер; залогировать старт сервиса; вызвать проверку исполняемых Chrome/OBS; поднять idle-сервер (`startIdleServer`); вызвать оркестратор с заглушками (или пустым списком). Не запускать реальные процессы Chrome/OBS.
- Обработка ошибок: при невалидном конфиге или отсутствии Chrome/OBS — понятный вывод в лог и выход с кодом 1.

```typescript
async function main() {
  const config = getConfig();
  const logger = createLogger(config.logLevel);
  logger.info('Table server starting');
  checkChromeAndObs(config);
  await startIdleServer(config);
  await runOrchestrator([chromeStub, obsStub]); // заглушки
}
main().catch((err) => { console.error(err); process.exit(1); });
```

## 8. Переменные окружения (документация в коде или .env.example)

**Файл (создать/изменить):** `docs/env.md` или `.env.example` (без секретов), либо перечень в комментариях в `src/modules/config/validate.ts`.

- Зафиксировать имена: `CHROME_PATH`, `OBS_PATH`, `IDLE_PORT`, `IDLE_VIEWS_PATH`, `LOG_LEVEL`; опционально `DEVTOOLS_PORT`, `CHROME_READY_TIMEOUT`, `OBS_READY_TIMEOUT`. Пример значений для разработки.

## 9. Тесты

**Файлы (создать):** `test/config.test.ts` (или `src/modules/config/config.test.ts`), при необходимости `test/idle-server.test.ts`.

- **Конфиг:**
  - Happy path: заданы все обязательные env — `getConfig()` возвращает объект с ожидаемыми полями (число для порта, строки для путей).
  - Ошибки: отсутствует обязательная переменная — throw или exit; неверный формат порта (не число / вне диапазона) — понятная ошибка; неверный `LOG_LEVEL` — ошибка.
- **Idle-сервер (опционально):** поднять сервер на тестовом порту, GET по корневому пути возвращает 200 и HTML (или фрагмент страницы).

Запуск: через выбранный фреймворк (Jest, Node test runner и т.д.), скрипт `npm test`.

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `package.json` |
| Создать  | `tsconfig.json` |
| Создать  | `src/index.ts` |
| Создать  | `src/modules/config/types.ts` |
| Создать  | `src/modules/config/validate.ts` |
| Создать  | `src/modules/config/index.ts` |
| Создать  | `src/modules/logger/index.ts` |
| Создать  | `src/modules/startup-checks/index.ts` (или `src/utils/check-executables.ts`) |
| Создать  | `src/modules/idle-server/index.ts` |
| Создать  | `views/idle.ejs` (или путь из конфига) |
| Создать  | `src/modules/orchestrator/index.ts` |
| Создать  | `test/config.test.ts` |
| Создать  | `docs/env.md` или `.env.example` (по желанию) |

## Ссылки

- [analyze.md](./analyze.md) текущей задачи
- [description.md](./description.md) текущей задачи
- [docs/plan-execution.md](../../docs/plan-execution.md) — Этап 1
