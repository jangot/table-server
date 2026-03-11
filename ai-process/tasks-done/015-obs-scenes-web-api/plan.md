# План реализации: Web API для переключения сцен OBS

Добавить три POST-эндпоинта в существующий Express-сервер (`idle-server`) для переключения сцен OBS. Новые маршруты используют уже готовый `ObsScenesService` по тому же паттерну, что и `setHealthChecker`.

## 1. Расширить `idle-server`: setter + middleware + маршруты

**Файл (изменить):** `src/modules/idle-server/index.ts`

Добавить:
- Модульную переменную `obsScenes: ObsScenesService | null` и экспортируемую функцию `setObsScenesService`
- `app.use(express.json())` перед новыми маршрутами
- Три POST-маршрута: `/obs/scene`, `/obs/scene/backup`, `/obs/scene/default`
- Вспомогательную внутреннюю функцию `handleSceneSwitch` для устранения дублирования логики

```typescript
import express from 'express';
import * as http from 'http';
import type { AppConfig } from '../config/types';
import type { ObsScenesService } from '../obs-scenes/types';
import { SceneNotFoundError } from '../obs-scenes/types';
import type { Logger } from '../logger';

let healthChecker: (() => { chrome: boolean; obs: boolean }) | null = null;
let obsScenes: ObsScenesService | null = null;
let logger: Logger | null = null;

export function setHealthChecker(fn: (() => { chrome: boolean; obs: boolean }) | null): void {
  healthChecker = fn;
}

export function setObsScenesService(service: ObsScenesService | null, log?: Logger): void {
  obsScenes = service;
  if (log) logger = log;
}

async function handleSceneSwitch(
  sceneName: string,
  res: express.Response
): Promise<void> {
  if (!obsScenes) {
    res.status(503).json({ error: 'OBS scenes service not available' });
    return;
  }
  try {
    await obsScenes.setScene(sceneName);
    logger?.info(`scene_switch source=web scene=${sceneName} success=true`);
    res.status(200).json({ ok: true, scene: sceneName });
  } catch (err) {
    if (err instanceof SceneNotFoundError) {
      logger?.warn(`scene_switch source=web scene=${sceneName} success=false error=not_found`);
      res.status(404).json({ error: `Scene not found: ${sceneName}` });
    } else {
      logger?.error(`scene_switch source=web scene=${sceneName} success=false error=obs_unavailable`);
      res.status(503).json({ error: 'OBS not available' });
    }
  }
}

export function startIdleServer(config: AppConfig): Promise<http.Server> {
  const app = express();
  app.set('views', config.idle.viewsPath);
  app.set('view engine', 'ejs');

  app.get('/', (_req, res) => res.render('idle'));

  app.get('/health', (_req, res) => {
    if (!healthChecker) {
      return res.status(200).json({ ready: false, chrome: false, obs: false });
    }
    const { chrome, obs } = healthChecker();
    res.status(200).json({ ready: chrome && obs, chrome, obs });
  });

  app.use(express.json());

  app.post('/obs/scene', async (req, res) => {
    const { scene } = req.body ?? {};
    if (typeof scene !== 'string' || !scene) {
      res.status(400).json({ error: 'Missing or invalid field: scene' });
      return;
    }
    await handleSceneSwitch(scene, res);
  });

  app.post('/obs/scene/backup', async (_req, res) => {
    await handleSceneSwitch('backup', res);
  });

  app.post('/obs/scene/default', async (_req, res) => {
    await handleSceneSwitch('default', res);
  });

  return new Promise((resolve) => {
    const server = app.listen(config.idle.port, () => resolve(server));
  });
}
```

## 2. Подключить сервис в точке входа приложения

**Файл (изменить):** `src/index.ts`

Импортировать `setObsScenesService` и вызвать сразу после создания `obsScenesService`.

```typescript
import { startIdleServer, setHealthChecker, setObsScenesService } from './modules/idle-server';

// ...существующий код...

const obsScenesService = createObsScenesService(config.obs, logger, config.scenesConfigPath);

// Добавить эту строку:
setObsScenesService(obsScenesService, logger);
```

Место вставки — сразу после строки с `createObsScenesService` (до блока watchdog и telegram). Это гарантирует, что API доступен сразу после инициализации сервиса, независимо от запуска Telegram-бота.

## 3. Тесты

**Файл (изменить):** `test/idle-server.test.ts`

Добавить новый `describe`-блок `'OBS scene API'` в тот же файл, переиспользуя тот же сервер на том же порту.

Для тестов создать mock-объект `ObsScenesService`:

```typescript
import { setObsScenesService } from '../src/modules/idle-server';
import { SceneNotFoundError } from '../src/modules/obs-scenes/types';
import type { ObsScenesService } from '../src/modules/obs-scenes/types';

// Вспомогательная функция для HTTP POST без тела
function postJson(port: number, path: string, body?: object): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : '';
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}
```

Сценарии:

**`POST /obs/scene`:**
- Happy path: передать `{"scene": "chrome"}`, сервис успешно переключает → 200, `{ ok: true, scene: 'chrome' }`
- Ошибка 400: тело без поля `scene` → 400, сообщение об ошибке
- Ошибка 400: пустая строка `{"scene": ""}` → 400
- Ошибка 404: сервис бросает `SceneNotFoundError` → 404, сообщение
- Ошибка 503: сервис бросает `Error('OBS WebSocket not connected')` → 503
- Ошибка 503: `setObsScenesService(null)` → 503

**`POST /obs/scene/backup`:**
- Happy path: сервис вызван с `'backup'` → 200
- Ошибка 503: OBS недоступен → 503

**`POST /obs/scene/default`:**
- Happy path: сервис вызван с `'default'` → 200

```typescript
describe('OBS scene API', () => {
  let mockService: ObsScenesService;

  beforeEach(() => {
    mockService = {
      getScenes: async () => [],
      getScenesForDisplay: async () => [],
      getCurrentScene: async () => null,
      setScene: async (_name: string) => {},
      disconnect: async () => {},
    };
    setObsScenesService(mockService);
  });

  afterEach(() => {
    setObsScenesService(null);
  });

  it('POST /obs/scene returns 200 on success', async () => {
    const result = await postJson(testPort, '/obs/scene', { scene: 'chrome' });
    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body, { ok: true, scene: 'chrome' });
  });

  it('POST /obs/scene returns 400 when scene field missing', async () => {
    const result = await postJson(testPort, '/obs/scene', {});
    assert.strictEqual(result.status, 400);
  });

  it('POST /obs/scene returns 400 when scene is empty string', async () => {
    const result = await postJson(testPort, '/obs/scene', { scene: '' });
    assert.strictEqual(result.status, 400);
  });

  it('POST /obs/scene returns 404 on SceneNotFoundError', async () => {
    mockService.setScene = async () => { throw new SceneNotFoundError('chrome'); };
    const result = await postJson(testPort, '/obs/scene', { scene: 'chrome' });
    assert.strictEqual(result.status, 404);
  });

  it('POST /obs/scene returns 503 on OBS connection error', async () => {
    mockService.setScene = async () => { throw new Error('OBS WebSocket not connected'); };
    const result = await postJson(testPort, '/obs/scene', { scene: 'chrome' });
    assert.strictEqual(result.status, 503);
  });

  it('POST /obs/scene returns 503 when service not set', async () => {
    setObsScenesService(null);
    const result = await postJson(testPort, '/obs/scene', { scene: 'chrome' });
    assert.strictEqual(result.status, 503);
  });

  it('POST /obs/scene/backup returns 200 and calls setScene("backup")', async () => {
    let called = '';
    mockService.setScene = async (name) => { called = name; };
    const result = await postJson(testPort, '/obs/scene/backup');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(called, 'backup');
  });

  it('POST /obs/scene/default returns 200 and calls setScene("default")', async () => {
    let called = '';
    mockService.setScene = async (name) => { called = name; };
    const result = await postJson(testPort, '/obs/scene/default');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(called, 'default');
  });
});
```

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/idle-server/index.ts` |
| Изменить | `src/index.ts` |
| Изменить | `test/idle-server.test.ts` |

## Ссылки
- [analyze.md](./analyze.md)
- [description.md](./description.md)
