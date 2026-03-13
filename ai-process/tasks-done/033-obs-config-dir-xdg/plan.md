# План реализации: OBS config-dir через XDG_CONFIG_HOME

Задача заменяет передачу пути к конфигу OBS с CLI-флага `--config-dir` (который не поддерживается текущей версией OBS) на переменную окружения `XDG_CONFIG_HOME` при запуске процесса. Переменная `OBS_CONFIG_DIR` и вся логика её валидации остаётся без изменений.

## 1. Убрать `--config-dir` из `buildObsArgs`

**Файл (изменить):** `src/modules/obs/args.ts`

Удалить строку `args.push('--config-dir', config.obs.configDir)`. Функция больше не использует `configDir` — аргумент `config` остаётся (нужен для `profilePath`).

```typescript
export function buildObsArgs(config: AppConfig): string[] {
  const args: string[] = [];
  if (config.obs.profilePath) {
    args.push(`--profile=${config.obs.profilePath}`);
  }
  return args;
}
```

## 2. Добавить параметр `env` в `launchObs`

**Файл (изменить):** `src/modules/obs/launch.ts`

Добавить необязательный параметр `env?: NodeJS.ProcessEnv` и передать его в опции `spawn`. Обновить security-комментарий, упомянув env.

```typescript
/**
 * Security: obsPath, args, and env are passed to spawn with shell: false and must
 * contain only values from config (env), never user input — protects against command injection.
 */
export async function launchObs(
  obsPath: string,
  args: string[],
  timeoutMs: number,
  logger: Logger,
  env?: NodeJS.ProcessEnv
): Promise<void> {
  obsProcess = spawn(obsPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    ...(env !== undefined ? { env } : {}),
  });
  // ... остальное без изменений
}
```

## 3. Передать `XDG_CONFIG_HOME` из `createObsModule`

**Файл (изменить):** `src/modules/obs/index.ts`

В функции `run()` формировать `env` и передавать пятым аргументом в `launchObs`.

```typescript
function run(): Promise<void> {
  const args = buildObsArgs(config);
  const timeoutMs = config.obs.readyTimeout ?? 10000;
  const env = { ...process.env, XDG_CONFIG_HOME: config.obs.configDir };
  return launchObs(config.obs.path, args, timeoutMs, logger, env);
}
```

## 4. Обновить тесты

**Файл (изменить):** `test/obs.test.ts`

### Тест-кейсы `buildObsArgs` — переписать:

Убрать все проверки на `--config-dir`. Поведение теперь:
- без `profilePath` → пустой массив
- с `profilePath` → массив из одного элемента `--profile=...`
- `configDir` больше не влияет на args

```typescript
describe('buildObsArgs', () => {
  it('returns empty array when no profilePath', () => {
    const config = baseConfig();
    const args = buildObsArgs(config);
    assert.deepStrictEqual(args, []);
  });

  it('returns [--profile=...] when profilePath is set', () => {
    const config = baseConfig({ profilePath: '/home/user/.config/obs-studio' });
    const args = buildObsArgs(config);
    assert.deepStrictEqual(args, ['--profile=/home/user/.config/obs-studio']);
  });

  it('configDir does not appear in args', () => {
    const config = baseConfig({ configDir: '/path/with spaces/obs' });
    const args = buildObsArgs(config);
    assert.ok(!args.some(a => a.includes('config-dir')));
    assert.ok(!args.some(a => a.includes('/path/with spaces/obs')));
  });
});
```

### Добавить тест для `launchObs` с env (опционально, если есть мок spawn):

Если в тестовой инфраструктуре есть возможность замокать `spawn` — добавить проверку, что `XDG_CONFIG_HOME` передаётся в `env`. Если нет — достаточно обновлённых тестов `buildObsArgs`.

## Сводка файлов

| Действие | Файл |
|----------|------|
| Изменить | `src/modules/obs/args.ts` |
| Изменить | `src/modules/obs/launch.ts` |
| Изменить | `src/modules/obs/index.ts` |
| Изменить | `test/obs.test.ts` |

## Ссылки
- [analyze.md](./analyze.md)
