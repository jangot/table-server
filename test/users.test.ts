import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAllowedUsersChecker } from '../src/modules/users';
import type { AppConfig } from '../src/modules/config/types';

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    chromePath: '/usr/bin/chrome',
    obsPath: '/usr/bin/obs',
    idlePort: 3000,
    idleViewsPath: './views',
    logLevel: 'info',
    ...overrides,
  };
}

describe('users', () => {
  it('isAllowed returns true for id in list', () => {
    const checker = createAllowedUsersChecker(
      config({ allowedTelegramUsers: ['123', 'alice'] })
    );
    assert.strictEqual(checker.isAllowed({ id: 123 }), true);
  });

  it('isAllowed returns false for id not in list', () => {
    const checker = createAllowedUsersChecker(
      config({ allowedTelegramUsers: ['123', 'alice'] })
    );
    assert.strictEqual(checker.isAllowed({ id: 456 }), false);
  });

  it('isAllowed returns true for username in list', () => {
    const checker = createAllowedUsersChecker(
      config({ allowedTelegramUsers: ['123', 'alice'] })
    );
    assert.strictEqual(checker.isAllowed({ username: 'alice' }), true);
  });

  it('isAllowed is case-insensitive for username', () => {
    const checker = createAllowedUsersChecker(
      config({ allowedTelegramUsers: ['123', 'alice'] })
    );
    assert.strictEqual(checker.isAllowed({ username: 'Alice' }), true);
  });

  it('isAllowed returns false for username not in list', () => {
    const checker = createAllowedUsersChecker(
      config({ allowedTelegramUsers: ['123', 'alice'] })
    );
    assert.strictEqual(checker.isAllowed({ username: 'bob' }), false);
  });

  it('empty list: isAllowed returns false for any id', () => {
    const checker = createAllowedUsersChecker(
      config({ allowedTelegramUsers: [] })
    );
    assert.strictEqual(checker.isAllowed({ id: 123 }), false);
  });

  it('missing allowedTelegramUsers: isAllowed returns false', () => {
    const checker = createAllowedUsersChecker(config());
    assert.strictEqual(checker.isAllowed({ id: 123 }), false);
  });

  it('username with leading @ is normalized and matches', () => {
    const checker = createAllowedUsersChecker(
      config({ allowedTelegramUsers: ['alice'] })
    );
    assert.strictEqual(checker.isAllowed({ username: '@alice' }), true);
  });
});
