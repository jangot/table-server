# План реализации: SSR-страница управления сценами OBS

Реализовать SSR-страницу `GET /obs/scenes` — панель управления сценами OBS с отображением статуса подключения, текущей сцены и кнопками переключения. Переключение — через JavaScript `fetch()` к уже существующим POST-эндпоинтам, после которого происходит перезагрузка страницы. OBS может быть недоступен — страница корректно отображает состояние «disconnected».

## 1. Добавить `isConnected()` в интерфейс `ObsScenesService`

**Файл (изменить):** `src/modules/obs-scenes/types.ts`

Добавить метод в интерфейс — единственное изменение в этом файле.

```typescript
export interface ObsScenesService {
  getScenes(): Promise<string[]>;
  getScenesForDisplay(): Promise<SceneForDisplay[]>;
  getCurrentScene(): Promise<string | null>;
  setScene(name: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;  // <-- добавить
}
```

## 2. Реализовать `isConnected()` в `scenes-service.ts`

**Файл (изменить):** `src/modules/obs-scenes/scenes-service.ts`

Делегировать к `client.isConnected()` — он уже реализован в `ObsWebSocketClient`.

```typescript
export function createObsScenesServiceImpl(config: ObsScenesServiceConfig): ObsScenesService {
  const { client, logger } = config;

  return {
    // ... существующие методы ...

    isConnected(): boolean {
      return client.isConnected();
    },
  };
}
```

## 3. Добавить маршрут `GET /obs/scenes` в idle-server

**Файл (изменить):** `src/modules/idle-server/index.ts`

Добавить маршрут после `/health`. Если `obsScenes === null` — рендерить с `connected: false` и пустыми данными (не бросать ошибку).

```typescript
app.get('/obs/scenes', async (_req, res) => {
  if (!obsScenes) {
    return res.render('obs-scenes', {
      connected: false,
      currentScene: null,
      scenes: [],
    });
  }
  const connected = obsScenes.isConnected();
  const [currentScene, scenes] = await Promise.all([
    obsScenes.getCurrentScene(),
    obsScenes.getScenesForDisplay(),
  ]);
  res.render('obs-scenes', { connected, currentScene, scenes });
});
```

## 4. Создать EJS-шаблон `views/obs-scenes.ejs`

**Файл (создать):** `views/obs-scenes.ejs`

Страница отображает:
- статус подключения (зелёный/красный бейдж)
- текущую активную сцену
- список сцен в виде кнопок (только с `enabled !== false`), активная выделена
- кнопки Backup и Default всегда

Переключение — через `fetch()` + `location.reload()`. CSS встроен inline.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OBS Scenes</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.875rem; }
    .badge-ok { background: #d4edda; color: #155724; }
    .badge-err { background: #f8d7da; color: #721c24; }
    .scenes { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1rem 0; }
    button { padding: 0.5rem 1rem; border: 1px solid #ccc; border-radius: 6px; cursor: pointer; background: #fff; }
    button:hover { background: #f0f0f0; }
    button.active { background: #007bff; color: #fff; border-color: #007bff; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .special-buttons { display: flex; gap: 0.5rem; margin-top: 1rem; }
  </style>
</head>
<body>
  <h1>OBS Scenes</h1>

  <p>
    Status:
    <% if (connected) { %>
      <span class="badge badge-ok">connected</span>
    <% } else { %>
      <span class="badge badge-err">disconnected</span>
    <% } %>
  </p>

  <% if (currentScene) { %>
    <p>Current scene: <strong><%= currentScene %></strong></p>
  <% } %>

  <div class="scenes">
    <% scenes.filter(s => s.enabled !== false).forEach(scene => { %>
      <button
        class="<%= currentScene === scene.name ? 'active' : '' %>"
        onclick="switchScene('<%= scene.name %>')"
        <%= !connected ? 'disabled' : '' %>
      >
        <%= scene.title || scene.name %>
      </button>
    <% }) %>
  </div>

  <div class="special-buttons">
    <button onclick="switchScene('backup')" <%= !connected ? 'disabled' : '' %>>Backup</button>
    <button onclick="switchScene('default')" <%= !connected ? 'disabled' : '' %>>Default</button>
  </div>

  <script>
    async function switchScene(name) {
      const url = name === 'backup' ? '/obs/scene/backup'
                : name === 'default' ? '/obs/scene/default'
                : '/obs/scene';
      const body = (name === 'backup' || name === 'default')
        ? undefined
        : JSON.stringify({ scene: name });
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body,
        });
        if (res.ok) {
          location.reload();
        } else {
          alert('Error: ' + res.status);
        }
      } catch (e) {
        alert('Network error');
      }
    }
  </script>
</body>
</html>
```

## 5. Обновить моки в тестах и добавить тесты `GET /obs/scenes`

**Файл (изменить):** `test/idle-server.test.ts`

### 5.1 Обновить существующие моки

Во всех местах где создаётся `mockService: ObsScenesService` добавить `isConnected`:

```typescript
mockService = {
  getScenes: async () => [],
  getScenesForDisplay: async () => [],
  getCurrentScene: async () => null,
  setScene: async () => {},
  disconnect: async () => {},
  isConnected: () => true,  // <-- добавить
};
```

### 5.2 Добавить вспомогательную функцию для GET-запросов

```typescript
function getHtml(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString('utf8') })
      );
    });
    req.on('error', reject);
  });
}
```

### 5.3 Тесты для `GET /obs/scenes`

Добавить внутри `describe('OBS scene API', ...)`:

```typescript
it('GET /obs/scenes returns 200 and shows connected when service connected', async () => {
  mockService.isConnected = () => true;
  mockService.getCurrentScene = async () => 'chrome';
  mockService.getScenesForDisplay = async () => [
    { name: 'chrome', title: 'Chrome', enabled: true },
    { name: 'backup', enabled: true },
  ];
  const result = await getHtml(testPort, '/obs/scenes');
  assert.strictEqual(result.status, 200);
  assert.ok(result.body.includes('connected'));
  assert.ok(result.body.includes('Chrome'));
  assert.ok(result.body.includes('chrome')); // currentScene
});

it('GET /obs/scenes returns 200 and shows disconnected when service not connected', async () => {
  mockService.isConnected = () => false;
  const result = await getHtml(testPort, '/obs/scenes');
  assert.strictEqual(result.status, 200);
  assert.ok(result.body.includes('disconnected'));
});

it('GET /obs/scenes returns 200 with disconnected when obsScenes is null', async () => {
  setObsScenesService(null);
  const result = await getHtml(testPort, '/obs/scenes');
  assert.strictEqual(result.status, 200);
  assert.ok(result.body.includes('disconnected'));
});

it('GET /obs/scenes does not show disabled scenes as buttons', async () => {
  mockService.isConnected = () => true;
  mockService.getCurrentScene = async () => null;
  mockService.getScenesForDisplay = async () => [
    { name: 'visible', enabled: true },
    { name: 'hidden', enabled: false },
  ];
  const result = await getHtml(testPort, '/obs/scenes');
  assert.ok(result.body.includes('visible'));
  assert.ok(!result.body.includes('>hidden<'));  // disabled scene is not a button
});
```

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/obs-scenes/types.ts` |
| Изменить | `src/modules/obs-scenes/scenes-service.ts` |
| Изменить | `src/modules/idle-server/index.ts` |
| Создать  | `views/obs-scenes.ejs` |
| Изменить | `test/idle-server.test.ts` |

## Ссылки

- [analyze.md](./analyze.md)
