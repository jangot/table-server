import { Telegraf } from 'telegraf';
import type { TelegramBotDeps } from './types';

function extractUrl(text: string): string | null {
  const trimmed = text.trim();
  const match = trimmed.match(/https?:\/\/\S+/);
  return match ? match[0].replace(/[\s,]+$/, '') : null;
}

export function createBot(deps: TelegramBotDeps): Telegraf {
  const { config, logger, allowedUsers, navigateToUrl, isChromeAlive, isObsAlive } =
    deps;
  const bot = new Telegraf(config.telegramBotToken!);

  bot.on('text', async (ctx) => {
    const url = extractUrl(ctx.message.text);
    const from = ctx.from;
    if (!from) return;

    if (!allowedUsers.isAllowed({ id: from.id, username: from.username })) {
      logger.warn('Telegram bot: unauthorized request', {
        userId: from.id,
        username: from.username,
      });
      await ctx.reply('Доступ запрещён.').catch(() => {});
      return;
    }

    if (!url) {
      await ctx.reply('Отправьте сообщение с URL (http или https).').catch(() => {});
      return;
    }

    if (!isChromeAlive(config) || !isObsAlive(config)) {
      logger.warn('Telegram bot: system not ready');
      await ctx
        .reply('Система не готова (Chrome или OBS недоступны).')
        .catch(() => {});
      return;
    }

    try {
      await navigateToUrl(url, { config, logger });
      logger.info('Telegram bot: navigated to URL', { url, userId: from.id });
      await ctx.reply('Страница открыта.').catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Telegram bot: navigate failed', err);
      await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
    }
  });

  return bot;
}

export async function startBot(deps: TelegramBotDeps): Promise<void> {
  const bot = createBot(deps);
  await bot.launch();
  deps.logger.info('Telegram bot started');
}
