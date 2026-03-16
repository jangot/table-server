import { Telegraf } from 'telegraf';
import type { TelegramBotDeps } from './types';
import {
  handleStatus,
  handleIdle,
  handleRestart,
  handleText,
  handleScenes,
  handleScene,
  handleCurrent,
  handleBackup,
  handleDefault,
  handleHelp,
  handleMenu,
  handleCallbackScene,
  handleCallbackRestart,
  handleCallbackMenu,
} from './handlers';
import type { CommandContext, CallbackContext } from './handlers';

export function createBot(deps: TelegramBotDeps): Telegraf {
  const { config } = deps;
  const bot = new Telegraf(config.telegram.botToken!);

  bot.command('status',  (ctx) => handleStatus(ctx as unknown as CommandContext, deps));
  bot.command('idle',    (ctx) => handleIdle(ctx as unknown as CommandContext, deps));
  bot.command('restart', (ctx) => handleRestart(ctx as unknown as CommandContext, deps));
  bot.command('scenes',  (ctx) => handleScenes(ctx as unknown as CommandContext, deps));
  bot.command('scene',   (ctx) => handleScene(ctx as unknown as CommandContext, deps));
  bot.command('current', (ctx) => handleCurrent(ctx as unknown as CommandContext, deps));
  bot.command('backup',  (ctx) => handleBackup(ctx as unknown as CommandContext, deps));
  bot.command('default', (ctx) => handleDefault(ctx as unknown as CommandContext, deps));
  bot.command('help',    (ctx) => handleHelp(ctx as unknown as CommandContext));
  bot.command('menu',    (ctx) => handleMenu(ctx as unknown as CommandContext, deps));

  bot.action(/^scene:/,   (ctx) => handleCallbackScene(ctx as unknown as CallbackContext, deps));
  bot.action(/^restart:/, (ctx) => handleCallbackRestart(ctx as unknown as CallbackContext, deps));
  bot.action(/^menu:/,    (ctx) => handleCallbackMenu(ctx as unknown as CallbackContext, deps));

  bot.on('text', (ctx) => handleText(ctx as unknown as CommandContext, deps));

  return bot;
}

export async function startBot(deps: TelegramBotDeps): Promise<void> {
  const bot = createBot(deps);
  await bot.launch();
  deps.logger.info('Telegram bot started');
}
