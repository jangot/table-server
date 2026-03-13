# Анализ: Привязка Chrome-окна к источнику OBS при старте

## Общее описание функциональности

При каждом старте сервиса OBS захватывает Chrome-окно через источник типа **Window Capture (Xcomposite)**. Захват привязан к X11 Window ID (XID), который меняется при каждом перезапуске Chrome. Без динамической привязки OBS показывает пустой экран.

Задача: после подключения к OBS WebSocket автоматически:
1. Определить XID запущенного Chrome через `xdotool search --onlyvisible --class chrome` (с retry 500 мс, таймаут 10 с).
2. Вызвать `setInputSettings` на нужном источнике OBS (`obs.chromeSourceName`).
3. Если `chromeSourceName` не задан в конфиге — фича отключена.

Точка вызова — `onConnected` callback клиента OBS WebSocket (вызывается каждый раз при успешном подключении/переподключении к OBS).

---

## Связанные модули и сущности

| Модуль / Файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/config/types.ts` | Типы конфигурации (`ObsConfig`, `ChromeConfig`, …) | Добавить поле `chromeSourceName?: string` в `ObsConfig` |
| `src/modules/config/validate.ts` | Читает env-переменные, строит `AppConfig` | Добавить чтение `OBS_CHROME_SOURCE_NAME` → `obs.chromeSourceName` |
| `src/modules/obs-scenes/index.ts` | Фабрика: создаёт `ObsWebSocketClient` + `onConnected` | Расширить `onConnected`: добавить вызов привязки Chrome-окна |
| `src/modules/obs-scenes/client.ts` | OBS WebSocket клиент; `onConnected` вызывается при каждом подключении | Не меняется; `setInputSettings` уже реализован |
| Новый файл: `src/modules/obs-scenes/chrome-window-bind.ts` | Логика поиска XID и вызова `setInputSettings` | Создать |
| `test/obs-scenes.test.ts` | Интеграционные тесты obs-scenes | Добавить тесты для привязки Chrome-окна |
| `docs/` (новый или существующий файл) | Документация для ручной настройки OBS | Добавить раздел о настройке источника Window Capture |

---

## Текущие интерфейсы и API (если есть)

### `ObsWebSocketClientConfig` (`src/modules/obs-scenes/client.ts:22`)
```ts
export interface ObsWebSocketClientConfig {
  host: string;
  port: number;
  password: string;
  logger: Logger;
  onConnected?: () => Promise<void>;  // вызывается при каждом успешном подключении
}
```

### `ObsWebSocketClient.setInputSettings` (`client.ts:227`)
```ts
async setInputSettings(inputName: string, inputSettings: Record<string, unknown>): Promise<void>
```
Вызывает OBS WebSocket метод `SetInputSettings`. Бросает ошибку, если соединение не установлено.

### `createObsScenesService` (`src/modules/obs-scenes/index.ts:23`)
Создаёт клиент и передаёт в него `onConnected`. Сейчас `onConnected` реализует **только** открытие проектора (если задан `projectorMonitorName`). Это единый callback — нужно **добавить** вызов привязки Chrome внутрь существующего callback.

### `ObsConfig` (`src/modules/config/types.ts:69`)
Не содержит поля `chromeSourceName`. Нужно добавить.

### `validateEnv` (`src/modules/config/validate.ts:48`)
Читает env-переменные блока `obs` (строки 80–91). Не читает `OBS_CHROME_SOURCE_NAME`.

---

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить / создать |
|---|---|---|
| `src/modules/config/types.ts` | Класс `ObsConfig` | Добавить `chromeSourceName?: string` с `@IsOptional() @IsString()` |
| `src/modules/config/validate.ts` | Функция `validateEnv`, блок `obs` (~строки 80–91) | Добавить `chromeSourceName: getEnv('OBS_CHROME_SOURCE_NAME')?.trim() || undefined` |
| `src/modules/obs-scenes/chrome-window-bind.ts` | Отсутствует | Создать: функция с retry-логикой через `xdotool`, вызов `setInputSettings` |
| `src/modules/obs-scenes/index.ts` | `createObsScenesService`, блок `onConnected` (~строки 33–87) | Расширить `onConnected`: добавить вызов привязки Chrome после (или параллельно с) открытием проектора |
| `test/obs-scenes.test.ts` | Тесты obs-scenes | Добавить тесты: успешная привязка, таймаут xdotool, отсутствие источника в OBS |
| `docs/` (новый файл или README) | Документация | Добавить инструкцию: как создать источник Window Capture (Xcomposite) в OBS, имя совпадает с `OBS_CHROME_SOURCE_NAME` |

---

## Зависимости и ограничения

### Внешние зависимости
- **`xdotool`** — системный пакет (`apt install xdotool`). Вызывается через `child_process.execSync` или `exec`. Работает только на X11.
- **`obs-websocket-js`** — уже используется в `client.ts`.

### Архитектурные особенности
- **Единственность `onConnected`:** В `createObsWebSocketClient` только один callback. В `obs-scenes/index.ts` он уже используется для проектора. Новую логику нужно добавить внутрь существующего `onConnected` (не заменять, а дополнять). Порядок: сначала проектор, затем привязка Chrome (или наоборот — не критично, они независимы).
- **`onConnected` вызывается при каждом переподключении**, не только при первом. Привязка Chrome на каждое переподключение — это нормально и даже полезно.
- **`client` — `let`, не `const`:** В `index.ts` переменная `client` объявлена как `let` (строка 31) из-за замыкания в `onConnected`, это уже решённая проблема, паттерн сохраняется.

### Ограничения задачи
- **X11 only** — на Wayland `xdotool` не работает. Не в scope задачи.
- **Watchdog не реализуется** — однократная привязка при каждом старте/переподключении OBS. Если Chrome пересоздаёт окно в рантайме — не обрабатывается.
- **Источник в OBS создаётся вручную** — если источника с именем `chromeSourceName` нет, `setInputSettings` вернёт ошибку. Нужно перехватить и залогировать, не падать.

### Потенциальные риски
- **Гонка:** Chrome может не успеть создать видимое окно за 10 секунд (медленная машина). Логировать и продолжать без привязки.
- **Множественные XID:** `xdotool` может вернуть несколько строк (несколько окон). Использовать первое.
- **Инъекция команд:** имя класса Chrome в `xdotool` — константа в коде, не из конфига пользователя. Риск минимален. Использовать `execFile` вместо `exec` для безопасности.
