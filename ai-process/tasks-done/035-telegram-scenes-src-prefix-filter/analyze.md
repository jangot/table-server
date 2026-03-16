# Анализ: Фильтрация сцен по префиксу `src.` в Telegram-боте

## Общее описание функциональности

Telegram-бот управляет сценами OBS через команды `/scenes` и `/scene`. Сцены в OBS именуются по шаблону `src.<shortname>`. Задача — скрыть от пользователя внутреннее именование:
- `/scenes` — показывать только сцены с именем `src.*`, при этом отображать имена без префикса (`src.table` → `table`)
- `/scene <name>` — принимать короткое имя без префикса, автоматически добавлять `src.` при поиске и переключении

Фильтрация реализуется исключительно в обработчиках Telegram-бота, сервис `ObsScenesService` не меняется.

## Связанные модули и сущности

| Модуль / файл | Назначение | Затрагивает ли задача |
|---|---|---|
| `src/modules/telegram-bot/handlers.ts` | Обработчики команд Telegram-бота | Да — `handleScenes`, `handleScene` |
| `src/modules/obs-scenes/types.ts` | Интерфейс `ObsScenesService`, тип `SceneForDisplay`, `SceneNotFoundError` | Только читается, не меняется |
| `src/modules/obs-scenes/scenes-service.ts` | Реализация `ObsScenesService` | Не затрагивает |
| `test/telegram-bot.test.ts` | Тесты обработчиков Telegram-бота | Да — нужно обновить фикстуры и тесты |

## Текущие интерфейсы и API

### `SceneForDisplay` (`types.ts:22`)
```ts
interface SceneForDisplay {
  name: string;     // имя сцены в OBS (например, "src.table")
  title?: string;   // человекочитаемое название из конфига
  type?: string;
  enabled?: boolean;
}
```

### `ObsScenesService` (`types.ts:29`)
- `getScenesForDisplay(): Promise<SceneForDisplay[]>` — возвращает все отображаемые сцены (без `main`, без `enabled: false`)
- `setScene(name: string): Promise<void>` — переключает сцену по полному имени OBS

### `handleScenes` (`handlers.ts:141`)
- Получает все сцены через `getScenesForDisplay()`
- Форматирует как `• title ?? name` (строка 158)
- **Проблема**: не фильтрует по `src.`, показывает все имена как есть

### `handleScene` (`handlers.ts:169`)
- Парсит имя из текста команды: `ctx.message.text.replace(/^\s*\/scene\s*/i, '').trim()` (строка 180)
- Проверяет доступность: `scenes.some((s) => s.name === sceneName)` (строка 187)
- Вызывает: `setScene(sceneName)` (строка 193)
- **Проблема**: сравнивает и передаёт полное имя, пользователь должен вводить `src.table`, а не `table`

## Файлы и места в коде

| Файл | Содержит | Что нужно изменить / создать |
|---|---|---|
| `src/modules/telegram-bot/handlers.ts` | `handleScenes` (141–166), `handleScene` (169–204) | В `handleScenes`: фильтровать `scenes` по `s.name.startsWith('src.')`, выводить `s.title ?? s.name.slice(4)`. В `handleScene`: добавить `src.` к введённому имени, искать по полному имени, отображать короткое имя в ответах |
| `test/telegram-bot.test.ts` | Фикстура `makeObsScenes()` (строки 25–34), тесты `/scenes` (186–229), тесты `/scene` (231–311) | Обновить фикстуру: добавить сцены с именами `src.scene1`, `src.scene2`. Обновить тесты для проверки отображения без префикса и ввода без префикса |

## Зависимости и ограничения

- `setScene(name)` принимает **полное** имя OBS (с `src.`). Если передать короткое — выбросит `SceneNotFoundError`. Поэтому в `handleScene` нужно передавать `'src.' + inputName`.
- `SceneNotFoundError.sceneName` содержит полное имя (`src.table`). В сообщении пользователю лучше показывать короткое имя (без `src.`), чтобы не путать.
- Ответное сообщение в `handleScene` после успешного переключения (строка 195): `Сцена переключена: ${sceneName}` — нужно адаптировать (показывать короткое имя).
- Тест `/scene backup: replies that scene is not switchable` (строка 231) использует имя `backup` без префикса — уже ожидает короткое имя, но фикстура возвращает `scene1`/`scene2`. После изменения фикстуры тест нужно перепроверить.
- `isSwitchableScene` в сервисе фильтрует по `type === 'main'` и `enabled: false`. Фильтрация по префиксу `src.` — отдельный уровень, добавляется в хендлерах.
