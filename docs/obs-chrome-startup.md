# OBS and Chrome startup parameters

This document describes the **launch parameters** (executable path, CLI arguments, environment variables) and **state requirements** for OBS and Chrome so that they can be controlled by the application. Use it when starting OBS or Chrome manually or from an external launcher: set the same parameters as the application would use for compatibility with the control logic.

**In scope:** paths, CLI args, env vars passed at launch, and what state OBS/Chrome must be in for control (WebSocket, CDP).

**Out of scope:** Control logic (scene switching, CDP navigation, etc.) — see OBS control logic and Chrome control logic documents.

---

## OBS

### Path to executable

- Config field `obs.path` → environment variable `OBS_PATH`. When the application launches OBS, it uses this value as the executable path.

### Command-line arguments

- If `config.obs.profilePath` is set, one argument is added: `--profile=<profilePath>`. The profile path comes from `OBS_PROFILE_PATH` (optional).

**Example: build OBS args**

```ts
export function buildObsArgs(config: AppConfig): string[] {
  const args: string[] = [];
  if (config.obs.profilePath) {
    args.push(`--profile=${config.obs.profilePath}`);
  }
  return args;
}
```

**Example: full launch command (conceptual)**

```bash
# Example (values from env)
/path/to/obs --profile=/path/to/profile
```

### Environment variables at launch

- When the application starts OBS, it passes `env = { ...process.env, XDG_CONFIG_HOME: config.obs.configDir }`. So `OBS_CONFIG_DIR` sets the OBS configuration directory via `XDG_CONFIG_HOME`.

| Environment variable | Effect on launch |
|----------------------|------------------|
| `OBS_CONFIG_DIR`     | Set as `XDG_CONFIG_HOME` for the OBS process; OBS uses this as its config directory. |

**Example: env passed to OBS process**

```ts
const env = { ...process.env, XDG_CONFIG_HOME: config.obs.configDir };
spawn(obsPath, args, { env, shell: false });
```

### Requirements for OBS to be controllable

- To control the scene and projector, OBS must have the **WebSocket server enabled**. The connection uses host, port, and password; these must match the application settings.
- **Variables:** `OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD` must match the WebSocket server settings in OBS (Tools → WebSocket Server Settings, or equivalent).

---

## Chrome

### Path to executable

- Config field `chrome.path` → environment variable `CHROME_PATH`.

### Command-line arguments (flags)

Full set:

**Always present:**

- `--remote-debugging-port=<port>` — CDP port (from `DEVTOOLS_PORT`, default 9222).
- `--no-first-run`
- `--no-default-browser-check`
- `--disable-default-apps`
- `<initialUrl>` — the URL Chrome opens on start.

**Optional (from config / env):**

- `--user-data-dir=<path>` — from `CHROME_USER_DATA_DIR`.
- Window mode (from `CHROME_WINDOW_MODE` or `CHROME_KIOSK`):
  - **kiosk:** `--kiosk`, `--noerrdialogs`, `--disable-infobars` (and `initialUrl` as last argument).
  - **app:** `--app=<initialUrl>` (initialUrl moved to this flag).
  - **fullscreen:** `--start-fullscreen`.
  - **default:** no extra window flags.
- `--window-position=<x>,<y>` — from `CHROME_WINDOW_POSITION_X`, `CHROME_WINDOW_POSITION_Y`.
- `--window-size=<width>,<height>` — from `CHROME_WINDOW_WIDTH`, `CHROME_WINDOW_HEIGHT`.
- `--force-device-scale-factor=<factor>` — from `CHROME_DEVICE_SCALE_FACTOR` (also applied in kiosk/fullscreen when not set).
- `--ozone-platform=<platform>` — from `CHROME_OZONE_PLATFORM`.

**Mapping:** `DEVTOOLS_PORT`, `CHROME_USER_DATA_DIR`, `CHROME_WINDOW_MODE` (values: `kiosk` | `app` | `fullscreen` | `default`), `CHROME_KIOSK`, `CHROME_WINDOW_WIDTH`, `CHROME_WINDOW_HEIGHT`, `CHROME_WINDOW_POSITION_X`, `CHROME_WINDOW_POSITION_Y`, `CHROME_DEVICE_SCALE_FACTOR`, `CHROME_OZONE_PLATFORM`.

**initialUrl when started by the application:** `http://localhost:<IDLE_PORT>/` (from `idle.port` → `IDLE_PORT`). For external launch: either run the idle server on the same port, or use another URL and be aware that CDP control and transitions to the "idle" page depend on that URL/port.

**Example: build Chrome args**

```ts
export function buildChromeArgs(
  config: AppConfig,
  devToolsPort: number,
  initialUrl: string
): string[] {
  const port = String(devToolsPort);
  const args = [
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    initialUrl,
  ];
  if (config.chrome.userDataDir) {
    args.unshift(`--user-data-dir=${config.chrome.userDataDir}`);
  }
  const mode = config.chrome.windowMode ?? 'default';
  const useKiosk = config.chrome.kiosk === true || mode === 'kiosk';
  if (useKiosk) {
    args.unshift('--kiosk', '--noerrdialogs', '--disable-infobars');
  } else if (mode === 'app') {
    args.pop();
    args.unshift(`--app=${initialUrl}`);
  } else if (mode === 'fullscreen') {
    args.unshift('--start-fullscreen');
  }
  const { windowWidth, windowHeight, windowPositionX, windowPositionY } = config.chrome;
  if (windowPositionX !== undefined && windowPositionY !== undefined) {
    args.unshift(`--window-position=${windowPositionX},${windowPositionY}`);
  }
  if (windowWidth !== undefined && windowHeight !== undefined) {
    args.unshift(`--window-size=${windowWidth},${windowHeight}`);
  }
  const scaleFactor = config.chrome.deviceScaleFactor ?? (useKiosk || mode === 'fullscreen' ? 1 : undefined);
  if (scaleFactor !== undefined) {
    args.unshift(`--force-device-scale-factor=${scaleFactor}`);
  }
  if (config.chrome.ozonePlatform) {
    args.unshift(`--ozone-platform=${config.chrome.ozonePlatform}`);
  }
  return args;
}
```

### Environment variables at launch

- The application does **not** override the environment for Chrome; the Chrome process inherits the current process environment. There are no explicit env vars set for Chrome in code.

**Example: Chrome spawn (no custom env)**

```ts
chromeProcess = spawn(chromePath, args, { stdio: 'ignore', shell: false });
```

### Requirements for Chrome to be controllable

- The **CDP (remote debugging) port** must match `DEVTOOLS_PORT` (default 9222); the application connects to Chrome on this port.
- Briefly: control and "idle" transitions depend on `initialUrl` and the idle server; if you change the initial URL when launching externally, ensure the same port/server is used for idle behavior.

---

## Summary: environment variables affecting launch

### OBS

| Variable         | Description / effect |
|------------------|----------------------|
| `OBS_PATH`       | Path to OBS executable. |
| `OBS_PROFILE_PATH` | Optional; adds `--profile=<path>`. |
| `OBS_CONFIG_DIR` | Passed as `XDG_CONFIG_HOME` for OBS config directory. |
| `OBS_HOST`       | WebSocket host (must match OBS WebSocket settings for control). |
| `OBS_PORT`       | WebSocket port (must match OBS WebSocket settings). |
| `OBS_PASSWORD`   | WebSocket password (must match OBS WebSocket settings). |

### Chrome

| Variable                   | Description / effect |
|----------------------------|-----------------------|
| `CHROME_PATH`              | Path to Chrome/Chromium executable. |
| `DEVTOOLS_PORT`            | CDP port (default 9222); must match Chrome's `--remote-debugging-port`. |
| `CHROME_USER_DATA_DIR`     | Optional; passed as `--user-data-dir`. |
| `CHROME_WINDOW_MODE`       | `kiosk` \| `app` \| `fullscreen` \| `default`. |
| `CHROME_KIOSK`             | If `true`, enables kiosk mode (overrides window mode if needed). |
| `CHROME_WINDOW_WIDTH`      | Window width (with `CHROME_WINDOW_HEIGHT` → `--window-size`). |
| `CHROME_WINDOW_HEIGHT`     | Window height. |
| `CHROME_WINDOW_POSITION_X` | Window X position (with `CHROME_WINDOW_POSITION_Y` → `--window-position`). |
| `CHROME_WINDOW_POSITION_Y` | Window Y position. |
| `CHROME_DEVICE_SCALE_FACTOR` | Optional; `--force-device-scale-factor`. |
| `CHROME_OZONE_PLATFORM`    | Optional; `--ozone-platform` (e.g. for headless/Wayland). |
| `IDLE_PORT`                | Used to build initialUrl: `http://localhost:<IDLE_PORT>/`. |

---

## See also

- OBS control logic (scenes, projector, WebSocket).
- Chrome control logic (CDP, navigation, viewport, scripts).
