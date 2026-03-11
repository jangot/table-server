# План реализации: Тесты зависают после запуска OBS

Тесты в `test/obs.test.ts` зависают из-за двух причин: глобальное состояние `performRestartRef` загрязняется между тестами, что приводит к реальному запуску OBS, и дочерний процесс OBS удерживает event loop Node.js из-за отсутствия `proc.unref()`. Задача — устранить обе причины минимальными изменениями без потери покрытия.

---

## 1. Добавить `proc.unref()` после spawn в `launch.ts`

**Файл (изменить):** `src/modules/obs/launch.ts`

Без `proc.unref()` дочерний процесс OBS удерживает event loop Node.js. Тест-раннер не может завершиться, пока активен хотя бы один child process с `ref`. OBS — фоновый daemon, не требующий удержания event loop.

```typescript
export async function launchObs(
  obsPath: string,
  args: string[],
  timeoutMs: number,
  logger: Logger
): Promise<void> {
  obsProcess = spawn(obsPath, args, { stdio: 'ignore', shell: false });
  const proc = obsProcess;
  proc.unref(); // <-- добавить после spawn, до return new Promise(...)

  return new Promise((resolve, reject) => {
    // ... остальной код без изменений
  });
}
```

**Место:** строка 27 в `src/modules/obs/launch.ts`, сразу после `const proc = obsProcess;`.

---

## 2. Переместить тест `restartObs` перед `createObsModule` в `obs.test.ts`

**Файл (изменить):** `test/obs.test.ts`

Причина зависания: `createObsModule(config, logger)` (строка 118) устанавливает модуль-уровневую глобальную переменную `performRestartRef = performRestart`. Node.js кеширует модули — это состояние сохраняется между тестами. Когда после этого запускается тест `restartObs` (строка 134), он вызывает `restartObs()`, который видит `performRestartRef !== null` и запускает реальный OBS.

Node test runner выполняет `describe` блоки **в порядке объявления**. Решение — переместить блок `describe('restartObs', ...)` **перед** `describe('createObsModule', ...)`, пока `performRestartRef === null`.

```typescript
// БЫЛО (порядок в файле):
describe('createObsModule', () => { ... });   // устанавливает performRestartRef
describe('isObsAlive', () => { ... });
describe('restartObs', () => { ... });        // вызывает performRestartRef → реальный OBS!

// СТАЛО (порядок в файле):
describe('restartObs', () => { ... });        // performRestartRef === null → no-op
describe('createObsModule', () => { ... });   // устанавливает performRestartRef
describe('isObsAlive', () => { ... });
```

Конкретно: блок `describe('restartObs', ...)` (строки 130–136) перенести выше блока `describe('createObsModule', ...)` (строки 114–122). Всё остальное без изменений.

---

## 3. Защитить `client.ts` от race condition при `disconnect()` во время подключения

**Файл (изменить):** `src/modules/obs-scenes/client.ts`

После вызова `disconnect()` флаг `disconnected = true`, но в `tryConnect()` уже идёт асинхронный `socket.connect().then(...)`. Если подключение завершилось успехом уже после `disconnect()`, callback `.then()` не проверяет `disconnected` — и не вызывает `scheduleReconnect()`, но и не закрывает новый `obs`. Добавить проверку в `.then()`:

```typescript
socket
  .connect(url, password)
  .then(() => {
    if (disconnected) {                     // <-- добавить
      void socket.disconnect().catch(() => {}); // закрыть сразу
      return;
    }
    reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
    if (isFirstConnection) {
      logger.info('obs_connection status=connected');
      isFirstConnection = false;
    } else {
      logger.info('obs_connection status=reconnected');
    }
  })
  .catch((err: Error) => {
    obs = null;
    logger.warn(`obs_connection status=connect_failed message=${err?.message ?? 'unknown'}`);
    scheduleReconnect();
  });
```

---

## 4. Тесты

Новых тестовых файлов создавать не нужно — существующие тесты должны проходить корректно после исправлений.

**Файл (изменить):** `test/obs.test.ts`

Проверить сценарии после переноса порядка:
- `restartObs` при `performRestartRef === null` → не вызывает spawn, не зависает ✓
- `createObsModule` создаёт модуль с name='OBS' и функцией start ✓
- `isObsAlive` возвращает false когда процесс не запущен ✓

**Файл (изменить):** `test/obs-scenes.test.ts`

Проверить сценарии:
- Тест создания сервиса с конфигом → создаёт объект, `after()` вызывает `disconnect()`, таймеры очищены ✓
- Тест с mock клиентом — все остальные тесты уже используют мок и не затрагивают реальный WebSocket ✓

---

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/obs/launch.ts` |
| Изменить | `src/modules/obs-scenes/client.ts` |
| Изменить | `test/obs.test.ts` |

---

## Ссылки
- [analyze.md](./analyze.md)
