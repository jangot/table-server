# План реализации: разделение основной и управляющих сцен OBS (main на проекторе, output для переключения)

Цель: обеспечить постоянный вывод одной проекторной сцены (например, `main`) на указанный монитор OBS, при этом все пользовательские переключения через веб‑интерфейс и Telegram‑бот должны влиять только на управляющие сцены (`output`/`input`, `backup`, `default` и т.п.), не снимая базовую сцену с проектора. Роль сцен и имя проекторной сцены должны задаваться конфигурацией (JSON‑конфиг + переменные окружения), с сохранением обратной совместимости и мягкой обработкой ошибок.

## 1. Расширить конфиг OBS и переменные окружения

**Файл (изменить):** `src/modules/config/types.ts`  
**Файл (изменить):** `src/modules/config/validate.ts`  
**Файл (создать/изменить):** `.env.example`

Задача этого шага — ввести опциональное имя проекторной сцены и зафиксировать его в типах и валидации окружения. Одновременно нужно подготовить пример `.env.example`, чтобы все используемые переменные окружения (включая новые) всегда были задокументированы.

### 1.1. Добавить поле проекторной сцены в `ObsConfig`

В `ObsConfig` добавить новое опциональное строковое поле `projectorSceneName?: string`, аналогично уже существующему `projectorMonitorName`:

```typescript
export class ObsConfig {
  // ...

  @IsOptional()
  @IsString()
  projectorMonitorName?: string;

  @IsOptional()
  @IsString()
  projectorSceneName?: string;
}
```

### 1.2. Проброс переменной окружения `OBS_PROJECTOR_SCENE_NAME`

В `validateEnv()` считать новую переменную окружения и пробросить её в `ObsConfig`:

```typescript
obs: plainToInstance(ObsConfig, {
  path: getEnv('OBS_PATH')?.trim(),
  readyTimeout: parseOptionalInt(getEnv('OBS_READY_TIMEOUT')),
  profilePath: getEnv('OBS_PROFILE_PATH')?.trim() || undefined,
  host: getEnv('OBS_HOST')?.trim(),
  port: parseOptionalInt(getEnv('OBS_PORT')),
  password: getEnv('OBS_PASSWORD'),
  projectorMonitorName: getEnv('OBS_PROJECTOR_MONITOR_NAME')?.trim() || undefined,
  projectorSceneName: getEnv('OBS_PROJECTOR_SCENE_NAME')?.trim() || undefined,
}),
```

Переменная `OBS_PROJECTOR_SCENE_NAME` должна быть **опциональной**: при её отсутствии применяется fallback‑логика (см. шаг 2). При этом в документации явно описать, что рекомендуется задавать её явно (`OBS_PROJECTOR_SCENE_NAME=main`).

### 1.3. Обновить/создать `.env.example` и зафиксировать новые переменные

В корне проекта завести файл `.env.example` (если его нет) и перечислить там все используемые переменные окружения без секретных значений. Обязательно включить:

```bash
CHROME_PATH=/usr/bin/google-chrome
CHROME_USER_DATA_DIR=/path/to/chrome-data
CHROME_WINDOW_MODE=app
CHROME_WINDOW_WIDTH=1920
CHROME_WINDOW_HEIGHT=1080
CHROME_WINDOW_POSITION_X=0
CHROME_WINDOW_POSITION_Y=0
CHROME_DEVICE_SCALE_FACTOR=1

OBS_PATH=/usr/bin/obs
OBS_HOST=localhost
OBS_PORT=4455
OBS_PASSWORD=changeme
OBS_PROJECTOR_MONITOR_NAME=HDMI-A-3
OBS_PROJECTOR_SCENE_NAME=main

IDLE_PORT=3000
IDLE_VIEWS_PATH=./views
LOG_LEVEL=info

TELEGRAM_BOT_TOKEN=your-telegram-token
ALLOWED_TELEGRAM_USERS=your-telegram-username

# Optional
SCENES_CONFIG_PATH=./config/scenes.json
DEVTOOLS_PORT=9222
CHROME_READY_TIMEOUT=30000
OBS_READY_TIMEOUT=10000
```

В описании к задаче/код‑ревью явно подчеркнуть, что **каждая новая переменная окружения обязательно должна добавляться в `.env.example`**, а реальные значения хранятся только в приватном `.env`.

## 2. Изменить логику выбора сцены для OBS projector

**Файл (изменить):** `src/modules/obs-scenes/index.ts`

Сейчас проекторная сцена выбирается как первая сцена с именем, начинающимся на `output.`. Нужно заменить это на использование явного имени проекторной сцены из конфига с аккуратным fallback‑поведением.

### 2.1. Ввести алгоритм выбора проекторной сцены

Предлагаемый порядок:

1. Если `config.projectorSceneName` задан:
   - найти в списке сцен OBS сцену с точным совпадением `sceneName === projectorSceneName`;
   - при успехе использовать её для `openSourceProjector`;
   - при отсутствии — залогировать предупреждение и перейти к пункту 2 (fallback).
2. Если `projectorSceneName` не задан или сцена не найдена:
   - попробовать старое поведение: взять первую сцену с `sceneName.startsWith('output.')`;
   - при успехе — использовать её и явно залогировать, что используется fallback;
   - при неудаче — залогировать предупреждение и **не запускать projector**, чтобы не делать неожиданный вывод.

Пример целевой логики внутри `onConnected`:

```typescript
const { projectorMonitorName, projectorSceneName } = config;

const onConnected =
  projectorMonitorName != null
    ? async () => {
        // ... поиск монитора, как сейчас ...

        let scenes: Array<{ sceneName: string }>;
        try {
          ({ scenes } = await client.getSceneList());
        } catch (err) {
          logger.warn(`obs_projector action=get_scenes error=${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        if (scenes.length === 0) {
          logger.warn('obs_projector action=open status=skip reason=empty_scene_list');
          return;
        }

        let projectorScene =
          projectorSceneName != null
            ? scenes.find((s) => s.sceneName === projectorSceneName) ?? null
            : null;

        if (!projectorScene) {
          projectorScene = scenes.find((s) => s.sceneName.startsWith('output.')) ?? null;
          if (!projectorScene) {
            logger.warn(
              `obs_projector action=open status=skip reason=scene_not_found projectorSceneName=${projectorSceneName ?? ''}`
            );
            return;
          }
          logger.warn(
            `obs_projector action=open status=fallback reason=projector_scene_not_found fallback_scene=${projectorScene.sceneName}`
          );
        }

        await client.openSourceProjector(projectorScene.sceneName, monitor.monitorIndex);
        logger.info(
          `obs_projector action=open scene=${projectorScene.sceneName} monitor_name=${projectorMonitorName} monitor_index=${monitor.monitorIndex}`
        );
      }
    : undefined;
```

В логах важно явно фиксировать, когда используется fallback, чтобы можно было увидеть неправильную конфигурацию.

## 3. Ввести понятие ролей сцен в сервисе obs‑сцен

**Файл (изменить):** `src/modules/obs-scenes/types.ts`  
**Файл (изменить):** `src/modules/obs-scenes/scenes-service.ts`  
**Файл (изменить при необходимости):** `src/modules/obs-scenes/scenes-config.ts`

Нужно договориться о том, как в JSON‑конфиге сцен описываются роли:

- `type: "main"` — проекторная сцена, не переключается пользователем, но может отображаться как статус;
- `type: "output"` — сцена‑компоновщик, доступна для переключения;
- `type: "input"` — входные сцены, также могут быть доступны для переключения;
- дополнительные типы `backup`, `default` уже используются и должны оставаться валидными.

### 3.1. Явно задокументировать допустимые типы (на уровне комментариев/доков)

Интерфейсы `SceneConfigEntry` и `SceneForDisplay` остаются с `type?: string`, чтобы не ломать существующие JSON‑конфиги. В комментариях (и в `docs/requirements`) описать ожидаемые значения типа:

```typescript
export interface SceneConfigEntry {
  name: string;
  /** Optional human-readable title for UI. */
  title?: string;
  /**
   * Optional role/type of the scene (used by UI and Telegram):
   * - "main": projector scene (not switchable by user)
   * - "output": aggregate/output scene (switchable)
   * - "input": input scene (switchable)
   * - "backup" | "default": special safe-state scenes
   */
  type?: string;
  enabled?: boolean;
}
```

### 3.2. Добавить helper для фильтрации сцен, доступных для переключения

В `scenes-service.ts` добавить внутреннюю функцию, определяющую, может ли сцена быть включена в список для UI/бота:

```typescript
function isSwitchableScene(entry: SceneConfigEntry | undefined): boolean {
  if (entry?.enabled === false) return false;
  if (!entry?.type) return true; // backward compatibility: no type => switchable
  if (entry.type === 'main') return false;
  return true;
}
```

Метод `getScenesForDisplay` должен:

1. загрузить список сцен из OBS;
2. сопоставить с конфигом (как сейчас);
3. вернуть только те сцены, которые `isSwitchableScene(entry)` считает переключаемыми;
4. при этом сохранить в `SceneForDisplay` `type` и другие поля, чтобы UI/бот могли при желании отобразить тип.

Пример целевой реализации:

```typescript
async getScenesForDisplay(): Promise<SceneForDisplay[]> {
  try {
    const { scenes } = await client.getSceneList();
    const names = scenes.map((s) => s.sceneName).filter(Boolean);
    const configMap = new Map((config.scenesConfig ?? []).map((e) => [e.name, e]));

    const result: SceneForDisplay[] = [];

    for (const name of names) {
      const entry = configMap.get(name);
      if (!isSwitchableScene(entry)) continue;

      const out: SceneForDisplay = { name, enabled: entry?.enabled ?? true };
      if (entry?.title !== undefined) out.title = entry.title;
      if (entry?.type !== undefined) out.type = entry.type;
      result.push(out);
    }

    return result;
  } catch (err) {
    logger.warn(`obs_scenes action=get_scenes_for_display error=${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
```

Если потребуется, `scenes-config.ts` можно оставить без изменений: оно уже пропускает произвольные значения `type` и `enabled`.

## 4. Адаптировать web‑интерфейс `/obs/scenes` под роли сцен

**Файл (изменить):** `src/modules/idle-server/index.ts`  
**Файл (изменить):** `views/obs-scenes.ejs`

Цель — сделать так, чтобы веб‑интерфейс показывал только переключаемые сцены и не позволял снять с проектора базовую `main`.

### 4.1. Передавать в шаблон уже отфильтрованный список

После изменений в `ObsScenesService.getScenesForDisplay()` список из `idle-server` уже будет содержать только сцены, доступные для переключения, поэтому дополнительный фильтр по `enabled` в шаблоне можно упростить или оставить как дополнительную защиту.

Важно **не** вызывать `/obs/scene` для сцен, которые представляют собой проекторную `main`. Поскольку такая сцена теперь не попадёт в `getScenesForDisplay`, текущий код `handleSceneSwitch` можно оставить без изменений.

### 4.2. Уточнить отображение текущей сцены и спец‑кнопок

В шаблоне `views/obs-scenes.ejs`:

- оставить отображение `currentScene` как есть — это помогает диагностике;
- кнопки сцен рендерить по списку `scenes` (уже фильтрованному);
- опционально, можно помечать тип сцены, если он задан, например:

```ejs
<%= scene.title || scene.name %>
<% if (scene.type) { %>
  (<%= scene.type %>)
<% } %>
```

Логика спец‑кнопок `Backup`/`Default` (`/obs/scene/backup`, `/obs/scene/default`) остаётся прежней, но на уровне конфигурации сцен стоит убедиться, что сцены `backup` и `default` не помечены типом `main`.

## 5. Ограничить Telegram‑команды только управляющими сценами

**Файл (изменить):** `src/modules/telegram-bot/handlers.ts`

Цель — чтобы Telegram‑бот оперировал только сценами, которые доступны для переключения (output/input/backup/default), и не мог снять с проектора основную сцену `main`.

### 5.1. Использовать тот же фильтр, что и UI

- `handleScenes` уже использует `getScenesForDisplay()`, после доработки сервиса он будет видеть только переключаемые сцены — дополнительной фильтрации не требуется.

### 5.2. Валидация для команды `/scene <name>`

Для `handleScene` стоит ввести проверку: если сцена не входит в список переключаемых, команда должна быть отклонена с понятным сообщением.

Пример целевого поведения:

```typescript
export async function handleScene(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  // ... авторизация и проверка deps.obsScenes ...
  const sceneName = ctx.message.text.replace(/^\s*\/scene\s*/i, '').trim();
  if (!sceneName) {
    await ctx.reply('Использование: /scene <name>').catch(() => {});
    return;
  }

  const scenes = await deps.obsScenes.getScenesForDisplay();
  const isAllowed = scenes.some((s) => s.name === sceneName);
  if (!isAllowed) {
    await ctx.reply(`Сцена недоступна для переключения: ${sceneName}`).catch(() => {});
    return;
  }

  try {
    await deps.obsScenes.setScene(sceneName);
    // ...
  } catch (err) {
    // существующая обработка SceneNotFoundError и прочих ошибок
  }
}
```

Команды `/backup` и `/default` продолжают использовать `switchToNamedScene('backup'|'default', ...)`, что соответствует требованиям; ответственность за то, чтобы эти сцены не были `main`, лежит на конфигурации.

## 6. Обновить требования и документацию по сценам OBS

**Файл (изменить):** `docs/requirements/obs-scene-requirements.md`

Расширить разделы про конфигурацию сцен и окружения:

- добавить описание ролей сцен (`main`, `output`, `input`, `backup`, `default`) и их назначение;
- описать, что:
  - `main` — проекторная сцена, всегда держится на проекторе и не переключается пользователем;
  - `output`/`input` — управляющие сцены, которыми оперируют UI и Telegram;
- в разделе окружения добавить `OBS_PROJECTOR_SCENE_NAME` с примером:

```text
OBS_PROJECTOR_SCENE_NAME=main
```

Отдельно указать, что все переменные окружения (включая `OBS_PROJECTOR_SCENE_NAME` и `SCENES_CONFIG_PATH`) должны быть отражены в `.env.example`, а приватный `.env` не коммитится и уже добавлен в `.gitignore`.

## 7. Тесты для новой конфигурации и логики сцен

**Файл (изменить):** `test/config.test.ts`  
**Файл (создать):** `test/obs-scenes-service.test.ts` (или аналог рядом с модулем)

### 7.1. Расширить `config.test.ts` под новую переменную окружения

- добавить в `after`‑cleanup очистку `OBS_PROJECTOR_SCENE_NAME`;
- добавить тест, который проверяет, что при установке `OBS_PROJECTOR_SCENE_NAME` значение попадает в `config.obs.projectorSceneName`:

```typescript
it('OBS_PROJECTOR_SCENE_NAME is passed through when set', () => {
  resetConfigForTesting();
  setEnv(REQUIRED);
  process.env.OBS_PROJECTOR_SCENE_NAME = 'main';
  const cfg = validateEnv();
  assert.strictEqual(cfg.obs.projectorSceneName, 'main');
  unsetEnv(['OBS_PROJECTOR_SCENE_NAME']);
});
```

### 7.2. Тесты для разделения проекторной и управляющих сцен

В новом тест‑файле для сервиса сцен (можно замокать `ObsWebSocketClient`):

- протестировать, что `getScenesForDisplay()`:
  - исключает сцены с `type: "main"`;
  - исключает сцены с `enabled: false`;
  - оставляет сцены без `type` (backward compatibility);
  - корректно передаёт `title` и `type` в `SceneForDisplay`.
- дополнительно можно протестировать:
  - поведение `handleScene` при попытке переключить сцену, не входящую в `getScenesForDisplay()` (ответ с текстом об отказе);
  - (по возможности) логику выбора проекторной сцены в `createObsScenesService` с разными комбинациями `OBS_PROJECTOR_SCENE_NAME` и наличия сцен в OBS (через мок‑клиент).

## 8. Сводка файлов

| Действие  | Файл                                                     |
|-----------|----------------------------------------------------------|
| Изменить  | `src/modules/config/types.ts`                            |
| Изменить  | `src/modules/config/validate.ts`                         |
| Создать   | `.env.example`                                          |
| Изменить  | `src/modules/obs-scenes/index.ts`                        |
| Изменить  | `src/modules/obs-scenes/types.ts`                        |
| Изменить  | `src/modules/obs-scenes/scenes-service.ts`              |
| Изменить  | `src/modules/idle-server/index.ts`                       |
| Изменить  | `views/obs-scenes.ejs`                                  |
| Изменить  | `src/modules/telegram-bot/handlers.ts`                   |
| Изменить  | `docs/requirements/obs-scene-requirements.md`           |
| Изменить  | `test/config.test.ts`                                   |
| Создать   | `test/obs-scenes-service.test.ts`                       |

## Ссылки

- `ai-process/tasks/030-obs-main-projector-and-output-scenes/analyze.md`

