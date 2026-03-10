# План реализации: Безопасность и полировка (009)

Проверить защиту от command injection при запуске Chrome/OBS и обработке ввода, зафиксировать в коде и/или документации гарантии безопасности; оставить требование к будущей валидации URL (вне MVP) с логированием отклонённых запросов. Сверить логи с критериями готовности (DoD) из раздела 12 требований и при необходимости дополнить сообщения.

---

## 1. Комментарии по безопасности в модуле Chrome (launch + args)

**Файл (изменить):** `src/modules/chrome/launch.ts`

В начале файла (после импортов) добавить короткий комментарий: `chromePath` и `args` передаются в `spawn` с `shell: false` и должны содержать только значения из конфигурации (env), без подстановки пользовательского ввода — защита от command injection.

**Файл (изменить):** `src/modules/chrome/args.ts`

Убедиться, что JSDoc функции `buildChromeArgs` явно указывает: аргументы используются для `spawn`; пользовательский URL в аргументы процесса не передаётся (он передаётся только через CDP в `navigateToUrl`). При необходимости усилить существующий комментарий одной фразой.

```typescript
/**
 * Build Chrome CLI args for remote debugging and single-window mode.
 * Only config and local idle URL are used; user-provided URLs are never
 * passed here (they go via CDP in navigateToUrl). Safe to pass to spawn(argv).
 */
```

---

## 2. Комментарии по безопасности в модуле OBS (launch + args)

**Файл (изменить):** `src/modules/obs/launch.ts`

В начале файла добавить комментарий: `obsPath` и `args` передаются в `spawn` с `shell: false` и должны содержать только значения из конфигурации (env), без пользовательского ввода.

**Файл (изменить):** `src/modules/obs/args.ts`

Оставить или слегка усилить JSDoc: аргументы только из config, без подстановки пользовательского ввода; безопасны для передачи в `spawn`.

---

## 3. Комментарий в Telegram-обработчике (пользовательский ввод)

**Файл (изменить):** `src/modules/telegram-bot/handlers.ts`

В начале файла или перед `handleText`/`handleRestart` добавить короткий блок-комментарий (на английском): пользовательский ввод (URL из сообщения, аргумент `/restart`) не передаётся в shell или в аргументы `spawn`; URL используется только в `navigateToUrl` (CDP + запись в файл), аргумент `/restart` сводится к одному из фиксированных значений `chrome`/`obs`/`all`. При добавлении валидации URL — логировать отклонённые запросы.

```typescript
/**
 * Security: user input (URL from message, /restart arg) is never passed to
 * shell or spawn. URL is only used in navigateToUrl (CDP + file). /restart
 * is restricted to chrome|obs|all. When adding URL validation, log rejected requests.
 */
```

---

## 4. Чек-лист безопасности в документации

**Файл (создать):** `docs/security.md`

Создать короткий документ на английском с чек-листом для проверки защиты от command injection:

- Chrome и OBS запускаются через `spawn(path, args, { shell: false })`; `path` и `args` берутся только из конфигурации (env).
- Пользовательский URL передаётся только в CDP (`page.goto`) и в файл последнего URL; не подставляется в аргументы процесса.
- Команда `/restart` принимает только подстроку из множества `chrome`/`obs`/`all`; в `restartChrome`/`restartObs` передаётся только config и logger.
- При любых будущих изменениях: не использовать `shell: true`, `exec`/`execSync` с подстановкой пользовательского ввода; при валидации URL — логировать отклонённые запросы.

Ссылку на этот документ при необходимости добавить в `docs/plan-execution.md` (раздел 1.4 или этап 9).

---

## 5. Требование к будущей валидации URL (вне MVP)

**Файл (изменить):** `docs/plan-execution.md`

В разделе 1.4 (или рядом с этапом 9) добавить одну-две строки: при появлении валидации URL — проверка схем (http/https), при необходимости whitelist доменов; обязательно логирование отклонённых запросов. В коде валидацию не реализовывать.

Либо оформить подраздел в `docs/security.md`: «Future URL validation: schemes, optional whitelist, log rejected requests.»

---

## 6. Сверка логов с DoD (раздел 12 требований)

**Файлы (просмотреть/изменить):** `src/index.ts`, `src/modules/orchestrator/index.ts`, `src/modules/watchdog/index.ts`, `src/modules/telegram-bot/handlers.ts`, `src/modules/chrome/launch.ts`, `src/modules/obs/launch.ts`, при необходимости `src/modules/chrome/cdp.ts`.

Провести сверку по пунктам DoD 1–10:

| DoD | Критерий | Текущее покрытие логами | Действие |
|-----|----------|-------------------------|----------|
| 1 | Автоподъём после перезагрузки | `Table server starting` | Ок |
| 2 | Chrome запускается автоматически | `Starting Chrome` → `Chrome DevTools ready` | Ок |
| 3 | OBS после Chrome | `Starting OBS` → `OBS ready` | Ок |
| 4 | Приём удалённой команды со ссылкой | `Telegram bot: navigated to URL` / unauthorized / system not ready | Ок |
| 5 | Ссылка в том же окне | `Navigated to URL`, `Telegram bot: navigated to URL` | Ок |
| 6 | OBS транслирует | Нет отдельного лога; косвенно «OBS ready» | При необходимости — без изменений или уточнить в DoD |
| 7 | Восстановление Chrome | Watchdog: `degraded`, рестарт, `Chrome DevTools ready` | Ок |
| 8 | Восстановление OBS | Аналогично | Ок |
| 9 | Рестарт Node | PM2/вне приложения | Без изменений |
| 10 | Ключевые события в логах | Проверить полноту | При необходимости добавить один общий лог |

При необходимости добавить в `handlers.ts` единый лог успешной обработки команды с типом (`open` / `idle` / `restart` / `status`), например: `logger.info('Telegram bot: remote command processed', { type: 'open', userId })` после успешной навигации, и аналогично для idle/restart/status — чтобы в логах однозначно было видно «приём команды обработан».

---

## 7. Дополнение логов (если по результатам шага 6 нужно)

**Файл (изменить):** `src/modules/telegram-bot/handlers.ts`

Если решено добавить единый лог «remote command processed»:

- После успешного ответа в `handleText` (навигация по URL): `logger.info('Telegram bot: remote command processed', { type: 'open', url, userId })` (или без дублирования, если уже есть «navigated to URL» — тогда только добавить поле `type: 'open'` в существующий лог).
- В `handleIdle` после успешного переключения: `logger.info('Telegram bot: remote command processed', { type: 'idle', userId })`.
- В `handleRestart` после успешного рестарта: `logger.info('Telegram bot: remote command processed', { type: 'restart', target: arg, userId })`.
- В `handleStatus` после ответа: `logger.info('Telegram bot: remote command processed', { type: 'status', userId })`.

Либо ограничиться уточнением существующих сообщений (например, добавить `type` в уже имеющиеся логи), чтобы не дублировать объём.

---

## 8. Тесты

**Файл (создать или изменить):** тесты для проверки, что в spawn не передаётся пользовательский ввод — по возможности модульные.

Сценарии:

- **Chrome args:** вызов `buildChromeArgs(config, port, initialUrl)` с разными `initialUrl` (в т.ч. строка с кавычками/пробелами) — в возвращённом массиве `initialUrl` присутствует только как последний элемент (или в `--app=...`), и нигде не появляется произвольная строка из «пользовательского» URL с символами, опасными для shell. Либо тест-констатация: `buildChromeArgs` не принимает пользовательский URL из бота — вызывается с idle URL из config (проверка в интеграции/моке).
- **OBS args:** `buildObsArgs(config)` возвращает массив, зависящий только от config (например, `--profile=...`); нет параметров из пользовательского ввода.
- **Handlers (опционально):** юнит-тест с моком `navigateToUrl`: при вызове обработчика текста с URL в теле сообщения вызывается `navigateToUrl` с этим URL, а не с произвольной строкой в аргументах процесса (проверка через то, что в deps не передаётся spawn).

Если в проекте уже есть тесты для chrome/args или obs/args — добавить туда сценарии «только config, нет user input». Иначе — создать минимальный тест в `src/modules/chrome/args.test.ts` и `src/modules/obs/args.test.ts` (или в общем test-файле модуля).

---

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/chrome/launch.ts` |
| Изменить | `src/modules/chrome/args.ts` |
| Изменить | `src/modules/obs/launch.ts` |
| Изменить | `src/modules/obs/args.ts` |
| Изменить | `src/modules/telegram-bot/handlers.ts` |
| Создать  | `docs/security.md` |
| Изменить | `docs/plan-execution.md` |
| Создать/изменить | тесты: `src/modules/chrome/args.test.ts` и/или `src/modules/obs/args.test.ts` (или существующие test-файлы модулей) |

При необходимости по результатам шага 6: только изменения в `handlers.ts` и, возможно, мелкие правки в других модулях для уточнения формулировок логов.

---

## Ссылки

- [analyze.md](./analyze.md) текущей задачи
- [docs/requirements/init.md](../../docs/requirements/init.md) — раздел 12 (DoD)
- [docs/plan-execution.md](../../docs/plan-execution.md) — раздел 1.4, этап 9
