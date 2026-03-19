# OBS control logic (without launch)

This document describes how the application controls an **already running** OBS instance via WebSocket: connection, scene switching, projector, and Chrome source binding. It is intended for porting this logic to another repository where OBS is not started by the application and is only controlled over WebSocket.

**Out of scope for this document:** OBS launch parameters (path to binary, configDir, readyTimeout, profilePath, launch, restart). Those are documented separately.

## Table of contents

1. [Connection to OBS over WebSocket](#1-connection-to-obs-over-websocket)
2. [OBS API data and actions](#2-obs-api-data-and-actions)
3. [Scene roles and switching logic](#3-scene-roles-and-switching-logic)
4. [Scene configuration (JSON)](#4-scene-configuration-json)
5. [Projector and Chrome source binding](#5-projector-and-chrome-source-binding)
6. [Control configuration (summary table)](#6-control-configuration-summary-table)
7. [Entry points (dependencies)](#7-entry-points-dependencies)

---

## 1. Connection to OBS over WebSocket

- **URL:** `ws://${host}:${port}`. Password is sent at connect time.
- **Methods:** `connect()`, `disconnect()`, `isConnected()`.
- **Reconnection on disconnect:** Exponential backoff: initial delay 3s, maximum 60s. On `ConnectionClosed` or connect failure, reconnection is scheduled; delay doubles after each attempt up to the cap.
- **Dependency:** OBS WebSocket 5.x protocol; library `obs-websocket-js`.

**Configuration (control only):**

| Env variable   | Config field | Purpose        |
|----------------|-------------|----------------|
| OBS_HOST       | host        | WebSocket host |
| OBS_PORT       | port        | WebSocket port |
| OBS_PASSWORD   | password    | WebSocket password |

**Example: URL and connect**

```ts
const url = `ws://${host}:${port}`;
// ...
socket.connect(url, password);
```

**Example: exponential backoff**

```ts
const DEFAULT_RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 60000;
let reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;

function scheduleReconnect(): void {
  reconnectTimer = setTimeout(() => {
    tryConnect();
  }, reconnectDelayMs);
  reconnectDelayMs = Math.min(MAX_RECONNECT_DELAY_MS, reconnectDelayMs * 2);
}

socket.on('ConnectionClosed', () => {
  obs = null;
  scheduleReconnect();
});
```

---

## 2. OBS API data and actions

### Data (read)

| OBS WebSocket method     | Client method                          | Purpose |
|--------------------------|----------------------------------------|--------|
| GetSceneList             | `getSceneList()`                       | List of scene names |
| GetCurrentProgramScene   | `getCurrentProgramScene()`             | Current program scene name |
| GetMonitorList           | `getMonitorList()`                     | Monitors (index, name, size, position) for projector |
| GetSceneItemList(sceneName) | `getSceneItemList(sceneName)`       | Scene items in a scene (sourceName, sourceType, sceneItemId, sceneItemEnabled) |
| GetInputSettings(inputName) | `getInputSettings(inputName)`      | Input settings (e.g. for capture_window) |

### Actions (write)

| OBS WebSocket method     | Client method                          | Purpose in this app |
|--------------------------|----------------------------------------|----------------------|
| SetCurrentProgramScene(sceneName) | `setCurrentProgramScene(sceneName)` | Not used for main switching; scene switching is done via nested scenes in the output scene |
| OpenSourceProjector(sourceName, monitorIndex) | `openSourceProjector(sourceName, monitorIndex)` | Show a source (scene) on a specific monitor; projectorType: Source |
| SetSceneItemEnabled(sceneName, sceneItemId, enabled) | `setSceneItemEnabled(sceneName, sceneItemId, sceneItemEnabled)` | Switch visible nested scene inside the output scene |
| SetInputSettings(inputName, inputSettings) | `setInputSettings(inputName, inputSettings)` | Bind a window-capture source to a window (e.g. Chrome via capture_window) |

**Example: GetSceneList**

```ts
async getSceneList(): Promise<{ scenes: Array<{ sceneName: string }> }> {
  const res = await obs.call('GetSceneList');
  const scenes = (res as { scenes?: unknown[] }).scenes ?? [];
  return {
    scenes: scenes.map((s: unknown) => ({
      sceneName: (s as { sceneName?: string }).sceneName ?? '',
    })),
  };
}
```

**Example: OpenSourceProjector**

```ts
await obs.call('OpenSourceProjector', {
  sourceName,
  projectorType: 'Source',
  monitorIndex,
});
```

**Example: SetSceneItemEnabled**

```ts
await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled });
```

**Example: SetInputSettings (Chrome window binding)**

```ts
await client.setInputSettings(sourceName, { capture_window: xid });
```

---

## 3. Scene roles and switching logic

### Roles

- **main** — Projector scene; not switched by user; used for projector output (OpenSourceProjector).
- **output** — Aggregate scene; its name is taken from `outputSceneName`. Nested (input) scenes are toggled inside it.
- **input** — Nested, switchable scenes inside the output scene.
- **backup** / **default** — Special scenes by name; dedicated commands/buttons.

### Current scene

Current scene is determined in the scene named `outputSceneName`: list nested scene items (items with `sourceType === 'OBS_SOURCE_TYPE_SCENE'`). The **current** scene is the single nested scene whose `sceneItemEnabled === true`.

### Switching

In the scene `outputSceneName`, for each nested scene item call `SetSceneItemEnabled(sceneName, sceneItemId, enabled)` with `enabled === true` only when `sourceName === name`, and `false` for all others. If `name` is not among the nested scene names, the service throws `SceneNotFoundError`.

**Example: get nested scene items (only scenes)**

```ts
async function getNestedSceneItems(outputSceneName: string) {
  const { sceneItems } = await client.getSceneItemList(outputSceneName);
  return sceneItems.filter((item) => item.sourceType === 'OBS_SOURCE_TYPE_SCENE');
}
```

**Example: getCurrentScene**

```ts
const items = await getNestedSceneItems(outputSceneName);
const enabled = items.find((item) => item.sceneItemEnabled);
return enabled?.sourceName ?? null;
```

**Example: setScene — enable only one nested scene**

```ts
const items = await getNestedSceneItems(outputSceneName);
const target = items.find((item) => item.sourceName === name);
if (!target) throw new SceneNotFoundError(name, `Scene not found: ${name}`);
for (const item of items) {
  await client.setSceneItemEnabled(outputSceneName, item.sceneItemId, item.sourceName === name);
}
```

### Service API

- `getScenes()` — Raw list of scene names from OBS.
- `getScenesForDisplay()` — Scenes filtered by config: exclude `type === 'main'` and `enabled === false`; include optional title/type from config.
- `getCurrentScene()` — Name of the single enabled nested scene in `outputSceneName`, or null.
- `setScene(name)` — Enable only the nested scene with `sourceName === name` in `outputSceneName`; others disabled. Throws `SceneNotFoundError` if not found.

**Example: filter switchable scenes (exclude main, respect enabled)**

```ts
function isSwitchableScene(entry: SceneConfigEntry | undefined): boolean {
  if (entry?.enabled === false) return false;
  if (!entry?.type) return true;
  if (entry.type === 'main') return false;
  return true;
}
```

---

## 4. Scene configuration (JSON)

- **Path:** Environment variable `SCENES_CONFIG_PATH` (from AppConfig).
- **Format:** JSON array of objects: `{ name, title?, type?, enabled? }`. `type`: `main` | `output` | `input` | `backup` | `default`.
- **Purpose:** Display labels and filtering of switchable scenes; scenes with `type === 'main'` or `enabled === false` are excluded from the switchable list. **Source of truth for which scenes exist is OBS;** the config only enriches display and filters.

**Example: SceneConfigEntry type**

```ts
export interface SceneConfigEntry {
  name: string;
  title?: string;
  type?: string;  // "main" | "output" | "input" | "backup" | "default"
  enabled?: boolean;
}
```

**Example: load and parse scenes config**

```ts
export function loadScenesConfigSync(path: string | undefined): SceneConfigEntry[] | null {
  if (path === undefined || path.trim() === '') return null;
  const raw = fs.readFileSync(path, 'utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) return null;
  const result: SceneConfigEntry[] = [];
  for (const item of data) {
    if (item != null && typeof item === 'object' && typeof item.name === 'string') {
      const entry: SceneConfigEntry = { name: item.name };
      if (typeof item.title === 'string') entry.title = item.title;
      if (typeof item.type === 'string') entry.type = item.type;
      if (typeof item.enabled === 'boolean') entry.enabled = item.enabled;
      result.push(entry);
    }
  }
  return result;
}
```

---

## 5. Projector and Chrome source binding

### Projector

On WebSocket `onConnected` (when configured):

1. Call `GetMonitorList`, then `GetSceneList`.
2. Choose monitor by `projectorMonitorName` (exact match or prefix with `(`).
3. Choose scene for projector: by `projectorSceneName` if set and present in OBS; otherwise first scene whose name starts with `output.` (fallback).
4. Call `OpenSourceProjector(sourceName, monitorIndex)` with `projectorType: Source`.

**Config:** `OBS_PROJECTOR_MONITOR_NAME`, `OBS_PROJECTOR_SCENE_NAME`.

**Example: choose monitor**

```ts
const monitor = monitors.find(
  (m) => m.monitorName === projectorMonitorName || m.monitorName.startsWith(`${projectorMonitorName}(`)
);
```

**Example: choose projector scene (with fallback)**

```ts
let projectorScene = projectorSceneName != null
  ? scenes.find((s) => s.sceneName === projectorSceneName) ?? null
  : null;
if (!projectorScene) {
  projectorScene = scenes.find((s) => s.sceneName.startsWith('output.')) ?? null;
}
await client.openSourceProjector(projectorScene.sceneName, monitor.monitorIndex);
```

### Chrome source binding

1. Find window by class using `xdotool search --onlyvisible --class chrome`, get window XID.
2. Call `SetInputSettings(sourceName, { capture_window: xid })` to bind the OBS source to that window.

**Config:** `OBS_CHROME_SOURCE_NAME`. **Dependencies:** `xdotool` (Linux); OBS source must support `capture_window` (window capture).

**Example: bind Chrome window to OBS source**

```ts
const RETRY_INTERVAL_MS = 500;
const TIMEOUT_MS = 10_000;
const deadline = Date.now() + timeoutMs;

while (Date.now() < deadline) {
  const { stdout } = await execFile('xdotool', ['search', '--onlyvisible', '--class', 'chrome']);
  const xid = stdout.trim().split('\n')[0];
  if (!xid) { await sleep(RETRY_INTERVAL_MS); continue; }
  await client.setInputSettings(sourceName, { capture_window: xid });
  return;
}
```

---

## 6. Control configuration (summary table)

Environment variables and config fields **for control only** (no path, configDir, readyTimeout, profilePath, launch, restart):

| Variable / field              | Purpose |
|-------------------------------|--------|
| OBS_HOST / host               | WebSocket host |
| OBS_PORT / port               | WebSocket port |
| OBS_PASSWORD / password       | WebSocket password |
| OBS_PROJECTOR_MONITOR_NAME    | Monitor for Source Projector |
| OBS_PROJECTOR_SCENE_NAME      | Scene to show on projector |
| OBS_OUTPUT_SCENE_NAME         | Output (aggregate) scene name |
| OBS_CHROME_SOURCE_NAME        | Input name for Chrome window binding |
| SCENES_CONFIG_PATH            | Path to scenes JSON config |

---

## 7. Entry points (dependencies)

Logic is invoked from:

- **Service creation:** Create OBS WebSocket client with `host`, `port`, `password`, optional `onConnected` callback; create scenes service with `client`, `outputSceneName`, `scenesConfig`. The service is passed to idle-server and telegram-bot.
- **HTTP API:**  
  - GET `/obs/scenes` — Current scene + list for display (SSR page).  
  - POST `/obs/scene` — Body: `{ "scene": "<name>" }`.  
  - POST `/obs/scene/backup` — Switch to scene `backup`.  
  - POST `/obs/scene/default` — Switch to scene `default`.
- **Telegram:** Commands `/scenes`, `/scene`, `/current`, `/backup`, `/default`, `/status`; callback_data for scene buttons (e.g. `scene:name`); scenes list filtered by prefix `src.` for the displayed list.

The **contracts** (what to call against OBS and how to interpret config) are not tied to Node/Express/Telegram; another stack can implement the same behaviour from this description.
