# Анализ: Команда /help в Telegram боте

## Общее описание функциональности

Необходимо добавить команду `/help` в Telegram бота, которая возвращает пользователю список всех доступных команд с кратким описанием каждой. Команда решает задачу самодокументирования бота — пользователь может в любой момент узнать, что умеет бот, не обращаясь к внешней документации.

## Связанные модули и сущности

| Модуль/файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/telegram-bot/handlers.ts` | Все обработчики команд бота | Нужно добавить `handleHelp` |
| `src/modules/telegram-bot/run.ts` | Создание и запуск бота (Telegraf), регистрация команд | Нужно зарегистрировать команду `/help` |
| `src/modules/telegram-bot/types.ts` | Интерфейс `TelegramBotDeps` | Скорее всего не затрагивается |
| `src/modules/telegram-bot/index.ts` | Реэкспорт | Скорее всего не затрагивается |
| `test/telegram-bot.test.ts` | Тесты всех обработчиков | Нужно добавить тест для `handleHelp` |

## Текущие интерфейсы и API

### `CommandContext` (`handlers.ts:10-14`)
```ts
export interface CommandContext {
  from?: { id: number; username?: string } | null;
  message: { text: string };
  reply: (text: string) => Promise<unknown>;
}
```
Единственный интерфейс контекста, используется всеми обработчиками. `handleHelp` будет использовать тот же интерфейс.

### `TelegramBotDeps` (`types.ts:6-16`)
Зависимости бота: конфиг, логгер, `allowedUsers`, `navigateToUrl`, `isChromeAlive`, `isObsAlive`, опциональные `restartChrome`, `restartObs`, `obsScenes`. Для `/help` достаточно `allowedUsers` (или вообще без авторизации — открытый вывод).

### Существующие команды (`run.ts:19-28`)
| Команда | Обработчик | Описание |
|---|---|---|
| `/status` | `handleStatus` | Готовность системы, Chrome/OBS alive, текущая сцена |
| `/idle` | `handleIdle` | Переключить Chrome на idle-страницу |
| `/restart <chrome\|obs\|all>` | `handleRestart` | Перезапустить Chrome, OBS или оба |
| `/scenes` | `handleScenes` | Список сцен OBS |
| `/scene <name>` | `handleScene` | Переключить OBS на сцену |
| `/current` | `handleCurrent` | Текущая активная сцена OBS |
| `/backup` | `handleBackup` | Переключить OBS на сцену "backup" |
| `/default` | `handleDefault` | Переключить OBS на сцену "default" |
| _(текст с URL)_ | `handleText` | Открыть URL в Chrome |

### `handleText` (`handlers.ts:262-308`)
Обрабатывает все входящие текстовые сообщения. Если текст начинается с `/` и команда неизвестна — отвечает "Неизвестная команда." Это означает, что если `/help` не зарегистрировать через `bot.command(...)`, сообщение `/help` уйдёт в `handleText` и получит ответ "Неизвестная команда.".

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить/создать |
|---|---|---|
| `src/modules/telegram-bot/handlers.ts` | Все функции-обработчики команд | Добавить функцию `handleHelp` |
| `src/modules/telegram-bot/run.ts` | Регистрация команд через `bot.command(...)` | Добавить `bot.command('help', ...)` и импорт `handleHelp` |
| `test/telegram-bot.test.ts` | Тесты обработчиков | Добавить тест(ы) для `handleHelp` |

## Зависимости и ограничения

- **Telegraf**: бот строится на библиотеке Telegraf. Регистрация команды через `bot.command('help', ...)` — стандартный паттерн, уже применённый для всех команд.
- **Авторизация**: для `/help` проверка `allowedUsers` не нужна — команда открыта для всех пользователей.
- **Открытые вопросы из description.md**:
  - Формат вывода: plain text.
  - Группировка команд: не обязательна, при желании можно разделить пустой строкой.
  - Регистрация в BotFather (`setMyCommands`): отдельная операция при запуске бота в `startBot` (`run.ts:33-37`), не влияет на основную логику обработчика.
