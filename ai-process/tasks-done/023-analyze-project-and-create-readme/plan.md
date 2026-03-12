# План реализации: Проанализировать проект и сделать README.md

Создать в корне репозитория README.md на английском языке: описание сервиса table-server, назначение (управление OBS и Chrome для трансляции, Telegram-бот, idle HTTP API, watchdog), требования к окружению, установка, конфигурация через env/.env, команды запуска и сборки. Опционально заполнить поле `description` в package.json. Исходный код и тесты не менять.

## 1. Создать README.md в корне репозитория

**Файл (создать):** `README.md`

Содержание (на английском):

- **Заголовок и краткое описание** — что такое table-server: сервис для управления OBS Studio и Chrome в контексте трансляции на проектор; приём команд через Telegram-бота и HTTP (idle-сервер), автозапуск и восстановление (watchdog). Одна-две строки, согласованные с будущим `package.json` description.
- **Features / What it does** — пункты: запуск Chrome и OBS, ожидание готовности, переключение URL в Chrome через CDP; команды через Telegram (/status, /idle, /restart, /scenes, /scene и др., открытие URL по тексту); HTTP API (health, переключение сцен OBS); watchdog для перезапуска Chrome/OBS при падении; развёртывание под PM2 с автозапуском (ссылка на docs).
- **Requirements** — Node.js (LTS рекомендуется), Chrome/Chromium, OBS Studio; графическая сессия (Chrome и OBS — GUI). Упомянуть, что исполняемые файлы проверяются при старте (startup-checks).
- **Installation** — клонирование репозитория, `npm install`, копирование `.env.example` в `.env` и заполнение переменных. Ссылка на полный список переменных: [Environment variables](docs/env.md).
- **Configuration** — конфигурация только через переменные окружения (и опционально `.env`). В README перечислить минимальный набор: обязательные (например TELEGRAM_BOT_TOKEN, ALLOWED_TELEGRAM_USERS, порты/хосты для Chrome, OBS, idle-сервера) и 1–2 опциональных (например watchdog, OBS scenes). Для полной таблицы — ссылка на `docs/env.md`. При ошибке валидации при старте — выход с кодом 1 и списком нарушений.
- **Scripts** — команды из package.json:
  - `npm run build` — сборка (tsc)
  - `npm start` — сборка и запуск (node dist/index.js)
  - `npm run dev` — запуск в режиме разработки (ts-node src/index.ts)
  - `npm test` — запуск тестов
  - `npm run lint` — eslint
- **Telegram bot** — кратко: команды /status, /idle, /restart, /scenes, /scene, /current, /backup, /default, /help; открытие URL по тексту сообщения; доступ только для пользователей из ALLOWED_TELEGRAM_USERS. Детали при необходимости в коде (handlers.ts).
- **HTTP API (idle server)** — GET /, GET /health (JSON ready, chrome, obs), GET /obs/scenes, POST /obs/scene (body: { scene }), POST /obs/scene/backup, POST /obs/scene/default. Порт и путь к views — из конфига (IDLE_VIEWS_PATH и т.д., см. docs/env.md).
- **Deployment** — ссылка на [Deployment with PM2](docs/deployment-pm2.md) для автозапуска после входа в графическую сессию.
- При желании — короткая секция **Project structure** (коротко: точка входа `src/index.ts`, модули в `src/modules/`: config, chrome, obs, obs-scenes, telegram-bot, idle-server, watchdog, startup-checks) без замены детальной документации в docs.

Не включать в README секреты и реальные значения из .env. Не дублировать полную таблицу переменных — только минимум и ссылка на docs/env.md.

```markdown
# table-server

Short one-line description (e.g. "Service for controlling OBS Studio and Chrome for projector streaming, with Telegram bot and HTTP API.")

## Features
- ...
## Requirements
- Node.js (LTS recommended), Chrome/Chromium, OBS Studio, graphical session
## Installation
...
## Configuration
See [Environment variables](docs/env.md) for the full list. Minimum set: ...
## Scripts
- `npm run build` / `npm start` / `npm run dev` / `npm test` / `npm run lint`
...
## Deployment
See [Deployment with PM2](docs/deployment-pm2.md).
```

## 2. Заполнить поле description в package.json

**Файл (изменить):** `package.json`

В поле `"description": ""` подставить одну короткую фразу на английском, согласованную с первой строкой README (назначение сервиса). Примеры: "Service for controlling OBS and Chrome for projector streaming, with Telegram bot and HTTP API" или "OBS and Chrome controller for projector streaming; Telegram bot and idle HTTP server."

```json
"description": "Service for controlling OBS and Chrome for projector streaming, with Telegram bot and HTTP API.",
```

## 3. Проверка (чеклист)

Тесты в виде нового test-файла не требуются — задача только по документации. Проверка после выполнения:

- README.md на английском, без секретов и реальных значений.
- Все ссылки ведут на существующие файлы: `docs/env.md`, `docs/deployment-pm2.md`.
- Указанные команды (`npm run build`, `npm start`, `npm run dev`, `npm test`, `npm run lint`) соответствуют `package.json`.
- Разделы: описание, требования, установка, конфигурация (минимум + ссылка на docs/env.md), скрипты, Telegram, HTTP API, развёртывание (ссылка на docs/deployment-pm2.md).
- Поле `description` в package.json заполнено и согласовано с README.

## Сводка файлов

| Действие | Файл |
|----------|------|
| Создать  | `README.md` |
| Изменить | `package.json` |

## Ссылки

- [analyze.md](analyze.md) текущей задачи
