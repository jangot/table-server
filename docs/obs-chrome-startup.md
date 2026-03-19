# OBS and Chrome startup parameters

This document describes the **launch parameters** (executable path, CLI arguments, environment variables) and **state requirements** for OBS and Chrome so that they can be controlled by the application. Use it when starting OBS or Chrome manually or from an external launcher: set the same parameters as the application would use for compatibility with the control logic.

**In scope:** paths, CLI args, env vars passed at launch, and what state OBS/Chrome must be in for control (WebSocket, CDP).

**Out of scope:** Control logic (scene switching, CDP navigation, etc.) — see task 037 (OBS control logic) and task 038 (Chrome control logic).

---

## OBS

### Path to executable

- **Source:** Config field `obs.path` → environment variable `OBS_PATH` (see `config/validate.ts`). When the application launches OBS, it uses this value as the executable path.

### Command-line arguments

- **Source:** `src/modules/obs/args.ts`. If `config.obs.profilePath` is set, one argument is added: `--profile=<profilePath>`. The profile path comes from `OBS_PROFILE_PATH` (optional).

Example full command:

```bash
# Example (without env)
/path/to/obs --profile=/path/to/profile
```

### Environment variables at launch

- **Source:** `obs/launch.ts` and `obs/index.ts`. When the application starts OBS, it passes `env = { ...process.env, XDG_CONFIG_HOME: config.obs.configDir }`. So `OBS_CONFIG_DIR` sets the OBS configuration directory via `XDG_CONFIG_HOME`.

| Environment variable | Effect on launch |
|----------------------|------------------|
| `OBS_CONFIG_DIR`     | Set as `XDG_CONFIG_HOME` for the OBS process; OBS uses this as its config directory. |

### Requirements for OBS to be controllable

- From `obs-scenes/client.ts`: to control the scene and projector, OBS must have the **WebSocket server enabled**. The connection uses host, port, and password; these must match the application settings.
- **Variables:** `OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD` must match the WebSocket server settings in OBS (Tools → WebSocket Server Settings, or equivalent).

---

## Chrome

### Path to executable

- **Source:** Config field `chrome.path` → environment variable `CHROME_PATH`.

### Command-line arguments (flags)

- **Source:** `src/modules/chrome/args.ts`. Full set:

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

**initialUrl when started by the application:** `http://localhost:<IDLE_PORT>/` (from `idle.port` → `IDLE_PORT`). For external launch: either run the idle server on the same port, or use another URL and be aware that CDP control and transitions to the “idle” page depend on that URL/port.

### Environment variables at launch

- **Source:** `chrome/launch.ts`. The application does **not** override the environment for Chrome; the Chrome process inherits the current process environment. There are no explicit env vars set for Chrome in code.

### Requirements for Chrome to be controllable

- The **CDP (remote debugging) port** must match `DEVTOOLS_PORT` (default 9222); the application connects to Chrome on this port.
- Briefly: control and “idle” transitions depend on `initialUrl` and the idle server; if you change the initial URL when launching externally, ensure the same port/server is used for idle behavior.

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
| `DEVTOOLS_PORT`            | CDP port (default 9222); must match Chrome’s `--remote-debugging-port`. |
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

- [Environment variables](env.md) — general env reference.
- Task 037 — OBS control logic (scenes, projector).
- Task 038 — Chrome control logic (CDP, navigation).
