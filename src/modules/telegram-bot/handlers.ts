import type { TelegramBotDeps } from './types';

/**
 * Security: user input (URL from message, /restart arg) is never passed to
 * shell or spawn. URL is only used in navigateToUrl (CDP + file). /restart
 * is restricted to chrome|obs|all. When adding URL validation, log rejected requests.
 */

export interface CommandContext {
  from?: { id: number; username?: string } | null;
  message: { text: string };
  reply: (text: string) => Promise<unknown>;
}

export async function handleStatus(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    await ctx.reply('Доступ запрещён.').catch(() => {});
    return;
  }
  const chrome = deps.isChromeAlive(deps.config);
  const obs = deps.isObsAlive(deps.config);
  const ready = chrome && obs;
  await ctx
    .reply(
      `Готовность: ${ready ? 'ready' : 'degraded'}. Chrome: ${chrome ? 'alive' : 'dead'}. OBS: ${obs ? 'alive' : 'dead'}.`
    )
    .catch(() => {});
  if (from) {
    deps.logger.info('Telegram bot: remote command processed', {
      type: 'status',
      userId: from.id,
    });
  }
}

export async function handleIdle(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    await ctx.reply('Доступ запрещён.').catch(() => {});
    return;
  }
  if (!deps.isChromeAlive(deps.config) || !deps.isObsAlive(deps.config)) {
    await ctx.reply('Система не готова.').catch(() => {});
    return;
  }
  const idleUrl = `http://localhost:${deps.config.idlePort}/`;
  try {
    await deps.navigateToUrl(idleUrl, { config: deps.config, logger: deps.logger });
    deps.logger.info('Telegram bot: remote command processed', {
      type: 'idle',
      userId: from.id,
    });
    await ctx.reply('Переключено на idle.').catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
  }
}

export async function handleRestart(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    await ctx.reply('Доступ запрещён.').catch(() => {});
    return;
  }
  const { restartChrome, restartObs } = deps;
  if (!restartChrome || !restartObs) {
    await ctx.reply('Рестарт недоступен.').catch(() => {});
    return;
  }
  const arg = ctx.message.text.replace(/^\s*\/restart\s*/i, '').trim().toLowerCase();
  if (!['chrome', 'obs', 'all'].includes(arg)) {
    await ctx.reply('Использование: /restart chrome | obs | all').catch(() => {});
    return;
  }
  if (arg === 'chrome') {
    try {
      await restartChrome(deps.config, deps.logger);
      deps.logger.info('Telegram bot: remote command processed', {
        type: 'restart',
        target: arg,
        userId: from.id,
      });
      await ctx.reply('Chrome перезапущен.').catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
    }
    return;
  }
  if (arg === 'obs') {
    try {
      await restartObs(deps.config, deps.logger);
      deps.logger.info('Telegram bot: remote command processed', {
        type: 'restart',
        target: arg,
        userId: from.id,
      });
      await ctx.reply('OBS перезапущен.').catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
    }
    return;
  }
  try {
    await restartChrome(deps.config, deps.logger);
    await restartObs(deps.config, deps.logger);
    deps.logger.info('Telegram bot: remote command processed', {
      type: 'restart',
      target: arg,
      userId: from.id,
    });
    await ctx.reply('Chrome и OBS перезапущены.').catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
  }
}

export async function handleText(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  if (ctx.message.text.trim().startsWith('/')) {
    await ctx.reply('Неизвестная команда.').catch(() => {});
    return;
  }
  const trimmed = ctx.message.text.trim();
  const match = trimmed.match(/https?:\/\/\S+/);
  const url = match ? match[0].replace(/[\s,]+$/, '') : null;
  const from = ctx.from;
  if (!from) return;

  if (!deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    deps.logger.warn('Telegram bot: unauthorized request', {
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

  if (!deps.isChromeAlive(deps.config) || !deps.isObsAlive(deps.config)) {
    deps.logger.warn('Telegram bot: system not ready');
    await ctx
      .reply('Система не готова (Chrome или OBS недоступны).')
      .catch(() => {});
    return;
  }

  try {
    await deps.navigateToUrl(url, { config: deps.config, logger: deps.logger });
    deps.logger.info('Telegram bot: remote command processed', {
      type: 'open',
      url,
      userId: from.id,
    });
    await ctx.reply('Страница открыта.').catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.logger.error('Telegram bot: navigate failed', err);
    await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
  }
}
