# План реализации: OBS WebSocket и сервис управления сценами

Реализовать подключение к OBS по OBS WebSocket API и сервис сцен: получение списка сцен, текущей сцены и переключение по имени. Обработка недоступности OBS и разрыва соединения, логирование в формате key=value. Модуль запуска OBS (`obs`) не трогаем; WebSocket и сцены — отдельный модуль в `src/modules/obs-scenes/`. Конфигурация WebSocket — опциональная: если заданы `OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD`, сервис сцен создаётся и подключается; иначе приложение работает без управления сценами.

## 1. Конфигурация: поля WebSocket в ObsConfig

**Файл (изменить):** `src/modules/config/types.ts`

В класс `ObsConfig` добавить опциональные поля для WebSocket (все три заданы — считаем управление сценами включённым):

- `host?: string` — хост OBS WebSocket (например `localhost`)
- `port?: number` — порт (1–65535), по умолчанию в требованиях 4455
- `password?: string` — пароль WebSocket (пустая строка = без пароля)

Использовать декораторы по аналогии с `ChromeConfig`: `@IsOptional()`, `@IsString()`, `@IsNumber()`, `@Min(1)`, `@Max(65535)` для порта.

```typescript
// В ObsConfig добавить:
@IsOptional()
@IsString()
host?: string;

@IsOptional()
@IsNumber()
@Min(1)
@Max(65535)
port?: number;

@IsOptional()
@IsString()
password?: string;
```

Дополнительно: добавить хелпер (в этом же файле или в отдельном утильном) `isObsScenesEnabled(obs: ObsConfig): boolean` — возвращает `true`, если заданы `host`, `port` и `password !== undefined` (password может быть пустой строкой). Это позволит в `index.ts` и тестах решать, создавать ли сервис сцен.

## 2. Валидация env: чтение OBS_HOST, OBS_PORT, OBS_PASSWORD

**Файл (изменить):** `src/modules/config/validate.ts`

В объект `plain.obs` добавить:

- `host`: `getEnv('OBS_HOST')?.trim() || undefined`
- `port`: `parseOptionalInt(getEnv('OBS_PORT'))`
- `password`: `getEnv('OBS_PASSWORD')` — не обрезать пробелы с конца, чтобы различать «не задан» и «пустая строка» при необходимости; при желании можно хранить как есть и считать пустую строку валидным «без пароля»

Валидация: поля остаются опциональными (class-validator не требует их). Условная проверка «если задан host, то обязательны port и password» при необходимости вынести в отдельный шаг после `validateSync` или не делать в 012 — сервис сцен сам не создаётся, если чего-то не хватает.

## 3. Зависимость obs-websocket-js

**Файл (изменить):** `package.json`

Добавить в `dependencies` пакет для OBS WebSocket. Рекомендуется `obs-websocket-js` (протокол 5.x). Проверить по документации библиотеки совместимость с OBS WebSocket 4.x/5.x и при необходимости зафиксировать версию.

```json
"obs-websocket-js": "^5.x.x"
```

После добавления выполнить `npm install`.

## 4. Модуль obs-scenes: типы и контракт сервиса

**Файл (создать):** `src/modules/obs-scenes/types.ts`

Описать публичный контракт сервиса сцен (без привязки к реализации):

- `ObsScenesService` — интерфейс с методами:
  - `getScenes(): Promise<string[]>` — список имён сцен
  - `getCurrentScene(): Promise<string | null>` — имя текущей сцены или `null` при недоступности/ошибке
  - `setScene(name: string): Promise<void>` — переключение на сцену по имени; при несуществующей сцене — reject с понятной ошибкой (например `Error` с сообщением вида `Scene not found: ${name}`)
- Опционально: тип ошибки «сцена не найдена» (например класс `SceneNotFoundError`) для обработки в вызывающем коде.

```typescript
export interface ObsScenesService {
  getScenes(): Promise<string[]>;
  getCurrentScene(): Promise<string | null>;
  setScene(name: string): Promise<void>;
}
```

## 5. Модуль obs-scenes: клиент WebSocket и переподключение

**Файл (создать):** `src/modules/obs-scenes/client.ts`

Инкапсулировать работу с библиотекой `obs-websocket-js`:

- Принимать в конструкторе или фабрике: `host`, `port`, `password`, `Logger`.
- Методы: `connect(): Promise<void>`, `disconnect(): Promise<void>`, внутренние вызовы к OBS (получение сцен, текущей сцены, переключение). При разрыве соединения — логировать в формате key=value, например `obs_connection status=disconnected`, и запускать переподключение с задержкой (exponential backoff или фиксированный интервал). При успешном подключении — `obs_connection status=connected`; при восстановлении после разрыва — `obs_connection status=reconnected`.
- Не бросать из конструктора и не падать при старте, если OBS недоступен — повторять попытки подключения в фоне (логировать каждую попытку/ошибку в key=value).
- Использовать API выбранной библиотеки (например для obs-websocket-js v5: `obs.connect()`, `obs.call('GetSceneList')`, `obs.call('GetCurrentProgramScene')`, `obs.call('SetCurrentProgramScene', { sceneName })`). Ошибки от OBS (например сцена не найдена) преобразовывать в понятные ошибки приложения.

## 6. Модуль obs-scenes: реализация ObsScenesService

**Файл (создать):** `src/modules/obs-scenes/scenes-service.ts`

Реализовать интерфейс `ObsScenesService` из `types.ts`:

- В конструктор передавать клиент (из `client.ts`) и `Logger`.
- `getScenes()`: вызвать соответствующий запрос к OBS, вернуть массив имён. При недоступности OBS возвращать пустой массив или reject — решить единообразно (анализ предлагает «понятные ошибки, не падать»; здесь разумно при отсутствии соединения возвращать пустой массив и/или логировать и возвращать `[]`).
- `getCurrentScene()`: запрос текущей сцены; при недоступности — `null` и залогировать.
- `setScene(name)`: вызвать переключение; если OBS вернул ошибку «сцена не найдена», отклонить промис с ошибкой с текстом вроде `Scene not found: ${name}`. При успешном переключении логировать в формате key=value, например `scene_switch to=<name> success=true` (при необходимости добавить поля `source`, `from` в следующих задачах).
- Все логи — одна строка в формате key=value в первом аргументе `logger.info`/`logger.warn`/`logger.error`.

## 7. Модуль obs-scenes: фабрика и экспорт

**Файл (создать):** `src/modules/obs-scenes/index.ts`

- Экспортировать типы (`ObsScenesService`, при необходимости `SceneNotFoundError`).
- Функция `createObsScenesService(config: ObsConfig, logger: Logger): ObsScenesService | null`: если `isObsScenesEnabled(config)` ложно — вернуть `null`; иначе создать клиент, запустить подключение в фоне (не блокировать старт приложения), вернуть экземпляр `ObsScenesService`. Важно: при старте не ждать успешного подключения к OBS — сервис возвращается сразу, подключение и переподключение идут в фоне.
- Экспортировать `createObsScenesService` и при необходимости хелпер `isObsScenesEnabled` (если он вынесен сюда из config).

## 8. Интеграция в точку входа

**Файл (изменить):** `src/index.ts`

- Импортировать `createObsScenesService` и при необходимости `isObsScenesEnabled` из `obs-scenes`.
- После `runOrchestrator` (или после создания модулей): вызвать `createObsScenesService(config.obs, logger)`. Если сервис не `null`, сохранить ссылку в переменную (например `obsScenesService`).
- В 012 не передавать сервис в `startBot` (это задача 014). Достаточно создать сервис и при необходимости экспортировать тип/интерфейс, чтобы в 014 добавить в `TelegramBotDeps` поля вроде `getScenes`, `getCurrentScene`, `setScene` или `obsScenesService` и передать их сюда. То есть в `index.ts` только создание и сохранение сервиса в переменной; при необходимости можно завести объект `deps` для будущего расширения (watchdog, idle-server), куда положить `obsScenesService`, чтобы в 014/015 просто добавить его в deps бота и в маршруты.

## 9. Тесты конфигурации

**Файл (изменить):** `test/config.test.ts`

- В `REQUIRED` и в `after` не добавлять OBS_HOST/OBS_PORT/OBS_PASSWORD в обязательные — они опциональны.
- Добавить тесты:
  - При заданных `OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD` конфиг содержит соответствующие поля и они парсятся корректно (port — число, host/password — строки).
  - При отсутствии этих переменных поля `obs.host`, `obs.port`, `obs.password` равны `undefined`.
  - Граничные значения порта: 1 и 65535 — валидны; 0 или 65536 — валидация падает (если применимо при использовании `validateEnv` с заданными OBS_*).
- В `after` добавить сброс `OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD` в `unsetEnv`, чтобы не влиять на другие тесты.

## 10. Тесты сервиса сцен

**Файл (создать):** `test/obs-scenes.test.ts`

Сценарии:

- **Happy path:** мок клиента OBS WebSocket (или мок модуля `obs-websocket-js`): при вызове `getScenes()` возвращается список имён; `getCurrentScene()` — имя сцены; `setScene('chrome')` — успех без исключения. Проверить, что логи содержат ожидаемые ключи (key=value).
- **Сцена не найдена:** при `setScene('nonexistent')` сервис отклоняет промис с ошибкой с сообщением о ненайденной сцене (и при необходимости не падает процесс).
- **OBS недоступен / отключение:** симулировать отключение клиента; убедиться, что `getCurrentScene()` возвращает `null` или что вызовы не приводят к необработанным исключениям; при наличии переподключения — проверить, что логи содержат сообщение о переподключении.
- **createObsScenesService без конфига WebSocket:** при отсутствии host/port/password фабрика возвращает `null`.
- **createObsScenesService с конфигом:** фабрика возвращает объект с методами `getScenes`, `getCurrentScene`, `setScene` (достаточно проверить наличие методов и при желании один успешный вызов через мок).

Подключить новый файл в `package.json` в скрипте `test`: добавить `test/obs-scenes.test.ts` в список тестов.

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `package.json` |
| Создать  | `src/modules/obs-scenes/types.ts` |
| Создать  | `src/modules/obs-scenes/client.ts` |
| Создать  | `src/modules/obs-scenes/scenes-service.ts` |
| Создать  | `src/modules/obs-scenes/index.ts` |
| Изменить | `src/index.ts` |
| Изменить | `test/config.test.ts` |
| Создать  | `test/obs-scenes.test.ts` |

## Ссылки

- [analyze.md](./analyze.md) текущей задачи
- [description.md](./description.md)
- [docs/requirements/obs-scene-requirements.md](../../../docs/requirements/obs-scene-requirements.md) (разделы 5–6, 10–11, 13–14)
