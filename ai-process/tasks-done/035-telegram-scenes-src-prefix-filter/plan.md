# План реализации: Фильтрация сцен по префиксу `src.` в Telegram-боте

Изменения затрагивают два файла: обработчики команд `handlers.ts` и тесты `telegram-bot.test.ts`. `ObsScenesService` не меняется. Задача сводится к фильтрации и маппингу имён исключительно на уровне хендлеров.

## 1. Обновить `handleScenes` в `handlers.ts`

**Файл (изменить):** `src/modules/telegram-bot/handlers.ts` (строки 152–159)

Текущий код:
```typescript
const scenes = await deps.obsScenes.getScenesForDisplay();
if (scenes.length === 0) {
  await ctx.reply('Сцены не найдены.').catch(() => {});
  return;
}
const lines = scenes.map((s) => `• ${s.title ?? s.name}`);
```

Новый код:
```typescript
const allScenes = await deps.obsScenes.getScenesForDisplay();
const scenes = allScenes.filter((s) => s.name.startsWith('src.'));
if (scenes.length === 0) {
  await ctx.reply('Сцены не найдены.').catch(() => {});
  return;
}
const lines = scenes.map((s) => `• ${s.title ?? s.name.slice(4)}`);
```

Изменения:
- Фильтруем только сцены с именем `src.*`
- При форматировании: если `title` задан — используем его, иначе берём `s.name.slice(4)` (убираем `src.`)

## 2. Обновить `handleScene` в `handlers.ts`

**Файл (изменить):** `src/modules/telegram-bot/handlers.ts` (строки 180–203)

Текущий код:
```typescript
const sceneName = ctx.message.text.replace(/^\s*\/scene\s*/i, '').trim();
if (!sceneName) { ... }
try {
  const scenes = await deps.obsScenes.getScenesForDisplay();
  const isAllowed = scenes.some((s) => s.name === sceneName);
  if (!isAllowed) {
    await ctx.reply(`Сцена недоступна для переключения: ${sceneName}`).catch(() => {});
    return;
  }
  await deps.obsScenes.setScene(sceneName);
  ...
  await ctx.reply(`Сцена переключена: ${sceneName}`).catch(() => {});
} catch (err) {
  if (err instanceof SceneNotFoundError) {
    await ctx.reply(`Сцена не найдена: ${err.sceneName}`).catch(() => {});
  }
  ...
}
```

Новый код:
```typescript
const inputName = ctx.message.text.replace(/^\s*\/scene\s*/i, '').trim();
if (!inputName) { ... }  // текст сообщения не меняется
try {
  const fullName = `src.${inputName}`;
  const scenes = await deps.obsScenes.getScenesForDisplay();
  const isAllowed = scenes.some((s) => s.name === fullName);
  if (!isAllowed) {
    await ctx.reply(`Сцена недоступна для переключения: ${inputName}`).catch(() => {});
    return;
  }
  await deps.obsScenes.setScene(fullName);
  deps.logger.info('Telegram bot: remote command processed', { type: 'scene', scene: fullName, userId: from.id });
  await ctx.reply(`Сцена переключена: ${inputName}`).catch(() => {});
} catch (err) {
  if (err instanceof SceneNotFoundError) {
    const displayName = err.sceneName.startsWith('src.') ? err.sceneName.slice(4) : err.sceneName;
    await ctx.reply(`Сцена не найдена: ${displayName}`).catch(() => {});
  }
  ...
}
```

Изменения:
- Переменная переименована в `inputName` — это короткое имя от пользователя
- `fullName = 'src.' + inputName` — используется для поиска и переключения
- Сообщения пользователю (`недоступна`, `переключена`, `не найдена`) показывают короткое имя
- В логер пишем полное имя (`fullName`) для отладки

## 3. Обновить фикстуру `makeObsScenes` в тестах

**Файл (изменить):** `test/telegram-bot.test.ts` (строки 25–38)

Текущий код:
```typescript
function makeObsScenes(overrides?: Partial<ObsScenesService>): ObsScenesService {
  return {
    getScenes: async () => ['scene1', 'scene2'],
    getScenesForDisplay: async (): Promise<SceneForDisplay[]> => [
      { name: 'scene1', title: 'Scene One' },
      { name: 'scene2' },
    ],
    ...
  };
}
```

Новый код:
```typescript
function makeObsScenes(overrides?: Partial<ObsScenesService>): ObsScenesService {
  return {
    getScenes: async () => ['src.scene1', 'src.scene2'],
    getScenesForDisplay: async (): Promise<SceneForDisplay[]> => [
      { name: 'src.scene1', title: 'Scene One' },
      { name: 'src.scene2' },
    ],
    ...
  };
}
```

## 4. Обновить существующие тесты

**Файл (изменить):** `test/telegram-bot.test.ts`

### Тест `/scenes: allowed user receives scene list` (строка 186)

Текущие assertions проходят и после изменений:
- `ctx.replyText.includes('Scene One')` — `src.scene1` имеет `title: 'Scene One'`, отображается как есть ✓
- `ctx.replyText.includes('scene2')` — `src.scene2` без title → `'src.scene2'.slice(4) = 'scene2'` ✓

Изменений в этом тесте не требуется.

### Тест `/scene backup: replies that scene is not switchable` (строка 231)

Текущее ожидание: `ctx.replyText === 'Сцена недоступна для переключения: backup'`

После изменений: `inputName = 'backup'`, `fullName = 'src.backup'`. Фикстура возвращает только `src.scene1` и `src.scene2` — `isAllowed = false`. Ответ: `Сцена недоступна для переключения: backup` ✓

Изменений в этом тесте не требуется.

### Тест `/scene: SceneNotFoundError returns proper message` (строка 263)

Текущий override:
```typescript
getScenesForDisplay: async () => [{ name: 'nonexistent', enabled: true }],
setScene: async () => { throw new SceneNotFoundError('nonexistent'); },
```

После изменений `handleScene` ищет по `fullName = 'src.nonexistent'`, но фикстура возвращает `name: 'nonexistent'` (без префикса) — `isAllowed = false`, до `setScene` не доходит. Тест сломается.

Новый override:
```typescript
getScenesForDisplay: async () => [{ name: 'src.nonexistent', enabled: true }],
setScene: async () => { throw new SceneNotFoundError('src.nonexistent'); },
```

Assertions:
- `ctx.replyText.includes('не найдена')` ✓
- `ctx.replyText.includes('nonexistent')` ✓ (выводим `err.sceneName.slice(4) = 'nonexistent'`)

## 5. Добавить новый тест: успешное переключение сцены

**Файл (изменить):** `test/telegram-bot.test.ts` — добавить после строки 246

```typescript
it('/scene scene1: switches to src.scene1 and replies with short name', async () => {
  let calledWith: string | null = null;
  const ctx = makeMockCtx('/scene scene1', allowedUser);
  const deps: TelegramBotDeps = {
    config: testConfig,
    logger: makeLogger(),
    allowedUsers: { isAllowed: () => true },
    navigateToUrl: async () => {},
    isChromeAlive: () => true,
    isObsAlive: () => true,
    obsScenes: makeObsScenes({ setScene: async (n) => { calledWith = n; } }),
  };
  await handleScene(ctx, deps);
  assert.strictEqual(calledWith, 'src.scene1');
  assert.strictEqual(ctx.replyText, 'Сцена переключена: scene1');
});
```

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/telegram-bot/handlers.ts` |
| Изменить | `test/telegram-bot.test.ts` |

## Ссылки
- [analyze.md](./analyze.md)
