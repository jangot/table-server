# План реализации: OBS config-dir через переменную окружения

Добавить обязательную переменную окружения `OBS_CONFIG_DIR`, которая передаётся OBS при запуске как `--config-dir <path>`.
Изменения затрагивают типы конфига, чтение env, генерацию аргументов, `.env.example` и тесты.

---

## 1. Добавить поле `configDir` в класс `ObsConfig`

**Файл (изменить):** `src/modules/config/types.ts`

Добавить обязательное поле после `profilePath` (строка 80). Без `@IsOptional()` — валидация упадёт, если переменная не задана.

```typescript
// после строки 80 (после profilePath?)
@IsString()
@IsNotEmpty()
configDir!: string;
```

---

## 2. Читать `OBS_CONFIG_DIR` в `validateEnv`

**Файл (изменить):** `src/modules/config/validate.ts`

Добавить строку в блок `obs:` (после `profilePath`, строка 83). Паттерн для обязательного строкового поля — без `|| undefined`.

```typescript
obs: plainToInstance(ObsConfig, {
  path: getEnv('OBS_PATH')?.trim(),
  readyTimeout: parseOptionalInt(getEnv('OBS_READY_TIMEOUT')),
  profilePath: getEnv('OBS_PROFILE_PATH')?.trim() || undefined,
  configDir: getEnv('OBS_CONFIG_DIR')?.trim(),   // <-- добавить
  host: getEnv('OBS_HOST')?.trim(),
  // ...
}),
```

---

## 3. Генерировать `--config-dir <path>` в `buildObsArgs`

**Файл (изменить):** `src/modules/obs/args.ts`

`--config-dir` передаётся двумя отдельными элементами (в отличие от `--profile=`).
Должен идти **перед** `--profile`, т.к. OBS обрабатывает `--config-dir` до загрузки профиля.

```typescript
export function buildObsArgs(config: AppConfig): string[] {
  const args: string[] = [];
  args.push('--config-dir', config.obs.configDir);   // <-- добавить первым
  if (config.obs.profilePath) {
    args.push(`--profile=${config.obs.profilePath}`);
  }
  return args;
}
```

---

## 4. Добавить `OBS_CONFIG_DIR` в `.env.example`

**Файл (изменить):** `.env.example`

Добавить в **обе секции** файла как обязательную переменную (без `#`):

**Секция 1 (строки 12–19, рабочий пример)** — после `OBS_PATH=` (строка 12):
```
OBS_PATH=/usr/bin/obs
OBS_CONFIG_DIR=/path/to/obs-config   # <-- добавить
OBS_HOST=localhost
```

**Секция 2 (строки 39–49, шаблон `# Required`)** — после `OBS_PATH=` (строка 41):
```
OBS_PATH=/usr/bin/obs
OBS_CONFIG_DIR=    # путь к папке конфигурации OBS (--config-dir)
OBS_HOST=localhost
```

---

## 5. Обновить тесты `buildObsArgs` в `test/obs.test.ts`

**Файл (изменить):** `test/obs.test.ts`

### 5a. Обновить сигнатуру `baseConfig`

`configDir` теперь обязательное поле — добавить его в тип переопределений и в объект по умолчанию:

```typescript
function baseConfig(obsOverrides: { profilePath?: string; configDir?: string } = {}): AppConfig {
  return {
    logLevel: 'info',
    chrome: { path: '/usr/bin/chrome' },
    obs: { path: '/usr/bin/obs', configDir: '/tmp/obs-config', ...obsOverrides },
    idle: { port: 3000, viewsPath: './views' },
    telegram: {},
    watchdog: {},
  } as unknown as AppConfig;
}
```

### 5b. Обновить существующие тесты

Тест "returns empty array when no obsProfilePath" теперь неверен — `configDir` всегда добавляет два аргумента. Обновить:

```typescript
it('returns [--config-dir, path] when no profilePath', () => {
  const config = baseConfig();
  const args = buildObsArgs(config);
  assert.strictEqual(args.length, 2);
  assert.strictEqual(args[0], '--config-dir');
  assert.strictEqual(args[1], '/tmp/obs-config');
});
```

Тест "returns array with --profile= when obsProfilePath set" — добавить проверку `--config-dir` перед `--profile`:

```typescript
it('returns [--config-dir, path, --profile=...] when both set', () => {
  const config = baseConfig({ profilePath: '/home/user/.config/obs-studio' });
  const args = buildObsArgs(config);
  assert.strictEqual(args.length, 3);
  assert.strictEqual(args[0], '--config-dir');
  assert.strictEqual(args[1], '/tmp/obs-config');
  assert.strictEqual(args[2], '--profile=/home/user/.config/obs-studio');
});
```

### 5c. Добавить новый тест — пробел в пути

```typescript
it('handles path with spaces correctly as separate array element', () => {
  const config = baseConfig({ configDir: '/path/with spaces/obs' });
  const args = buildObsArgs(config);
  assert.strictEqual(args[0], '--config-dir');
  assert.strictEqual(args[1], '/path/with spaces/obs');
});
```

---

## 6. Обновить тесты конфига в `test/config.test.ts`

**Файл (изменить):** `test/config.test.ts`

### 6a. Добавить `OBS_CONFIG_DIR` в объект `REQUIRED` (строка 10–21)

```typescript
const REQUIRED = {
  CHROME_PATH: '/usr/bin/chrome',
  OBS_PATH: '/usr/bin/obs',
  OBS_CONFIG_DIR: '/tmp/obs-config',   // <-- добавить
  OBS_HOST: 'localhost',
  // ...
};
```

### 6b. Добавить `OBS_CONFIG_DIR` в список очищаемых ключей в `after()` (строка 40–58)

`OBS_CONFIG_DIR` уже будет очищена через `...Object.keys(REQUIRED)` — дополнительно добавлять в явный список не нужно. Нужно лишь добавить в список строку 51 (рядом с `OBS_PROFILE_PATH`) на случай, если тест устанавливал её вручную:

```typescript
after(() => {
  unsetEnv([
    ...Object.keys(REQUIRED),
    // ...
    'OBS_CONFIG_DIR',   // <-- добавить (на случай ручной установки в тесте)
    'OBS_PROFILE_PATH',
    // ...
  ]);
  resetConfigForTesting();
});
```

### 6c. Добавить тест — `OBS_CONFIG_DIR` сохраняется в конфиге

```typescript
it('OBS_CONFIG_DIR is passed through to obs.configDir', () => {
  resetConfigForTesting();
  setEnv(REQUIRED);
  process.env.OBS_CONFIG_DIR = '/custom/obs-config';
  const config = getConfig();
  assert.strictEqual(config.obs.configDir, '/custom/obs-config');
  delete process.env.OBS_CONFIG_DIR;
});
```

### 6d. Добавить тест — валидация падает без `OBS_CONFIG_DIR`

```typescript
it('validateEnv throws when OBS_CONFIG_DIR is missing', () => {
  resetConfigForTesting();
  setEnv(REQUIRED);
  delete process.env.OBS_CONFIG_DIR;
  assert.throws(
    () => validateEnv(),
    /obs\.configDir/
  );
  setEnv(REQUIRED);
});
```

---

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/config/types.ts` |
| Изменить | `src/modules/config/validate.ts` |
| Изменить | `src/modules/obs/args.ts` |
| Изменить | `.env.example` |
| Изменить | `test/obs.test.ts` |
| Изменить | `test/config.test.ts` |

## Ссылки
- [analyze.md](./analyze.md)
