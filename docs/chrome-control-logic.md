# Chrome control logic (without launch)

This document describes how the application controls an **already running** Chrome instance via CDP (Chrome DevTools Protocol). It is intended for porting this logic to another repository where Chrome is not started by the application — only controlled after it is running.

**Scope:** connection to Chrome, reading/writing state, navigation, viewport, domain scripts, binding the Chrome window to an OBS source, and configuration used for control. **Out of scope:** Chrome launch parameters (path, userDataDir, kiosk, flags, ozonePlatform, window position, etc.) are not documented here.

## Contents

1. [Connecting to Chrome via CDP](#1-connecting-to-chrome-via-cdp)
2. [Getting data](#2-getting-data)
3. [Control actions (navigation, viewport, scripts)](#3-control-actions-navigation-viewport-scripts)
4. [Binding Chrome window to OBS source](#4-binding-chrome-window-to-obs-source)
5. [Control configuration (summary table)](#5-control-configuration-summary-table)
6. [Dependencies and command sources](#6-dependencies-and-command-sources)
7. [Checking "Chrome alive" (isChromeAlive)](#7-checking-chrome-alive-ischromealive)
8. [Completeness checklist](#8-completeness-checklist)

---

## 1. Connecting to Chrome via CDP

- **Endpoint:** `http://127.0.0.1:${port}`. The port comes from configuration (default 9222). The application connects using **puppeteer-core**: `connect({ browserURL: 'http://127.0.0.1:${port}' })`.
- **Waiting for readiness:** Before using CDP, the app can wait until DevTools is ready by polling `GET http://127.0.0.1:${port}/json/version` every 250 ms until the response is 200 or a timeout is reached. For a "control-only" setup (no process launch), this can be used to verify that Chrome is ready without starting it.
- **Reconnection:** The current code does not maintain a long-lived connection. Each navigation creates a new CDP connection and disconnects when done (`browser.disconnect()`). There is no explicit reconnection on connection loss. When implementing in a new project: readiness can be checked via `GET /json/version` or a successful `connect()`.

**Example: connect with puppeteer-core**

```ts
import { connect } from 'puppeteer-core';

const browser = await connect({ browserURL: `http://127.0.0.1:${port}` });
try {
  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());
  // ... use page
} finally {
  await browser.disconnect();
}
```

**Example: wait for DevTools (polling)**

```ts
export function waitForDevTools(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  const intervalMs = 250;

  return new Promise((resolve, reject) => {
    function tick(): void {
      if (Date.now() - start >= timeoutMs) {
        reject(new Error(`Chrome DevTools not ready within ${timeoutMs}ms`));
        return;
      }
      const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
        if (res.statusCode === 200) {
          res.resume();
          resolve();
          return;
        }
        setTimeout(tick, intervalMs);
      });
      req.on('error', () => setTimeout(tick, intervalMs));
      req.end();
    }
    tick();
  });
}
```

---

## 2. Getting data

- **Current URL:** Read from a file with `readLastUrl(filePath)` (returns `Promise<string | null>`). The path is from config `lastUrlStatePath` (default `./.last-url`). The URL is written on every successful navigation via `writeLastUrl(statePath, url)`.
- **Tabs/pages:** Only the first page is used: `pages[0]` or a single `newPage()`. There is no support for multiple tabs or windows.
- **Window size (viewport):** Set via CDP during navigation: `page.setViewport({ width, height, deviceScaleFactor })`. Values come from config: `windowWidth`, `windowHeight`, `deviceScaleFactor`. Zoom and fullscreen via CDP are not used.

**Example: read/write last URL**

```ts
export async function readLastUrl(filePath: string): Promise<string | null> {
  try {
    const data = await readFile(filePath, 'utf-8');
    return data.trim() || null;
  } catch {
    return null;
  }
}

export async function writeLastUrl(filePath: string, url: string): Promise<void> {
  await writeFile(filePath, url, 'utf-8');
}
```

---

## 3. Control actions (navigation, viewport, scripts)

- **Navigation:** `navigateToUrl(port, url, statePath, logger, options?)`:
  - Connects to `browserURL`, gets or creates a page (`pages[0]` or `newPage()`).
  - If `options.viewport` is present, calls `page.setViewport()`.
  - Then `page.goto(url, { waitUntil: 'domcontentloaded', timeout })`.
  - If `options.scriptRegistry` is present, runs the domain script (see below).
  - Writes the URL to the state file with `writeLastUrl(statePath, url)`.
  - Disconnects with `browser.disconnect()`.

  Order in code: **connect → page → setViewport? → goto → resolveScript? → evaluate? → writeLastUrl → disconnect**.

- **Domain scripts:** A map `hostname → script filename` is loaded from a JSON file. On navigation, the URL's hostname is used to look up the filename in the map; the file is read from `scriptsDir` (only basename is used, no `..`). The script is executed after `goto` with `page.evaluate(script)`. Limit: one script per domain, run after `domcontentloaded`. Config: `chromeScriptsDir`, `chromeScriptsMap` (path to the JSON map).

**Example: navigateToUrl (core flow)**

```ts
export async function navigateToUrl(
  port: number,
  url: string,
  statePath: string,
  logger: Logger,
  options?: {
    timeoutMs?: number;
    viewport?: { width: number; height: number; deviceScaleFactor?: number };
    scriptRegistry?: { scriptsDir: string; scriptMap: ScriptMap };
  }
): Promise<void> {
  const browser = await connect({ browserURL: `http://127.0.0.1:${port}` });
  try {
    const pages = await browser.pages();
    const page = pages[0] ?? (await browser.newPage());
    if (options?.viewport) {
      await page.setViewport({
        width: options.viewport.width,
        height: options.viewport.height,
        deviceScaleFactor: options.viewport.deviceScaleFactor ?? 1,
      });
    }
    const timeout = options?.timeoutMs ?? 30000;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

    if (options?.scriptRegistry) {
      const { scriptsDir, scriptMap } = options.scriptRegistry;
      const script = resolveScript(url, scriptsDir, scriptMap, logger);
      if (script) {
        await page.evaluate(script);
      }
    }

    await writeLastUrl(statePath, url);
  } finally {
    await browser.disconnect();
  }
}
```

**Example: script map format and resolveScript**

```ts
// Script map JSON: { "hostname": "script.js" }
export type ScriptMap = Record<string, string>;

export function resolveScript(
  url: string,
  scriptsDir: string,
  scriptMap: ScriptMap,
  logger: Logger
): string | null {
  const hostname = new URL(url).hostname;
  const fileName = scriptMap[hostname];
  if (!fileName) return null;
  // Safety: only basename, no ".."
  const safe = path.basename(fileName);
  if (safe !== fileName || safe === '' || safe.includes('..')) return null;
  const scriptPath = path.join(scriptsDir, safe);
  return fs.readFileSync(scriptPath, 'utf-8');
}

// Usage after goto:
if (script) await page.evaluate(script);
```

---

## 4. Binding Chrome window to OBS source

- **When it runs:** On OBS connect/reconnect — `onConnected` callback runs the bind function.
- **Finding the window:** On X11, run `xdotool search --onlyvisible --class chrome` and take the first XID from stdout.
- **Action:** Call OBS WebSocket `client.setInputSettings(sourceName, { capture_window: xid })`. On error, log and retry every 500 ms until a deadline (default 10 s).
- **Config:** `obs.chromeSourceName` — the name of the Window Capture source in OBS. The code uses the key **`capture_window`** (not `window`) in SetInputSettings.

**Example: bind Chrome window (xdotool + SetInputSettings)**

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

## 5. Control configuration (summary table)

Configuration used **only for control** (no launch-related fields such as path, userDataDir, kiosk, windowMode, position, ozonePlatform).

| Config field / env | Description | Default |
|--------------------|-------------|---------|
| `devToolsPort` / `DEVTOOLS_PORT` | CDP port | 9222 |
| `readyTimeout` / `CHROME_READY_TIMEOUT` | Timeout for waiting for DevTools (ms) | — |
| `windowWidth` / `CHROME_WINDOW_WIDTH` | Viewport width on navigation | — |
| `windowHeight` / `CHROME_WINDOW_HEIGHT` | Viewport height on navigation | — |
| `deviceScaleFactor` / `CHROME_DEVICE_SCALE_FACTOR` | Viewport device scale factor | — |
| `lastUrlStatePath` / `LAST_URL_STATE_PATH` | Path to file storing last URL | `./.last-url` |
| `chromeScriptsDir` / `CHROME_SCRIPTS_DIR` | Directory for domain scripts | — |
| `chromeScriptsMap` / `CHROME_SCRIPTS_MAP` | Path to JSON map hostname → script file | — |
| `idle.port` / `IDLE_PORT` | Port used to build default/idle URL (`http://localhost:${port}/`) | — |
| `obs.chromeSourceName` / `OBS_CHROME_SOURCE_NAME` | OBS source name for Chrome window binding | — |

**Explicitly not included** (launch-only): `CHROME_PATH`, `CHROME_USER_DATA_DIR`, `CHROME_WINDOW_MODE`, `CHROME_KIOSK`, `CHROME_WINDOW_POSITION_*`, `CHROME_OZONE_PLATFORM`.

---

## 6. Dependencies and command sources

- **Application startup:** After the orchestrator has run, the app calls `readLastUrl(statePath)` once and, if a URL is returned, calls `navigateToUrl(lastUrl)` to restore the last page.
- **Telegram:**  
  - `/idle` → `navigateToUrl(idleUrl)` (idle URL is `http://localhost:${config.idle.port}/`).  
  - A text message containing a URL → `navigateToUrl(url)`.  
  - `/restart chrome` (or `all`) → restart. In a new project that does not start Chrome, process restart is not applicable; the document only describes the current call pattern.
- **HTTP (idle-server):** Does **not** trigger Chrome navigation. It serves `/health` (chrome/obs alive), `GET /obs/scenes`, and `POST /obs/scene` for scene switching.
- **Injected into the bot:** `navigateToUrl`, `isChromeAlive`, `restartChrome` are passed from the application bootstrap.

---

## 7. Checking "Chrome alive" (isChromeAlive)

- **Current POC implementation:** Uses the process that the application started. In a repository that does not start Chrome, this process will not exist.
- **Recommendation for "control only":** Treat Chrome as alive if CDP is reachable, e.g. successful `GET /json/version` on the CDP port or a successful `connect()`. If that fails, consider Chrome unavailable. This alternative should be implemented when porting to the new project.

**Example: POC (process-based)**

```ts
function isChromeAlive(): boolean {
  const proc = getChromeProcess();
  return proc != null && proc.exitCode === null;
}
```

**Example: control-only (CDP-based)**

```ts
async function isChromeAlive(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return res.status === 200;
  } catch {
    return false;
  }
}
```

---

## 8. Completeness checklist

- [x] Connecting to Chrome: CDP endpoint, port, reconnection/readiness (GET /json/version, connect).
- [x] Getting data: current URL (file), tabs/windows (single page only), viewport.
- [x] Actions: navigation, viewport, domain scripts (map format, hostname, basename safety).
- [x] Binding Chrome window to OBS: xdotool, XID, SetInputSettings(`capture_window`), when it runs.
- [x] Control-only configuration and list of excluded launch variables.
- [x] Dependencies: who calls Chrome logic (startup, Telegram); idle-server does not trigger navigation.
- [x] isChromeAlive: current implementation and recommended CDP-based check for the new project.

The document should allow a developer in the new repository to implement control of an already-running Chrome instance without reading the current codebase; all behaviour described above is covered with examples.
