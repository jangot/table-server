# Environment variables

Configuration is built **only from environment variables** (no config files). Invalid or missing required variables cause a clear error and exit.

## Required

| Variable | Description | Example |
|----------|-------------|---------|
| `CHROME_PATH` | Path to Chrome/Chromium executable | `/usr/bin/google-chrome` |
| `OBS_PATH` | Path to OBS executable | `/usr/bin/obs` |
| `IDLE_PORT` | Port for idle HTTP server (1–65535) | `3000` |
| `IDLE_VIEWS_PATH` | Path to EJS views directory | `./views` |
| `LOG_LEVEL` | Log level: `info`, `warn`, `error`, `debug` | `info` |

## Optional

| Variable | Description | Example |
|----------|-------------|---------|
| `DEVTOOLS_PORT` | Chrome DevTools remote debugging port | `9222` |
| `CHROME_READY_TIMEOUT` | Timeout (ms) waiting for Chrome to be ready | `30000` |
| `OBS_READY_TIMEOUT` | Timeout (ms) waiting for OBS to be ready | `10000` |

## Development example

```bash
export CHROME_PATH=/usr/bin/google-chrome
export OBS_PATH=/usr/bin/obs
export IDLE_PORT=3000
export IDLE_VIEWS_PATH=./views
export LOG_LEVEL=debug
```

Do not put secrets in env files committed to the repo. Use `.env` locally (and add it to `.gitignore`) or set variables in the process manager (e.g. PM2 ecosystem file).
