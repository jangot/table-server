# table-server

Service for controlling OBS Studio and Chrome for projector streaming, with Telegram bot and HTTP API.

## Features

- Starts Chrome and OBS, waits for them to be ready, and switches URL in Chrome via CDP.
- Receives commands via Telegram bot (/status, /idle, /restart, /scenes, /scene, /current, /backup, /default, /help; opening URL by message text) and via HTTP (idle server: health, OBS scene switching).
- Watchdog restarts Chrome/OBS when they crash.
- Deployment under PM2 with autostart after login to a graphical session. See [Deployment with PM2](docs/deployment-pm2.md).

## Requirements

- **Node.js** — LTS recommended.
- **Chrome or Chromium** — GUI browser; executable path is checked at startup.
- **OBS Studio** — GUI application; executable path is checked at startup.
- A **graphical session** is required (Chrome and OBS are GUI apps).

## Installation

1. Clone the repository.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set the required variables.
4. For the full list of variables, see [Environment variables](docs/env.md).

## Configuration

Configuration is **only via environment variables** (and optionally a `.env` file). On invalid or missing required variables, the app exits with code 1 and prints validation errors.

**Minimum set (required):** `CHROME_PATH`, `OBS_PATH`, `IDLE_PORT`, `IDLE_VIEWS_PATH`, `LOG_LEVEL`.

**Optional (examples):** `TELEGRAM_BOT_TOKEN`, `ALLOWED_TELEGRAM_USERS` (for the Telegram bot); `WATCHDOG_CHECK_INTERVAL_MS` (enables watchdog); `OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD` (for OBS WebSocket scene control).

For a step-by-step setup guide, see [Setup](docs/setup.md). For the full table and descriptions, see [Environment variables](docs/env.md).

## Scripts

- `npm run build` — build (TypeScript compile).
- `npm start` — build and run (`node dist/index.js`).
- `npm run dev` — run in development mode (`ts-node src/index.ts`).
- `npm test` — run tests.
- `npm run lint` — ESLint.

## Telegram bot

When `TELEGRAM_BOT_TOKEN` and `ALLOWED_TELEGRAM_USERS` are set, the bot accepts commands from allowed users only:

- `/status` — status; `/idle` — open idle page; `/restart` — restart Chrome/OBS.
- `/scenes`, `/scene`, `/current`, `/backup`, `/default` — OBS scene control (when OBS WebSocket is configured).
- `/help` — list of commands.
- Sending a message with a URL opens that URL in Chrome.

Details: see `src/modules/telegram-bot/handlers.ts`.

## HTTP API (idle server)

- `GET /` — main idle page.
- `GET /health` — JSON `{ ready, chrome, obs }`.
- `GET /obs/scenes` — page with OBS scenes (when WebSocket is configured).
- `POST /obs/scene` — body `{ "scene": "<name>" }` — switch scene.
- `POST /obs/scene/backup` — switch to backup scene.
- `POST /obs/scene/default` — switch to default scene.

Port and path to views are set via config (`IDLE_PORT`, `IDLE_VIEWS_PATH`). See [Environment variables](docs/env.md).

## Deployment

For autostart after logging into a graphical session, see [Deployment with PM2](docs/deployment-pm2.md).

## Project structure

- Entry point: `src/index.ts`.
- Modules in `src/modules/`: `config`, `chrome`, `obs`, `obs-scenes`, `telegram-bot`, `idle-server`, `watchdog`, `startup-checks`.

For detailed architecture and requirements, see `docs/requirements/`.
