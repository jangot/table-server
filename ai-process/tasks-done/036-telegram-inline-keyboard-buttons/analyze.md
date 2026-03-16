# Анализ: Telegram inline-кнопки вместо команд

## Общее описание функциональности

Задача — добавить inline-кнопки в Telegram-бота (Telegraf). Вместо текстового bullet-списка `/scenes` должно возвращать сообщение с `inline_keyboard`, каждая кнопка которого переключает OBS на соответствующую сцену. Также нужна новая команда `/menu` с кнопками для всех остальных команд без параметров. При нажатии кнопки бот обрабатывает `callback_query` — выполняет нужное действие и отвечает новым сообщением.

Текстовые команды сохраняются параллельно с кнопками; логика переключения сцен не дублируется.

## Связанные модули и сущности

| Модуль / файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/telegram-bot/run.ts` | Создание бота, регистрация команд | Добавить `bot.action(...)` для callback_query, добавить команду `/menu` |
| `src/modules/telegram-bot/handlers.ts` | Хендлеры всех команд | Изменить `handleScenes` — вернуть inline_keyboard; добавить `handleMenu`, `handleCallbackScene` |
| `src/modules/telegram-bot/types.ts` | Тип `TelegramBotDeps` и `CommandContext` | `CommandContext` нужно расширить для поддержки `answerCbQuery` и `replyWithMarkup` (или использовать отдельный тип для callback) |
| `src/modules/obs-scenes/types.ts` | Интерфейсы `ObsScenesService`, `SceneForDisplay`, `SceneNotFoundError` | Используется как есть, без изменений |
| `test/telegram-bot.test.ts` | Юнит-тесты хендлеров | Обновить тест `/scenes` (ожидает inline_keyboard, не текст); добавить тесты для `handleCallbackScene`, `handleMenu` |

## Текущие интерфейсы и API (если есть)

### `CommandContext` (handlers.ts:10)
```typescript
export interface CommandContext {
  from?: { id: number; username?: string } | null;
  message: { text: string };
  reply: (text: string) => Promise<unknown>;
}
```
Интерфейс минималистичный — только `reply(text)`. Для inline-кнопок нужны:
- `reply` с `reply_markup` (Extra-объект Telegraf) — `ctx.reply(text, { reply_markup: { inline_keyboard: [...] } })`
- Для callback_query: `ctx.answerCbQuery(text?)` — подтверждение нажатия
- Для callback_query: `ctx.callbackQuery.data` — данные нажатой кнопки
- `ctx.from` — присутствует в обоих типах контекстов

### `handleScenes` (handlers.ts:141)
Сейчас: строит текстовый список `• <title>` и вызывает `ctx.reply(lines.join('\n'))`.
Нужно: вместо текстового списка возвращать `ctx.reply(text, Markup.inlineKeyboard([...]))` или аналогичный Extra-объект.

### `handleScene` (handlers.ts:170)
Логика переключения сцены (валидация + `deps.obsScenes.setScene(fullName)`) — именно её нужно вызывать из нового callback-обработчика.
Текущий хендлер извлекает имя из `ctx.message.text` — в callback это невозможно, нужна отдельная функция-ядро.

### Telegraf API (npm: telegraf)
- `Markup.inlineKeyboard(buttons)` — строит `InlineKeyboardMarkup`
- `Markup.button.callback(text, data)` — создаёт inline-кнопку с `callback_data`
- `bot.action(pattern, handler)` — регистрирует обработчик callback_query
- В callback-контексте: `ctx.answerCbQuery()`, `ctx.callbackQuery.data`, `ctx.from`
- Типы Telegraf: `Context`, `CallbackQueryContext` из `telegraf`

### `TelegramBotDeps` (types.ts:6)
Не требует изменений — все нужные зависимости уже есть (`obsScenes`, `allowedUsers`, `logger`).

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить / создать |
|---|---|---|
| `src/modules/telegram-bot/handlers.ts` | Все хендлеры команд | 1. Изменить `handleScenes`: вместо текста — inline_keyboard с кнопками сцен; 2. Выделить логику переключения сцены в переиспользуемую функцию (сейчас она в `handleScene`); 3. Добавить `handleCallbackScene(ctx, deps)` для обработки `callback_data: 'scene:<name>'`; 4. Добавить `handleMenu(ctx, deps)` с кнопками для всех безпараметрических команд и кнопками restart |
| `src/modules/telegram-bot/types.ts` | `TelegramBotDeps`, `CommandContext` | Расширить `CommandContext` для поддержки `reply_markup` — либо через overload `reply`, либо добавить необязательное поле `replyWithKeyboard`; добавить тип для callback-контекста |
| `src/modules/telegram-bot/run.ts` | Регистрация команд в Telegraf | 1. Добавить `bot.command('menu', ...)` → `handleMenu`; 2. Добавить `bot.action(/^scene:/, ...)` → `handleCallbackScene` |
| `test/telegram-bot.test.ts` | Юнит-тесты | 1. Обновить тест `/scenes` — проверять наличие `reply_markup` / `inline_keyboard`; 2. Добавить тесты для `handleCallbackScene` и `handleMenu`; 3. Обновить `makeMockCtx` для поддержки `answerCbQuery` и callback-контекста |

## Зависимости и ограничения

- **Telegraf version**: используется `Markup.inlineKeyboard` / `Markup.button.callback` — доступны в Telegraf v4. Нужно проверить установленную версию.
- **`CommandContext` — минимальный интерфейс**: тесты завязаны на `ctx.reply(string)`. Расширение сигнатуры `reply` для поддержки Extra-аргумента потребует обновления mock-объектов в тестах.
- **Авторизация в callback_query**: `ctx.from` присутствует так же, как в командах — авторизация через `deps.allowedUsers.isAllowed` применима без изменений.
- **`callback_data` ограничен 64 байтами** в Telegram API. Формат `scene:src.CameraFeed` (≈20 байт) — укладывается.
- **Ответ на callback_query**: Telegram требует вызова `answerCbQuery()`, иначе кнопка остаётся в состоянии ожидания. Это нужно учесть в `handleCallbackScene`.
- **Логика переключения сцены**: сейчас зашита внутри `handleScene` и привязана к парсингу `ctx.message.text`. Чтобы не дублировать — нужно выделить в отдельную приватную функцию (`switchScene(name, from, deps, reply)`).
- **`/restart` с кнопками**: команда требует аргумент (`chrome|obs|all`), поэтому кнопки для неё — отдельные `callback_data: 'restart:chrome'`, `'restart:obs'`, `'restart:all'`. Нужен отдельный callback-обработчик или общий с диспетчеризацией.
