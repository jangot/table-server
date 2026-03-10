# Security checklist: command injection prevention

This document summarizes how the table-server avoids command injection and what to preserve when changing code.

## Process launch (Chrome and OBS)

- Chrome and OBS are started via `spawn(path, args, { shell: false })`. The `path` and `args` are taken **only from configuration** (environment variables). No user-provided input is substituted into them.
- User-provided URLs are **never** passed as process arguments. They are used only in CDP (`page.goto`) and when writing the last URL to a file.

## Telegram bot input

- The `/restart` command accepts only a substring from the set `chrome` / `obs` / `all`. Only config and logger are passed to `restartChrome` / `restartObs`; no raw user text is passed to process launch.
- When adding URL validation in the future: validate schemes (http/https), optionally use a domain whitelist, and **always log rejected requests**.

## Future changes

- Do **not** use `shell: true` or `exec` / `execSync` with user input substituted into the command string.
- When introducing URL validation, log rejected requests for observability.

## Future URL validation (out of MVP)

When URL validation is added:

- Validate schemes (http/https); optionally restrict to a domain whitelist.
- Log all rejected requests.

No URL validation is implemented in the current MVP.

## See also

- [docs/plan-execution.md](plan-execution.md) — section 1.4 (security), stage 9 (security and polish).
- [docs/requirements/init.md](requirements/init.md) — section 12 (DoD).
