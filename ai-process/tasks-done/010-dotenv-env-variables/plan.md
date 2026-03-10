# План реализации: Использование dotenv для переменных окружения

Переход с ручного `export` на загрузку переменных из `.env` при старте приложения. Загрузка dotenv выполняется до первого обращения к конфигу; переменные, уже заданные в окружении, имеют приоритет над файлом.

## 1. Добавить зависимость dotenv

**Файл (изменить):** `package.json`

Добавить пакет `dotenv` в `dependencies` (используется в рантайме при старте приложения).

```json
"dependencies": {
  "dotenv": "^16.4.5",
  "ejs": "^3.1.10",
  "express": "^4.21.0"
}
```

После изменения выполнить `npm install`.

## 2. Загружать dotenv в точке входа до чтения конфига

**Файл (изменить):** `src/index.ts`

Подключить загрузку dotenv в самом начале файла, до вызова `getConfig()`, чтобы переменные из `.env` попали в `process.env` до чтения конфига.

Вариант через импорт (рекомендуется — выполняется до любого кода модуля):

```typescript
import 'dotenv/config';
import { getConfig } from './modules/config';
// ... остальные импорты
```

Либо явный вызов в начале `main()` (если потребуется передать путь к `.env`):

```typescript
import { config } from 'dotenv';
import { getConfig } from './modules/config';
// ...
async function main(): Promise<void> {
  config(); // загружает .env из cwd
  const config = getConfig();
  // ...
}
```

Предпочтительно использовать `import 'dotenv/config'` — достаточно одного импорта вверху файла, порядок гарантирован.

## 3. Проверить .gitignore

**Файл (проверить):** `.gitignore`

Убедиться, что в списке игнорируемых файлов есть строка `.env`. Если уже есть — ничего не менять. Если отсутствует — добавить:

```
.env
```

(По текущему состоянию репозитория `.env` уже в `.gitignore`.)

## 4. Создать .env.example

**Файл (создать):** `.env.example`

Пример перечня переменных для копирования в `.env`. Без секретов, с комментариями и примерами значений по документации.

```bash
# Required
CHROME_PATH=/usr/bin/google-chrome
OBS_PATH=/usr/bin/obs
IDLE_PORT=3000
IDLE_VIEWS_PATH=./views
LOG_LEVEL=info

# Optional
# DEVTOOLS_PORT=9222
# CHROME_READY_TIMEOUT=30000
# OBS_READY_TIMEOUT=10000
# CHROME_WINDOW_MODE=default
```

## 5. Обновить документацию по переменным окружения

**Файл (изменить):** `docs/env.md`

- В начале или в отдельной секции указать, что приложение при старте загружает переменные из файла `.env` (если файл существует в текущей рабочей директории).
- Упомянуть `.env.example` как образец: скопировать в `.env` и подставить свои значения.
- Сохранить существующий пример с `export` как альтернативный способ (переменные из окружения имеют приоритет над `.env`).
- Текущее предупреждение про секреты и `.gitignore` оставить.

Пример дополнения в начало или после вводного абзаца:

```markdown
On startup, the application loads variables from a `.env` file in the current working directory (if present). Copy `.env.example` to `.env` and set your values. Variables already set in the process environment take precedence over `.env`.
```

## 6. Тесты

**Файлы:** `test/config.test.ts` — без изменений кода.

Сценарии:

- **Регрессия:** запустить существующие тесты конфига (`npm test` или `node -r ts-node/register --test test/config.test.ts`). Тесты задают переменные через `process.env` в `before()` и вызывают `getConfig()`/`validateEnv()` напрямую, не проходя через `src/index.ts`, поэтому загрузка dotenv в точке входа на них не влияет. Убедиться, что все тесты проходят после внедрения dotenv.
- **Ручная проверка:** запуск `npm run dev` или `npm start` с заполненным `.env` в корне проекта — приложение должно стартовать с переменными из файла.

Отдельные unit-тесты на «dotenv загружает .env» не требуются: поведение обеспечивается порядком импорта в `index.ts` и покрывается ручным/интеграционным запуском.

## Сводка файлов

| Действие   | Файл            |
|-----------|------------------|
| Изменить  | `package.json`   |
| Изменить  | `src/index.ts`   |
| Проверить | `.gitignore`     |
| Создать   | `.env.example`   |
| Изменить  | `docs/env.md`    |

## Ссылки

- [analyze.md](./analyze.md) текущей задачи
