# Задача: OBS config-dir через XDG_CONFIG_HOME

## Суть задачи
Задача 032 добавила переменную `OBS_CONFIG_DIR` и передаёт её как `--config-dir` в аргументах CLI при запуске OBS. Однако выяснилось, что эта версия OBS не поддерживает флаг `--config-dir` — он тихо игнорируется, OBS продолжает грузить конфиг из `~/.config/obs-studio/`. Нужно переделать: сохранить переменную `OBS_CONFIG_DIR` как есть, но вместо CLI-аргумента передавать её значение как `XDG_CONFIG_HOME` в переменных окружения при `spawn` OBS.

## Детали и требования
- Переменная окружения `OBS_CONFIG_DIR` остаётся без изменений (название, обязательность, валидация)
- Убрать `--config-dir` из аргументов CLI в `obs/args.ts`
- При запуске OBS через `spawn` передавать `env: { ...process.env, XDG_CONFIG_HOME: config.obs.configDir }` в опциях
- OBS на Linux следует XDG-спецификации и будет читать конфиг из `$XDG_CONFIG_HOME/obs-studio/`
- `.env.example` и документация в `types.ts`/`validate.ts` не требуют изменений

## Контекст
- Файлы изменений: `src/modules/obs/args.ts`, `src/modules/obs/launch.ts`, `src/modules/obs/index.ts`
- `launchObs` в `launch.ts` сейчас вызывает `spawn(obsPath, args, { stdio: ..., shell: false })` — нужно добавить `env`
- `config.obs.configDir` уже доступен в `createObsModule` через `config`
- Проверено: `obs --help` не содержит флага `--config-dir`; директория `$OBS_CONFIG_DIR` после запуска с флагом оставалась пустой

## Открытые вопросы
- Нет
