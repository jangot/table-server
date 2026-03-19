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

**Sources:** `src/modules/chrome/cdp.ts`, `src/modules/chrome/waitDevTools.ts`.

- **Endpoint:** `http://127.0.0.1:${port}`. The port comes from configuration (default 9222). The application connects using **puppeteer-core**: `connect({ browserURL: 'http://127.0.0.1:${port}' })`.
- **Waiting for readiness:** Before using CDP, the app can wait until DevTools is ready by polling `GET http://127.0.0.1:${port}/json/version` every 250 ms until the response is 200 or a timeout is reached. This is implemented in `waitForDevTools(port, timeoutMs)`. For a "control-only" setup (no process launch), this can be used to verify that Chrome is ready without starting it.
- **Reconnection:** The current code does not maintain a long-lived connection. Each navigation creates a new CDP connection and disconnects when done (`browser.disconnect()`). There is no explicit reconnection on connection loss. The document should note that readiness can be checked via `GET /json/version` or a successful `connect()` when implementing in a new project.

---

## 2. Getting data

**Sources:** `src/modules/chrome/lastUrlState.ts`, `src/modules/chrome/cdp.ts`.

- **Current URL:** Read from a file with `readLastUrl(filePath)` (returns `Promise<string | null>`). The path is from config `lastUrlStatePath` (default `./.last-url`). The URL is written on every successful navigation via `writeLastUrl(statePath, url)`.
- **Tabs/pages:** Only the first page is used: `pages[0]` or a single `newPage()`. There is no support for multiple tabs or windows.
- **Window size (viewport):** Set via CDP during navigation: `page.setViewport({ width, height, deviceScaleFactor })`. Values come from config: `windowWidth`, `windowHeight`, `deviceScaleFactor`. Zoom and fullscreen via CDP are not used.

---

## 3. Control actions (navigation, viewport, scripts)

**Sources:** `src/modules/chrome/cdp.ts`, `src/modules/chrome/scriptRegistry.ts`.

- **Navigation:** `navigateToUrl(port, url, statePath, logger, options?)`:
  - Connects to `browserURL`, gets or creates a page (`pages[0]` or `newPage()`).
  - If `options.viewport` is present, calls `page.setViewport()`.
  - Then `page.goto(url, { waitUntil: 'domcontentloaded', timeout })`.
  - If `options.scriptRegistry` is present, runs the domain script (see below).
  - Writes the URL to the state file with `writeLastUrl(statePath, url)`.
  - Disconnects with `browser.disconnect()`.

  Order in code: **connect → page → setViewport? → goto → resolveScript? → evaluate? → writeLastUrl → disconnect**.

- **Domain scripts:** A map `hostname → script filename` is loaded from a JSON file via `loadScriptMap(mapPath)`. On navigation, `resolveScript(url, scriptsDir, scriptMap, logger)` is called: the URL’s hostname is used to look up the filename in the map; the file is read from `scriptsDir` (only basename is used, no `..`). The script is executed after `goto` with `page.evaluate(script)`. Limit: one script per domain, run after `domcontentloaded`. Config: `chromeScriptsDir`, `chromeScriptsMap` (path to the JSON map).

---

## 4. Binding Chrome window to OBS source

**Sources:** `src/modules/obs-scenes/chrome-window-bind.ts`, `src/modules/obs-scenes/index.ts`. See also `docs/requirements/obs_chrome_window_binding.md` for the broader spec (XID, xdotool, SetInputSettings).

- **When it runs:** On OBS connect/reconnect — `onConnected` callback runs `bindChromeWindow(client, chromeSourceName, logger)`.
- **Finding the window:** On X11, run `xdotool search --onlyvisible --class chrome` and take the first XID from stdout.
- **Action:** Call OBS WebSocket `client.setInputSettings(sourceName, { capture_window: xid })`. On error, log and retry every 500 ms until a deadline (default 10 s).
- **Config:** `obs.chromeSourceName` — the name of the Window Capture source in OBS. The code uses the key **`capture_window`** (not `window`) in SetInputSettings.

---

## 5. Control configuration (summary table)

Configuration used **only for control** (no launch-related fields such as path, userDataDir, kiosk, windowMode, position, ozonePlatform). Sources: `src/modules/config/types.ts`, `src/modules/config/validate.ts`.

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

**Sources:** `src/modules/telegram-bot/handlers.ts`, `src/index.ts`, `src/modules/idle-server/index.ts`.

- **Application startup:** After the orchestrator has run, the app calls `readLastUrl(statePath)` once and, if a URL is returned, calls `navigateToUrl(lastUrl)` to restore the last page.
- **Telegram:**  
  - `/idle` → `navigateToUrl(idleUrl)` (idle URL is `http://localhost:${config.idle.port}/`).  
  - A text message containing a URL → `navigateToUrl(url)`.  
  - `/restart chrome` (or `all`) → `restartChrome`. In a new project that does not start Chrome, process restart is not applicable; the document only describes the current call pattern (restart triggers kill + launch in this codebase).
- **HTTP (idle-server):** Does **not** trigger Chrome navigation. It serves `/health` (chrome/obs alive), `GET /obs/scenes`, and `POST /obs/scene` for scene switching.
- **Injected into the bot:** `navigateToUrl`, `isChromeAlive`, `restartChrome` are passed from `src/index.ts`.

---

## 7. Checking "Chrome alive" (isChromeAlive)

**Source:** `src/modules/chrome/index.ts`.

- **Current POC implementation:** Uses `getChromeProcess()` — the process that the application started. In a repository that does not start Chrome, this process will not exist.
- **Recommendation for "control only":** Treat Chrome as alive if CDP is reachable, e.g. successful `GET /json/version` on the CDP port or a successful `connect()`. If that fails, consider Chrome unavailable. This alternative should be described when porting to the new project.

---

## 8. Completeness checklist

- [x] Connecting to Chrome: CDP endpoint, port, reconnection/readiness (GET /json/version, connect).
- [x] Getting data: current URL (file), tabs/windows (single page only), viewport.
- [x] Actions: navigation, viewport, domain scripts (map format, hostname, basename safety).
- [x] Binding Chrome window to OBS: xdotool, XID, SetInputSettings(`capture_window`), when it runs.
- [x] Control-only configuration and list of excluded launch variables.
- [x] Dependencies: who calls Chrome logic (startup, Telegram); idle-server does not trigger navigation.
- [x] isChromeAlive: current implementation and recommended CDP-based check for the new project.

The document should allow a developer in the new repository to implement control of an already-running Chrome instance without reading the current codebase; all modules/files referenced in the analysis are covered in the sections above.
