# Environment variables

Configuration is built **only from environment variables** (no config files). Invalid or missing required variables cause a clear error and exit.

On startup, the application loads variables from a `.env` file in the current working directory (if present). Copy `.env.example` to `.env` and set your values. Variables already set in the process environment take precedence over `.env`.

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
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token; if set, the bot starts and accepts commands | `123:ABC...` |
| `ALLOWED_TELEGRAM_USERS` | Comma-separated list of Telegram user ids or usernames (without @) allowed to send commands | `123456789,johndoe` |
| `DEVTOOLS_PORT` | Chrome DevTools remote debugging port | `9222` |
| `CHROME_READY_TIMEOUT` | Timeout (ms) waiting for Chrome to be ready | `30000` |
| `OBS_READY_TIMEOUT` | Timeout (ms) waiting for OBS to be ready | `10000` |
| `OBS_PROFILE_PATH` | Path to OBS profile/config directory (optional) | `/home/user/.config/obs-studio` |
| `CHROME_USER_DATA_DIR` | Chrome user data directory path (passed as `--user-data-dir`) | `/tmp/chrome-profile` |
| `WATCHDOG_CHECK_INTERVAL_MS` | Interval (ms) for watchdog status checks of Chrome and OBS; if not set, watchdog is disabled | `15000` |
| `WATCHDOG_RESTART_MIN_INTERVAL_MS` | Min interval (ms) between watchdog-triggered restarts (default 10000) | `10000` |

If `TELEGRAM_BOT_TOKEN` is not set, the Telegram bot is not started. If `ALLOWED_TELEGRAM_USERS` is empty or not set, no user can send commands to the bot.

## Development example

You can use a `.env` file (copy from `.env.example`) or set variables manually:

```bash
export CHROME_PATH=/usr/bin/google-chrome
export OBS_PATH=/usr/bin/obs
export IDLE_PORT=3000
export IDLE_VIEWS_PATH=./views
export LOG_LEVEL=debug
```

Do not put secrets in env files committed to the repo. Use `.env` locally (and add it to `.gitignore`) or set variables in the process manager (e.g. PM2 ecosystem file).
