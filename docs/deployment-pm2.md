# Deployment with PM2 and autostart (Linux)

This document describes how to run the table-server under PM2 on Linux: process management, restart on failure, log capture, and autostart when the user logs into a graphical session.

## Prerequisites

- **Node.js** — installed (LTS recommended).
- **Chrome/Chromium** and **OBS** — installed and working; the app checks for their executables at startup.
- **Application built** — run `npm run build` so that `dist/index.js` exists.
- **Environment variables** — see [Environment variables](env.md) for required and optional variables (`CHROME_PATH`, `OBS_PATH`, `IDLE_PORT`, etc.). Use a `.env` file in the project root (copy from `.env.example`) or set variables in the PM2 ecosystem config or shell before starting PM2.

## Installing PM2

Install PM2 globally:

```bash
npm install -g pm2
```

A recent PM2 version (e.g. 5.x or later) is recommended. Check with `pm2 --version`.

Alternatively, you can run PM2 via `npx` from the project directory:

```bash
npx pm2 start ecosystem.config.cjs
```

Ensure the working directory is the project root when using `npx pm2` so that paths and `.env` resolve correctly.

## Running the application with PM2

1. Copy the example config from the repo root to your deployment machine (or use it in place):

   ```bash
   cp ecosystem.config.cjs /path/to/table-server/
   ```

2. Edit `ecosystem.config.cjs`:
   - Set `cwd` to the absolute path of your table-server project (e.g. `/home/user/table-server`).
   - Adjust `out_file` and `error_file` if you want logs in a specific directory (e.g. `logs/out.log`, `logs/error.log`); create the `logs` directory if needed.
   - Configure environment variables in the `env` block or rely on a `.env` file in `cwd` (the app loads `.env` from the current working directory at startup). Do not commit secrets; keep `.env` in `.gitignore`.

3. From the project directory (or with `cwd` set correctly), start the app:

   ```bash
   pm2 start ecosystem.config.cjs
   ```

   The entry point is the compiled script `dist/index.js`, which corresponds to running `npm run start` after a build (i.e. `node dist/index.js`).

4. Useful commands:
   - `pm2 status` — list processes and status.
   - `pm2 logs table-server` — stream logs.
   - `pm2 restart table-server` — restart the app.
   - `pm2 stop table-server` — stop the app.

## Autostart on user login (Linux)

The goal is to start PM2 (and thus table-server) **after the user logs into a graphical session**, not in a headless context. Chrome and OBS depend on a display/session.

**Recommended approach: PM2 startup script (user mode)**

1. Start your app with PM2 and confirm it runs: `pm2 start ecosystem.config.cjs`, `pm2 status`.
2. Generate a startup script so PM2 is started on user login:
   ```bash
   pm2 startup
   ```
   PM2 will print a command (e.g. a `systemctl` or similar line). **Run that command** as instructed (often with `sudo`).
3. Save the current process list so PM2 restores it after reboot:
   ```bash
   pm2 save
   ```
4. After reboot, log into your graphical session; PM2 should start and restore `table-server`. Verify with `pm2 status` and `pm2 logs table-server`.

**Alternatives:** You can also use a systemd user unit or an XDG autostart entry to run `pm2 resurrect` or `pm2 start ecosystem.config.cjs` after login. Configuration depends on your distribution and display manager; the PM2-generated startup is usually the simplest.

## Logs

- **Default:** PM2 writes stdout and stderr to its own data directory (see `pm2 show table-server` for paths).
- **Custom paths:** In `ecosystem.config.cjs`, set `out_file` and `error_file` (e.g. `logs/out.log`, `logs/error.log`). Create the directory (e.g. `logs/`) before first start.
- **Rotation:** Use PM2’s built-in log rotation (`pm2 install pm2-logrotate`) or external tools (logrotate, etc.). See [PM2 log management](https://pm2.keymetrics.io/docs/usage/log-management/) for details.

## Secrets

Do not put tokens or passwords in the ecosystem file or in any file committed to the repo. Options:

- **`.env` in project root** — the app loads `.env` from `cwd` at startup. Add `.env` to `.gitignore` and keep it only on the deployment host.
- **Environment variables** — set them in the shell before `pm2 start`, or in the `env` block of `ecosystem.config.cjs` on the server (without committing that file if it contains secrets), or via your orchestration (systemd, etc.).

## Optional: Autologin on Linux

If you need the machine to boot into a graphical session without manual login (e.g. kiosk), enable autologin for your user. The method depends on the display manager:

- **GDM (GNOME):** edit `/etc/gdm/custom.conf` or use `gnome-control-center` user accounts.
- **LightDM:** configure in `/etc/lightdm/lightdm.conf`.
- **SDDM, others:** see your distribution’s documentation.

After the user session starts, PM2 should start via the startup script from the “Autostart on user login” section above. Autologin reduces security; use only in controlled environments.

## Verification

Manual checks after following this guide:

- **Happy path:** Install PM2, copy and adapt `ecosystem.config.cjs` (set `cwd`, ensure `dist/index.js` exists). Run `pm2 start ecosystem.config.cjs`. Confirm the app starts and entries appear in `pm2 logs`. Run `pm2 restart table-server` and confirm the app restarts. Run `pm2 startup`, execute the printed command, then `pm2 save`. Reboot, log into the graphical session, and confirm the table-server process is running without a manual start.
- **Errors:** Wrong `cwd` or missing `dist/index.js` — PM2 will log a startup error. Missing required environment variables — the app exits with a clear message (as implemented in the code).
