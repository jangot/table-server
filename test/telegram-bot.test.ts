import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { handleStatus, handleIdle, handleRestart, handleText } from '../src/modules/telegram-bot/handlers';
import type { CommandContext } from '../src/modules/telegram-bot/handlers';
import type { TelegramBotDeps } from '../src/modules/telegram-bot/types';
import type { AppConfig } from '../src/modules/config/types';
import type { Logger } from '../src/modules/logger';

const idlePort = 3999;
const testConfig: AppConfig = {
  logLevel: 'info',
  chrome: { path: '/usr/bin/chrome' },
  obs: { path: '/usr/bin/obs' },
  idle: { port: idlePort, viewsPath: './views' },
  telegram: { botToken: 'test-token', allowedUsers: ['123', 'alice'] },
  watchdog: {},
} as unknown as AppConfig;

const allowedUser = { id: 123, username: 'alice' };
const disallowedUser = { id: 456, username: 'bob' };

function makeLogger(): Logger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

function makeMockCtx(
  text: string,
  from: { id: number; username?: string }
): CommandContext & { replyText: string } {
  const state: { replyText: string } = { replyText: '' };
  const ctx = {
    from,
    message: { text },
    reply: async (t: string) => {
      state.replyText = t;
    },
  };
  Object.defineProperty(ctx, 'replyText', {
    get: () => state.replyText,
    configurable: true,
    enumerable: true,
  });
  return ctx as CommandContext & { replyText: string };
}

describe('telegram-bot', () => {
  it('/status: allowed user receives status text with ready/degraded and chrome/obs', async () => {
    const ctx = makeMockCtx('/status', allowedUser);
    const deps: TelegramBotDeps = {
      config: testConfig,
      logger: makeLogger(),
      allowedUsers: { isAllowed: (u) => u.id === allowedUser.id || u.username === allowedUser.username },
      navigateToUrl: async () => {},
      isChromeAlive: () => true,
      isObsAlive: () => true,
    };
    await handleStatus(ctx, deps);
    assert.ok(ctx.replyText.includes('ready') || ctx.replyText.includes('degraded'));
    assert.ok(ctx.replyText.includes('Chrome:'));
    assert.ok(ctx.replyText.includes('OBS:'));
  });

  it('/status: disallowed user receives "Доступ запрещён."', async () => {
    const ctx = makeMockCtx('/status', disallowedUser);
    const deps: TelegramBotDeps = {
      config: testConfig,
      logger: makeLogger(),
      allowedUsers: { isAllowed: () => false },
      navigateToUrl: async () => {},
      isChromeAlive: () => true,
      isObsAlive: () => true,
    };
    await handleStatus(ctx, deps);
    assert.strictEqual(ctx.replyText, 'Доступ запрещён.');
  });

  it('/idle: allowed user with system ready calls navigateToUrl with idle URL and replies', async () => {
    let capturedUrl: string | null = null;
    const ctx = makeMockCtx('/idle', allowedUser);
    const deps: TelegramBotDeps = {
      config: testConfig,
      logger: makeLogger(),
      allowedUsers: { isAllowed: () => true },
      navigateToUrl: async (url) => {
        capturedUrl = url;
      },
      isChromeAlive: () => true,
      isObsAlive: () => true,
    };
    await handleIdle(ctx, deps);
    assert.strictEqual(capturedUrl, `http://localhost:${idlePort}/`);
    assert.strictEqual(ctx.replyText, 'Переключено на idle.');
  });

  it('/idle: when system not ready replies "Система не готова."', async () => {
    const ctx = makeMockCtx('/idle', allowedUser);
    const deps: TelegramBotDeps = {
      config: testConfig,
      logger: makeLogger(),
      allowedUsers: { isAllowed: () => true },
      navigateToUrl: async () => {},
      isChromeAlive: () => false,
      isObsAlive: () => true,
    };
    await handleIdle(ctx, deps);
    assert.strictEqual(ctx.replyText, 'Система не готова.');
  });

  it('/restart chrome: allowed user with restartChrome calls it and replies', async () => {
    let restartChromeCalled = false;
    const ctx = makeMockCtx('/restart chrome', allowedUser);
    const deps: TelegramBotDeps = {
      config: testConfig,
      logger: makeLogger(),
      allowedUsers: { isAllowed: () => true },
      navigateToUrl: async () => {},
      isChromeAlive: () => true,
      isObsAlive: () => true,
      restartChrome: async () => {
        restartChromeCalled = true;
      },
      restartObs: async () => {},
    };
    await handleRestart(ctx, deps);
    assert.strictEqual(restartChromeCalled, true);
    assert.strictEqual(ctx.replyText, 'Chrome перезапущен.');
  });

  it('/restart with invalid argument replies usage message', async () => {
    const ctx = makeMockCtx('/restart invalid', allowedUser);
    const deps: TelegramBotDeps = {
      config: testConfig,
      logger: makeLogger(),
      allowedUsers: { isAllowed: () => true },
      navigateToUrl: async () => {},
      isChromeAlive: () => true,
      isObsAlive: () => true,
      restartChrome: async () => {},
      restartObs: async () => {},
    };
    await handleRestart(ctx, deps);
    assert.ok(ctx.replyText.includes('Использование') || ctx.replyText.includes('/restart'));
  });

  it('text starting with / but unknown command replies "Неизвестная команда."', async () => {
    let navigateCalled = false;
    const ctx = makeMockCtx('/unknown', allowedUser);
    const deps: TelegramBotDeps = {
      config: testConfig,
      logger: makeLogger(),
      allowedUsers: { isAllowed: () => true },
      navigateToUrl: async () => {
        navigateCalled = true;
      },
      isChromeAlive: () => true,
      isObsAlive: () => true,
    };
    await handleText(ctx, deps);
    assert.strictEqual(ctx.replyText, 'Неизвестная команда.');
    assert.strictEqual(navigateCalled, false);
  });
});
