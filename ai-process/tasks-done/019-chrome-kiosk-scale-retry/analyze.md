# Анализ: Повторно исправить запуск Chrome — kiosk и масштаб контента

## Общее описание функциональности

Задача 018 добавила в `buildChromeArgs` флаги `--kiosk`, `--noerrdialogs`, `--disable-infobars` и `--force-device-scale-factor`. Несмотря на это, kiosk-режим и/или масштаб контента не работают в реальной среде. Необходимо провести глубокое исследование: выяснить, где именно обрывается цепочка от конфига до реального флага Chrome, и определить корневую причину.

---

## Связанные модули и сущности

| Модуль / файл | Назначение | Что затрагивает задача |
|---|---|---|
| `src/modules/chrome/args.ts` | Построение массива CLI-аргументов для Chrome | Флаги kiosk, scale factor, window mode |
| `src/modules/config/validate.ts` | Чтение env-переменных и сборка `AppConfig` | Маппинг `CHROME_WINDOW_MODE`, `CHROME_DEVICE_SCALE_FACTOR` |
| `src/modules/config/types.ts` | Типы конфига (`ChromeConfig`, `AppConfig`) | Поля `windowMode`, `kiosk`, `deviceScaleFactor` |
| `src/modules/chrome/launch.ts` | Запуск Chrome через `spawn` | Получает итоговый массив args |
| `src/modules/chrome/index.ts` | Оркестрация модуля Chrome | Вызывает `buildChromeArgs` и `launchChrome` |
| `.env.example` | Шаблон переменных окружения | Определяет, какие переменные задокументированы как доступные |
| `test/chrome.test.ts` | Тесты для `buildChromeArgs` | Покрывают kiosk, scale factor, window mode |

---

## Текущие интерфейсы и API

### `buildChromeArgs` (`src/modules/chrome/args.ts`)
```
buildChromeArgs(config: AppConfig, devToolsPort: number, initialUrl: string): string[]
```
- Kiosk активируется при `config.chrome.kiosk === true` **или** `config.chrome.windowMode === 'kiosk'`
- `--force-device-scale-factor` добавляется только при `config.chrome.deviceScaleFactor !== undefined`

### `ChromeConfig` (`src/modules/config/types.ts`)
Поля, относящиеся к задаче:
- `windowMode?: ChromeWindowMode` — `'kiosk' | 'app' | 'fullscreen' | 'default'`
- `kiosk?: boolean` — отдельный булев флаг для kiosk
- `deviceScaleFactor?: number` — масштаб `0.1..10`
- `userDataDir?: string` — путь к профилю Chrome

### `validateEnv` (`src/modules/config/validate.ts`)
Маппинг env → конфиг:
- `CHROME_WINDOW_MODE` → `windowMode` (default: `'default'` если не задана)
- `CHROME_DEVICE_SCALE_FACTOR` (float) → `deviceScaleFactor`
- Поле `kiosk?: boolean` в `ChromeConfig` — **нигде не читается из env-переменной** (нет `CHROME_KIOSK`)

---

## Файлы и места в коде

| Файл | Что содержит | Что нужно изменить / создать |
|---|---|---|
| `src/modules/config/validate.ts` | Маппинг env → конфиг | Ключевая точка: `kiosk` не маппится из env (нет `CHROME_KIOSK`); `windowMode` по умолчанию `'default'` |
| `src/modules/chrome/args.ts` | Сборка аргументов | Код выглядит корректно; проверить логику при `kiosk === true` vs `windowMode === 'kiosk'` |
| `.env.example` | Шаблон переменных | `CHROME_DEVICE_SCALE_FACTOR` закомментирован; `CHROME_WINDOW_MODE` закомментирован |
| `test/chrome.test.ts` | Тесты args | Тесты покрывают `windowMode: 'kiosk'`, но не `kiosk: true`; нет теста для `kiosk: true` через env |

---

## Зависимости и ограничения

### Установленные факты (по коду)

1. **Поле `kiosk: boolean` в `ChromeConfig` — мёртвое поле с точки зрения env**
   - В `validate.ts` нет маппинга `CHROME_KIOSK` → `kiosk`. Поле `kiosk?: boolean` определено в типах и используется в `args.ts`, но никогда не заполняется из переменных окружения.
   - Единственный рабочий способ включить kiosk через env: `CHROME_WINDOW_MODE=kiosk`.

2. **`CHROME_DEVICE_SCALE_FACTOR` не задан по умолчанию**
   - В `.env.example` закомментирован. Если пользователь не добавил его в реальный `.env`, `deviceScaleFactor` будет `undefined` и флаг `--force-device-scale-factor` не добавится.

3. **Дефолт `windowMode = 'default'`**
   - `validate.ts:63`: `|| 'default'` — если `CHROME_WINDOW_MODE` не задан, kiosk не включится.

4. **Профиль пользователя Chrome (`userDataDir`)**
   - Директория `CHROME_USER_DATA_DIR` была очищена — проблема сохранилась. Причина не в кэшированном профиле.

5. **Wayland vs X11**
   - Флаг `--kiosk` работает на X11. На Wayland (особенно без `--ozone-platform=wayland`) Chrome может игнорировать `--kiosk` или работать некорректно.
   - `--force-device-scale-factor` может не работать на Wayland (Chrome берёт DPI из Wayland compositor).

6. **`launchChrome` принимает args как массив — никакой дополнительной обработки нет**
   - Проблема не в вызове: `spawn(chromePath, args, { shell: false })` передаёт аргументы напрямую.

### Потенциальные риски
- Если задача 019 введёт новую env-переменную `CHROME_KIOSK`, нужно синхронизировать с `.env.example` и документацией
- Изменение дефолта `windowMode` с `'default'` на что-то другое может сломать существующие деплои
- Добавление флагов для Wayland (ozone) не нужно при X11 — нужно условное включение
- Причина в кэше профиля Chrome исключена (директория очищена, проблема воспроизводится)
