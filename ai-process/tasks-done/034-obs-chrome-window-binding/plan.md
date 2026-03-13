# План реализации: Привязка Chrome-окна к источнику OBS при старте

При каждом подключении OBS WebSocket клиента автоматически определяем X11 Window ID запущенного Chrome через `xdotool` и передаём его в OBS через `setInputSettings`. Фича управляется полем `chromeSourceName` в конфиге OBS — если не задано, привязка не выполняется.

## 1. Добавить поле `chromeSourceName` в `ObsConfig`

**Файл (изменить):** `src/modules/config/types.ts`

Добавить опциональное поле после `outputSceneName` (строка 108):

```typescript
@IsOptional()
@IsString()
chromeSourceName?: string;
```

## 2. Читать `OBS_CHROME_SOURCE_NAME` из окружения

**Файл (изменить):** `src/modules/config/validate.ts`

В блоке `obs` (~строка 90) добавить строку после `outputSceneName`:

```typescript
chromeSourceName: getEnv('OBS_CHROME_SOURCE_NAME')?.trim() || undefined,
```

## 3. Создать модуль `chrome-window-bind.ts`

**Файл (создать):** `src/modules/obs-scenes/chrome-window-bind.ts`

Модуль экспортирует одну функцию `bindChromeWindow`. Логика:
1. Retry каждые 500 мс, таймаут 10 с.
2. На каждой итерации — `execFile('xdotool', ['search', '--onlyvisible', '--class', 'chrome'])`.
3. При успехе — берём первую строку stdout как XID.
4. Вызываем `client.setInputSettings(sourceName, { capture_window: xid })`.
5. Любую ошибку `setInputSettings` — перехватываем и логируем, не пробрасываем.
6. Если за 10 с XID не найден — логируем warn и возвращаемся без падения.

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ObsWebSocketClient } from './client';
import type { Logger } from '../logger';

const execFileAsync = promisify(execFile);

const RETRY_INTERVAL_MS = 500;
const TIMEOUT_MS = 10_000;

export async function bindChromeWindow(
  client: ObsWebSocketClient,
  sourceName: string,
  logger: Logger
): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync('xdotool', ['search', '--onlyvisible', '--class', 'chrome']));
    } catch {
      // xdotool возвращает код 1 если окон нет — ждём следующей итерации
      await sleep(RETRY_INTERVAL_MS);
      continue;
    }

    const xid = stdout.trim().split('\n')[0];
    if (!xid) {
      await sleep(RETRY_INTERVAL_MS);
      continue;
    }

    logger.info(`obs_chrome_bind action=found xid=${xid} source=${sourceName}`);
    try {
      await client.setInputSettings(sourceName, { capture_window: xid });
      logger.info(`obs_chrome_bind action=bound xid=${xid} source=${sourceName}`);
    } catch (err) {
      logger.warn(
        `obs_chrome_bind action=set_input_settings_failed source=${sourceName} error=${err instanceof Error ? err.message : String(err)}`
      );
    }
    return;
  }

  logger.warn(`obs_chrome_bind action=timeout source=${sourceName} timeout_ms=${TIMEOUT_MS}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

## 4. Расширить `onConnected` в `createObsScenesService`

**Файл (изменить):** `src/modules/obs-scenes/index.ts`

Текущий `onConnected` строится только если задан `projectorMonitorName`. Нужно переработать логику так, чтобы callback создавался также при наличии `chromeSourceName`, и оба шага выполнялись независимо.

Импорт добавить в начало файла:
```typescript
import { bindChromeWindow } from './chrome-window-bind';
```

Заменить блок построения `onConnected` (строки 28–87) на:

```typescript
const { projectorMonitorName, projectorSceneName, chromeSourceName } = config;

const hasProjector = projectorMonitorName != null;
const hasChromeBind = chromeSourceName != null;

const onConnected =
  hasProjector || hasChromeBind
    ? async () => {
        if (hasProjector) {
          // ... существующий блок логики проектора без изменений ...
        }

        if (hasChromeBind) {
          await bindChromeWindow(client, chromeSourceName!, logger);
        }
      }
    : undefined;
```

Существующая логика проектора остаётся **без изменений** — просто оборачивается в `if (hasProjector)`.

## 5. Добавить тесты

**Файл (изменить):** `test/obs-scenes.test.ts`

Сценарии:
- **Happy path:** `xdotool` возвращает XID на первой итерации → `setInputSettings` вызван с правильными аргументами.
- **Retry:** первые N вызовов `xdotool` завершаются с ошибкой, затем успех → `setInputSettings` вызван.
- **Таймаут:** `xdotool` всегда падает → функция завершается без исключения, залогировано warn.
- **Ошибка `setInputSettings`:** OBS возвращает ошибку → функция завершается без исключения, залогировано warn.
- **Множественные XID:** `xdotool` возвращает несколько строк → берётся первая.
- **`chromeSourceName` не задан:** `bindChromeWindow` не вызывается совсем.

Пример:
```typescript
describe('bindChromeWindow', () => {
  it('вызывает setInputSettings с первым XID', async () => {
    const execFileMock = jest.fn().mockResolvedValue({ stdout: '12345\n67890\n' });
    const setInputSettings = jest.fn().mockResolvedValue(undefined);
    // ... подменить execFile, вызвать bindChromeWindow, проверить setInputSettings
    expect(setInputSettings).toHaveBeenCalledWith('Chrome Source', { capture_window: '12345' });
  });
});
```

## 6. Обновить документацию

**Файл (изменить):** `docs/requirements/obs_chrome_window_binding.md` или создать `docs/obs-chrome-setup.md`

Добавить раздел с инструкцией для оператора:
- Как создать источник **Window Capture (Xcomposite)** в нужной сцене OBS.
- Что имя источника должно совпадать с `OBS_CHROME_SOURCE_NAME` в `.env`.
- Что привязка к окну происходит автоматически при каждом старте/переподключении сервиса.
- Что без этого шага источник останется пустым.

---

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Создать  | `src/modules/obs-scenes/chrome-window-bind.ts` |
| Изменить | `src/modules/obs-scenes/index.ts` |
| Изменить | `test/obs-scenes.test.ts` |
| Изменить | `docs/requirements/obs_chrome_window_binding.md` |

## Ссылки
- [analyze.md](./analyze.md)
- [description.md](./description.md)
