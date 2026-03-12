# Настройка сервера

Пошаговое руководство по первоначальной настройке table-server.

## 1. Предварительные требования

Перед запуском убедитесь, что установлены:

- **Node.js** — LTS-версия
- **Google Chrome / Chromium** — с поддержкой GUI
- **OBS Studio** — с поддержкой GUI (требуется графическая сессия)

## 2. Установка

```bash
git clone <repo>
cd table-server
npm install
npm run build
```

## 3. Создание .env

Скопируйте пример и откройте файл для редактирования:

```bash
cp .env.example .env
```

Полный справочник всех переменных: [Environment variables](env.md).

---

## 4. Обязательные параметры

Без этих переменных приложение не запустится:

| Переменная | Описание | Пример |
|------------|----------|--------|
| `CHROME_PATH` | Путь к исполняемому файлу Chrome | `/usr/bin/google-chrome` |
| `OBS_PATH` | Путь к исполняемому файлу OBS | `/usr/bin/obs` |
| `IDLE_PORT` | Порт HTTP-сервера | `3000` |
| `IDLE_VIEWS_PATH` | Путь к директории с EJS-шаблонами | `./views` |
| `LOG_LEVEL` | Уровень логирования: `debug`, `info`, `warn`, `error` | `info` |

---

## 5. Настройка OBS WebSocket (для управления сценами)

Без этих параметров команды `/scenes`, `/scene`, `/current` в Telegram и HTTP API для сцен не работают.

### Включить WebSocket в OBS

1. Запустите OBS Studio.
2. Перейдите в `Tools → WebSocket Server Settings`.
3. Включите `Enable WebSocket server`.
4. Запомните порт (по умолчанию `4455`) и пароль.

### Добавить переменные в .env

```dotenv
OBS_HOST=localhost
OBS_PORT=4455
OBS_PASSWORD=ваш_пароль   # из OBS WebSocket Server Settings
```

Если аутентификация в OBS отключена — оставьте `OBS_PASSWORD=` пустым.

---

## 6. Настройка Telegram-бота

Без этих параметров Telegram-бот не запускается.

### Создать бота

1. Напишите [@BotFather](https://t.me/BotFather) в Telegram.
2. Отправьте `/newbot`, следуйте инструкциям.
3. Скопируйте токен (вида `123456789:ABCdef...`).

### Узнать свой Telegram username

Ваш username без `@` (например, `johndoe`). Можно посмотреть в `Settings → Username`.

### Добавить переменные в .env

```dotenv
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
ALLOWED_TELEGRAM_USERS=johndoe         # через запятую, если несколько пользователей
```

---

## 7. Дополнительные параметры

### Watchdog (автоперезапуск Chrome и OBS при падении)

```dotenv
WATCHDOG_CHECK_INTERVAL_MS=15000         # интервал проверок, мс
WATCHDOG_RESTART_MIN_INTERVAL_MS=10000   # минимальный интервал между перезапусками, мс
```

Если `WATCHDOG_CHECK_INTERVAL_MS` не задан — watchdog отключён.

### Окно Chrome

```dotenv
CHROME_WINDOW_MODE=app           # kiosk | app | fullscreen | default
CHROME_WINDOW_WIDTH=1920
CHROME_WINDOW_HEIGHT=1080
CHROME_WINDOW_POSITION_X=0
CHROME_WINDOW_POSITION_Y=0
CHROME_DEVICE_SCALE_FACTOR=1    # 2 для HiDPI
CHROME_USER_DATA_DIR=/home/user/chrome-profile
```

---

## 8. Запуск

```bash
npm start
```

Или в режиме разработки:

```bash
npm run dev
```

---

## 9. Развёртывание под PM2 (автозапуск)

Для автозапуска после входа в графическую сессию см. [Deployment with PM2](deployment-pm2.md).
