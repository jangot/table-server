import { Telegraf } from 'telegraf';
import type { TelegramBotDeps } from './types';
import { handleStatus, handleIdle, handleRestart, handleText } from './handlers';

export function createBot(deps: TelegramBotDeps): Telegraf {
  const { config } = deps;
  const bot = new Telegraf(config.telegramBotToken!);

  bot.command('status', (ctx) => handleStatus(ctx as unknown as import('./handlers').CommandContext, deps));
  bot.command('idle', (ctx) => handleIdle(ctx as unknown as import('./handlers').CommandContext, deps));
  bot.command('restart', (ctx) => handleRestart(ctx as unknown as import('./handlers').CommandContext, deps));

  bot.on('text', (ctx) => handleText(ctx as unknown as import('./handlers').CommandContext, deps));

  return bot;
}

export async function startBot(deps: TelegramBotDeps): Promise<void> {
  const bot = createBot(deps);
  await bot.launch();
  deps.logger.info('Telegram bot started');
}
