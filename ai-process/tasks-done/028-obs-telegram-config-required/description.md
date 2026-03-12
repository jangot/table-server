# Задача: Сделать параметры OBS WebSocket и Telegram обязательными в конфиге

## Суть задачи
Параметры OBS WebSocket (`OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD`) и Telegram (`TELEGRAM_BOT_TOKEN`, `ALLOWED_TELEGRAM_USERS`) сейчас опциональны. Из-за этого при отсутствии переменных в `.env` приложение стартует без ошибок, но функциональность молча не работает. Нужно сделать их обязательными с явной валидацией при старте.

## Детали и требования

- `OBS_HOST` — сделать обязательным (`@IsString()`, `@IsNotEmpty()`) в `ObsConfig`
- `OBS_PORT` — сделать обязательным (`@IsNumber()`) в `ObsConfig`
- `OBS_PASSWORD` — сделать обязательным (`@IsString()`, допускать пустую строку) в `ObsConfig`
- `TELEGRAM_BOT_TOKEN` — сделать обязательным (`@IsString()`, `@IsNotEmpty()`) в `TelegramConfig`
- `ALLOWED_TELEGRAM_USERS` — сделать обязательным (`@IsArray()`) в `TelegramConfig`
- При старте без этих переменных приложение должно падать с понятным сообщением об ошибке (валидация уже есть через `validateSync` в `validate.ts`)

## Контекст
- Конфиг находится в `src/modules/config/types.ts`, валидация в `src/modules/config/validate.ts`
- Используется `class-validator` + `class-transformer`
- Причина задачи: задача 024 — из-за отсутствия `OBS_HOST`/`OBS_PORT`/`OBS_PASSWORD` сцены не работали без каких-либо ошибок при старте
- Не забыть обновить `.env.example` — перенести эти переменные из опциональных в обязательные
