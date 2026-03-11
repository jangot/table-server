# План реализации: Опциональный конфиг сцен для UI

Добавить опциональную переменную окружения `SCENES_CONFIG_PATH` и чтение JSON-конфига сцен (name, title, type, enabled) для обогащения списка сцен из OBS при отображении в UI. Источник истины — OBS; отсутствие конфига или ошибки чтения не приводят к падению приложения.

## 1. Типы конфига сцен и сцены для отображения

**Файл (изменить):** `src/modules/obs-scenes/types.ts`

Добавить типы для одной записи конфига (§5 требований) и для сцены, возвращаемой в UI:

- `SceneConfigEntry` — объект из JSON: `name` (обязательно), `title`, `type`, `enabled` (все опционально).
- `SceneForDisplay` — сцена для UI: `name`, `title?`, `type?`, `enabled?` (при отсутствии title использовать name, enabled по умолчанию true).

Расширить интерфейс `ObsScenesService`: добавить метод `getScenesForDisplay(): Promise<SceneForDisplay[]>`.

```typescript
/** One entry from scenes config JSON (§5). */
export interface SceneConfigEntry {
  name: string;
  title?: string;
  type?: string;
  enabled?: boolean;
}

/** Scene for UI: name from OBS, optional title/type/enabled from config. */
export interface SceneForDisplay {
  name: string;
  title?: string;
  type?: string;
  enabled?: boolean;
}

export interface ObsScenesService {
  getScenes(): Promise<string[]>;
  getScenesForDisplay(): Promise<SceneForDisplay[]>;
  getCurrentScene(): Promise<string | null>;
  setScene(name: string): Promise<void>;
}
```

## 2. Чтение и парсинг конфига сцен

**Файл (создать):** `src/modules/obs-scenes/scenes-config.ts`

Реализовать синхронную загрузку конфига: при `path === undefined` или пустой строке возвращать `null`. При переданном пути — читать файл через `fs.readFileSync`, парсить JSON, проверять что это массив объектов с полем `name` (остальные поля опционально). При любой ошибке (файл не найден, невалидный JSON, не массив, элементы без name) — возвращать `null`, не бросать исключение. Экспортировать тип/интерфейс записи из types.ts и функцию `loadScenesConfigSync(path: string | undefined): SceneConfigEntry[] | null`.

```typescript
import * as fs from 'node:fs';
import type { SceneConfigEntry } from './types';

export function loadScenesConfigSync(path: string | undefined): SceneConfigEntry[] | null {
  if (path === undefined || path.trim() === '') return null;
  try {
    const raw = fs.readFileSync(path, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    const result: SceneConfigEntry[] = [];
    for (const item of data) {
      if (item != null && typeof item === 'object' && typeof item.name === 'string') {
        result.push({
          name: item.name,
          title: typeof item.title === 'string' ? item.title : undefined,
          type: typeof item.type === 'string' ? item.type : undefined,
          enabled: typeof item.enabled === 'boolean' ? item.enabled : undefined,
        });
      }
    }
    return result;
  } catch {
    return null;
  }
}
```

## 3. Опциональная переменная SCENES_CONFIG_PATH в конфиге

**Файл (изменить):** `src/modules/config/types.ts`

В класс `AppConfig` добавить опциональное поле `scenesConfigPath?: string` (аналогично `lastUrlStatePath`). Декораторы: `@IsOptional()`, `@IsString()`.

**Файл (изменить):** `src/modules/config/validate.ts`

В объект `plain` добавить поле `scenesConfigPath: getEnv('SCENES_CONFIG_PATH')?.trim() || undefined`. Не добавлять валидацию обязательности — при отсутствии переменной остаётся `undefined`.

```typescript
// In plain:
scenesConfigPath: getEnv('SCENES_CONFIG_PATH')?.trim() || undefined,
```

Убедиться, что в `AppConfig` в types.ts есть соответствующее свойство с декораторами.

## 4. Обогащение списка сцен в сервисе

**Файл (изменить):** `src/modules/obs-scenes/scenes-service.ts`

- В `ObsScenesServiceConfig` добавить опциональное поле `scenesConfig: SceneConfigEntry[] | null`.
- Реализовать `getScenesForDisplay()`: вызвать `client.getSceneList()`, для каждой сцены из OBS найти запись в `scenesConfig` по `name` и собрать объект `SceneForDisplay` (name из OBS, title/type/enabled из конфига; если записи нет — только name, enabled по умолчанию true). При ошибке от клиента — логировать и возвращать пустой массив (как в getScenes).
- Импортировать тип `SceneConfigEntry` из `./types`.

```typescript
export interface ObsScenesServiceConfig {
  client: ObsWebSocketClient;
  logger: Logger;
  scenesConfig?: SceneConfigEntry[] | null;
}

// In implementation:
async getScenesForDisplay(): Promise<SceneForDisplay[]> {
  try {
    const { scenes } = await client.getSceneList();
    const names = scenes.map((s) => s.sceneName).filter(Boolean);
    const configMap = new Map(
      (config.scenesConfig ?? []).map((e) => [e.name, e])
    );
    return names.map((name) => {
      const entry = configMap.get(name);
      return {
        name,
        title: entry?.title,
        type: entry?.type,
        enabled: entry?.enabled ?? true,
      };
    });
  } catch (err) { /* same as getScenes */ return []; }
}
```

## 5. Фабрика сервиса: передача пути конфига и загрузка

**Файл (изменить):** `src/modules/obs-scenes/index.ts`

- Добавить опциональный третий аргумент `scenesConfigPath?: string` (или передавать опции объектом: `createObsScenesService(obsConfig, logger, { scenesConfigPath })`). Проще — добавить параметр `scenesConfigPath?: string` после `logger`.
- Перед вызовом `createObsScenesServiceImpl` вызывать `loadScenesConfigSync(scenesConfigPath)` и передавать результат в конфиг имплементации как `scenesConfig`.
- Экспортировать при необходимости типы `SceneConfigEntry`, `SceneForDisplay` из types.

```typescript
import { loadScenesConfigSync } from './scenes-config';

export function createObsScenesService(
  config: ObsConfig,
  logger: Logger,
  scenesConfigPath?: string
): ObsScenesService | null {
  // ... existing check ...
  const scenesConfig = loadScenesConfigSync(scenesConfigPath);
  return createObsScenesServiceImpl({ client, logger, scenesConfig });
}
```

## 6. Точка входа: передача пути в фабрику

**Файл (изменить):** `src/index.ts`

При вызове `createObsScenesService` передать третий аргумент: `config.scenesConfigPath` (из `getConfig()`). Убедиться, что тип `AppConfig` содержит `scenesConfigPath` после изменений в шаге 3.

```typescript
const obsScenesService = createObsScenesService(config.obs, logger, config.scenesConfigPath);
```

## 7. Тесты

**Файл (изменить):** `test/obs-scenes.test.ts`

Сценарии:

- **loadScenesConfigSync** (новый describe или в отдельном файле `test/obs-scenes-scenes-config.test.ts`): путь `undefined` или пустая строка → `null`; несуществующий файл → `null`; валидный JSON-массив с name/title/type/enabled → массив записей; невалидный JSON или не массив → `null`; элемент без `name` пропускается или массив пустой. Использовать временный файл (например `fs.writeFileSync` в os.tmpdir) для валидного кейса.
- **getScenesForDisplay без конфига**: `scenesConfig: null` — результат совпадает с именами из OBS, у каждой сцены `enabled: true`, title/type не заданы.
- **getScenesForDisplay с конфигом**: передать `scenesConfig` с записью для одной из сцен из мока — проверить, что в результате есть title, type, enabled из конфига; для сцены без записи в конфиге — только name, enabled true.
- **getScenes не меняется**: поведение `getScenes()` остаётся прежним (массив имён из OBS), тесты не ломаются.

При необходимости добавить тест для validate: наличие `scenesConfigPath` в конфиге при заданной `SCENES_CONFIG_PATH` (через process.env в тесте).

## Сводка файлов

| Действие | Файл |
|----------|------|
| Создать  | `src/modules/obs-scenes/scenes-config.ts` |
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `src/modules/obs-scenes/types.ts` |
| Изменить | `src/modules/obs-scenes/scenes-service.ts` |
| Изменить | `src/modules/obs-scenes/index.ts` |
| Изменить | `src/index.ts` |
| Изменить | `test/obs-scenes.test.ts` (при необходимости новый `test/obs-scenes-scenes-config.test.ts`) |

## Ссылки

- [analyze.md](./analyze.md) текущей задачи
- Требования: docs/requirements/obs-scene-requirements.md (§5, §14)
