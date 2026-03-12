# Анализ: Идентификация монитора OBS по имени входа

## Общее описание функциональности

Сейчас монитор для OBS-проектора задаётся через переменную окружения `OBS_PROJECTOR_MONITOR` как числовой индекс. Это ненадёжно: порядок мониторов в системе может меняться. Задача — заменить идентификацию по индексу на идентификацию по имени входа (например, `HDMI-1`, `DP-2`), используя OBS WebSocket API метод `GetMonitorList`, который возвращает список мониторов с именами и их индексами.

## Связанные модули и сущности

| Модуль/файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/config/types.ts` | Типы конфига, класс `ObsConfig` | Добавить новое поле `projectorMonitorName?: string` |
| `src/modules/config/validate.ts` | Парсинг env-переменных | Добавить чтение `OBS_PROJECTOR_MONITOR_NAME` |
| `src/modules/obs-scenes/client.ts` | OBS WebSocket клиент | Добавить метод `getMonitorList()` |
| `src/modules/obs-scenes/index.ts` | Фабрика сервиса, логика `onConnected` | Добавить резолвинг имени монитора в индекс при подключении |
| `test/obs-scenes.test.ts` | Тесты логики obs-scenes | Добавить тесты для нового поведения |

## Текущие интерфейсы и API (если есть)

### `ObsConfig` (`src/modules/config/types.ts:69-98`)
```ts
class ObsConfig {
  projectorMonitorIndex?: number;  // удалить
}
```

### `ObsWebSocketClient` (`src/modules/obs-scenes/client.ts:30-38`)
```ts
interface ObsWebSocketClient {
  getSceneList(): Promise<{ scenes: Array<{ sceneName: string }> }>;
  openSourceProjector(sourceName: string, monitorIndex: number): Promise<void>;
  // метода getMonitorList нет — нужно добавить
}
```

### `createObsScenesService` (`src/modules/obs-scenes/index.ts:23-67`)
- Принимает `ObsConfig`, из него берёт `projectorMonitorIndex`
- В `onConnected`: если индекс задан — ищет `output.*` сцену, открывает проектор через `openSourceProjector(sceneName, projectorMonitorIndex)`

### OBS WebSocket API: `GetMonitorList`
- Метод возвращает: `{ monitors: Array<{ monitorIndex: number, monitorName: string, monitorWidth: number, monitorHeight: number, monitorPositionX: number, monitorPositionY: number } }` (по документации obs-websocket-js v5)

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить/создать |
|---|---|---|
| `src/modules/config/types.ts` | `ObsConfig` с `projectorMonitorIndex?: number` | Удалить `projectorMonitorIndex`, добавить `projectorMonitorName?: string` |
| `src/modules/config/validate.ts` | Парсинг `OBS_PROJECTOR_MONITOR` | Удалить парсинг `OBS_PROJECTOR_MONITOR`, добавить `OBS_PROJECTOR_MONITOR_NAME` (строка, без преобразований) |
| `src/modules/obs-scenes/client.ts` | Интерфейс и реализация клиента | Добавить `getMonitorList()` в интерфейс и реализацию; вызов `GetMonitorList` через `obs.call` |
| `src/modules/obs-scenes/index.ts` | Логика `onConnected` | Заменить логику: вызвать `getMonitorList()`, найти монитор по системному имени (`monitorName`), получить его `monitorIndex`; если не найден — залогировать ошибку и не открывать проектор |
| `test/obs-scenes.test.ts` | Тесты obs-scenes | Обновить тесты: убрать тесты на числовой индекс, добавить тесты на резолвинг по имени (найден / не найден), расширить mock-клиент методом `getMonitorList` |

## Зависимости и ограничения

- **OBS WebSocket v5**: метод `GetMonitorList` доступен в obs-websocket-js v5+. Нужно проверить, что используемая версия библиотеки поддерживает этот метод.
- **Формат имени монитора**: используется системное имя (`monitorName` из `GetMonitorList`), например `HDMI-1`. Числовой индекс полностью удаляется.
- **Нет fallback**: `OBS_PROJECTOR_MONITOR` и `projectorMonitorIndex` удаляются полностью. Единственный способ идентификации — `OBS_PROJECTOR_MONITOR_NAME`.
- **Ошибки соединения**: `getMonitorList` вызывается внутри `onConnected`, где уже есть обработка ошибок. Новый вызов должен следовать тому же паттерну.
- **Тесты**: mock-клиент в `test/obs-scenes.test.ts` нужно расширить методом `getMonitorList`, иначе существующие тесты могут сломаться при изменении интерфейса.
