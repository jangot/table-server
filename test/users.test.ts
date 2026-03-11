import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAllowedUsersChecker } from '../src/modules/users';
import type { AppConfig } from '../src/modules/config/types';

function config(telegramOverrides: { allowedUsers?: string[] } = {}): AppConfig {
  return {
    logLevel: 'info',
    chrome: { path: '/usr/bin/chrome' },
    obs: { path: '/usr/bin/obs' },
    idle: { port: 3000, viewsPath: './views' },
    telegram: { ...telegramOverrides },
    watchdog: {},
  } as unknown as AppConfig;
}

describe('users', () => {
  it('isAllowed returns true for id in list', () => {
    const checker = createAllowedUsersChecker(
      config({ allowedUsers: ['123', 'alice'] })
    );
    assert.strictEqual(checker.isAllowed({ id: 123 }), true);
  });

  it('isAllowed returns false for id not in list', () => {
    const checker = createAllowedUsersChecker(
      config({ allowedUsers: ['123', 'alice'] })
    );
    assert.strictEqual(checker.isAllowed({ id: 456 }), false);
  });

  it('isAllowed returns true for username in list', () => {
    const checker = createAllowedUsersChecker(
      config({ allowedUsers: ['123', 'alice'] })
    );
    assert.strictEqual(checker.isAllowed({ username: 'alice' }), true);
  });

  it('isAllowed is case-insensitive for username', () => {
    const checker = createAllowedUsersChecker(
      config({ allowedUsers: ['123', 'alice'] })
    );
    assert.strictEqual(checker.isAllowed({ username: 'Alice' }), true);
  });

  it('isAllowed returns false for username not in list', () => {
    const checker = createAllowedUsersChecker(
      config({ allowedUsers: ['123', 'alice'] })
    );
    assert.strictEqual(checker.isAllowed({ username: 'bob' }), false);
  });

  it('empty list: isAllowed returns false for any id', () => {
    const checker = createAllowedUsersChecker(
      config({ allowedUsers: [] })
    );
    assert.strictEqual(checker.isAllowed({ id: 123 }), false);
  });

  it('missing allowedTelegramUsers: isAllowed returns false', () => {
    const checker = createAllowedUsersChecker(config());
    assert.strictEqual(checker.isAllowed({ id: 123 }), false);
  });

  it('username with leading @ is normalized and matches', () => {
    const checker = createAllowedUsersChecker(
      config({ allowedUsers: ['alice'] })
    );
    assert.strictEqual(checker.isAllowed({ username: '@alice' }), true);
  });
});
