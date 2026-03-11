# Анализ: SSR-страница управления сценами OBS

## Общее описание функциональности

Реализовать SSR-страницу `GET /obs/scenes` — панель управления сценами OBS с отображением:
- статуса подключения к OBS WebSocket (connected/disconnected)
- текущей активной сцены
- списка доступных сцен в виде кнопок переключения
- отдельных кнопок Backup и Default
- визуального выделения активной сцены

Переключение сцен — через HTML-формы с методом POST, адресующие уже реализованные POST-эндпоинты (`POST /obs/scene`, `/obs/scene/backup`, `/obs/scene/default`). После переключения — редирект обратно на `GET /obs/scenes` (Post/Redirect/Get паттерн).

Это последний (пятый) этап серии задач 012–016. Все зависимости (сервис сцен, POST Web API, EJS-движок) уже реализованы в задачах 012–015.

## Связанные модули и сущности

| Модуль / файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/idle-server/index.ts` | Express + EJS сервер, маршруты `/`, `/health`, POST `/obs/scene*` | Добавить `GET /obs/scenes` маршрут |
| `src/modules/obs-scenes/types.ts` | Интерфейс `ObsScenesService`, `SceneForDisplay` | Нужен метод `isConnected()` для показа статуса (или добавить в интерфейс) |
| `src/modules/obs-scenes/client.ts` | WebSocket-клиент OBS, имеет `isConnected(): boolean` | Не изменяется — метод уже есть, но не проброшен через сервис |
| `src/modules/obs-scenes/scenes-service.ts` | Реализация сервиса: `getScenesForDisplay`, `getCurrentScene`, `setScene` | Нужно добавить `isConnected()` в реализацию |
| `src/modules/obs-scenes/index.ts` | Фабрика `createObsScenesService` | Не изменяется (реализация сервиса делегирует клиенту) |
| `views/idle.ejs` | Единственный EJS-шаблон (текущая idle-страница) | Образец для нового шаблона |
| `src/modules/config/types.ts` | `AppConfig.idle.viewsPath` — путь к папке views | Не изменяется |
| `test/idle-server.test.ts` | Тесты маршрутов idle-сервера | Добавить тест для `GET /obs/scenes` |

## Текущие интерфейсы и API

### `ObsScenesService` (src/modules/obs-scenes/types.ts)

```ts
interface ObsScenesService {
  getScenes(): Promise<string[]>;
  getScenesForDisplay(): Promise<SceneForDisplay[]>;
  getCurrentScene(): Promise<string | null>;
  setScene(name: string): Promise<void>;
  disconnect(): Promise<void>;
}
```

Метода `isConnected()` нет. Задача требует показа статуса подключения к OBS. Варианты:
1. **Добавить `isConnected(): boolean` в интерфейс** — чистое решение, требует изменения интерфейса, реализации и мок-объектов в тестах.
2. **Использовать null от `getCurrentScene()`** — неточно: null может быть нормальным состоянием или ошибкой.
3. **Использовать healthChecker** из idle-server — проверяет живость процесса OBS, а не WebSocket-соединение.

Наиболее корректный вариант — добавить `isConnected()` в `ObsScenesService`.

### `ObsWebSocketClient` (src/modules/obs-scenes/client.ts)

```ts
interface ObsWebSocketClient {
  isConnected(): boolean;  // obs != null && obs.identified === true
  // ...
}
```

Уже реализован в клиенте. Нужно пробросить через сервис.

### `SceneForDisplay` (src/modules/obs-scenes/types.ts)

```ts
interface SceneForDisplay {
  name: string;
  title?: string;
  type?: string;
  enabled?: boolean;
}
```

Используется для рендера списка сцен. `title` — отображаемое имя (или `name` если title отсутствует). `enabled` — нужно ли показывать кнопку.

### `startIdleServer` / `setObsScenesService` (src/modules/idle-server/index.ts)

```ts
export function setObsScenesService(service: ObsScenesService | null, log?: Logger): void
```

Сервис уже инжектируется в idle-server через этот setter. Модульная переменная `obsScenes` доступна в обработчиках маршрутов.

### EJS-шаблонизатор

```ts
app.set('views', config.idle.viewsPath);  // путь из конфига
app.set('view engine', 'ejs');
app.get('/', (_req, res) => res.render('idle'));  // renders views/idle.ejs
```

Переменные шаблона передаются через `res.render('obs-scenes', { connected, currentScene, scenes })`.

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить / создать |
|---|---|---|
| `src/modules/obs-scenes/types.ts` | Интерфейс `ObsScenesService` | Добавить `isConnected(): boolean` в интерфейс |
| `src/modules/obs-scenes/scenes-service.ts` | Реализация сервиса | Добавить `isConnected()` делегирующий к `client.isConnected()` |
| `src/modules/idle-server/index.ts` | Express маршруты | Добавить `GET /obs/scenes` — async, вызов `getScenesForDisplay`, `getCurrentScene`, `isConnected`, render `obs-scenes` |
| `views/obs-scenes.ejs` | — | Создать: HTML-страница со статусом, списком сцен, кнопками; выделение активной сцены |
| `test/idle-server.test.ts` | Тесты маршрутов | Добавить тесты `GET /obs/scenes` — с сервисом и без, статусы connected/disconnected |

## Зависимости и ограничения

- **`isConnected()` отсутствует в `ObsScenesService`** — нужно добавить в интерфейс и реализацию. Это затронет мок-объекты в тестах (`test/idle-server.test.ts`, `test/obs-scenes.test.ts`).
- **`viewsPath` из конфига** — шаблон `obs-scenes.ejs` должен быть в той же папке, что и `idle.ejs`. По умолчанию это `views/` в корне проекта (в тестах используется `path.join(process.cwd(), 'views')`).
- **Переключение через fetch** — кнопки на странице вызывают `fetch()` к существующим POST-эндпоинтам (`POST /obs/scene` и т.д.), после успешного ответа делают `location.reload()` или обновляют DOM. Существующие JSON-маршруты не изменяются. Требует JS на странице.
- **OBS недоступен** — если `obsScenes === null` или `isConnected() === false`, страница должна отображать статус «disconnected» без ошибки/краша. Кнопки можно показывать неактивными или убрать.
- **EJS статика** — CSS для выделения активной сцены можно встроить inline в шаблон (нет необходимости в отдельных статических файлах на данном этапе).
- **`enabled: false`** — сцены с `enabled: false` из config могут не отображаться как кнопки переключения, но кнопки Backup и Default показываются всегда.
- **Авторизация** — не требуется (§12 требований, уточнение §18).
