import type { TelegramBotDeps } from './types';
import { SceneNotFoundError } from '../obs-scenes/types';

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

/** Отвечает статусом: готовность системы, Chrome/OBS alive, текущая сцена OBS. */
export async function handleStatus(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    await ctx.reply('Доступ запрещён.').catch(() => {});
    return;
  }
  const chrome = deps.isChromeAlive(deps.config);
  const obs = deps.isObsAlive(deps.config);
  const ready = chrome && obs;

  let currentScene: string | null = null;
  let obsConnected = false;
  if (deps.obsScenes) {
    try {
      currentScene = await deps.obsScenes.getCurrentScene();
      obsConnected = true;
    } catch {
      obsConnected = false;
    }
  }

  const obsLine = deps.obsScenes
    ? `OBS WS: ${obsConnected ? 'connected' : 'disconnected'}.`
    : '';
  const sceneLine = currentScene ? `Current scene: ${currentScene}.` : '';

  const parts = [
    `Готовность: ${ready ? 'ready' : 'degraded'}. Chrome: ${chrome ? 'alive' : 'dead'}. OBS: ${obs ? 'alive' : 'dead'}.`,
    obsLine,
    sceneLine,
  ].filter(Boolean);

  await ctx.reply(parts.join(' ')).catch(() => {});
  deps.logger.info('Telegram bot: remote command processed', { type: 'status', userId: from.id });
}

/** Переключает Chrome на idle-страницу (localhost:idle.port). */
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
  const idleUrl = `http://localhost:${deps.config.idle.port}/`;
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

/** Перезапускает chrome, obs или оба (аргумент: chrome | obs | all). */
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

/** Возвращает список сцен OBS для отображения (названия). */
export async function handleScenes(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    deps.logger.warn('Telegram bot: unauthorized request', { userId: from?.id, username: from?.username });
    await ctx.reply('Доступ запрещён.').catch(() => {});
    return;
  }
  if (!deps.obsScenes) {
    await ctx.reply('OBS scenes недоступны.').catch(() => {});
    return;
  }
  try {
    const scenes = await deps.obsScenes.getScenesForDisplay();
    if (scenes.length === 0) {
      await ctx.reply('Сцены не найдены.').catch(() => {});
      return;
    }
    const lines = scenes.map((s) => `• ${s.title ?? s.name}`);
    await ctx.reply(lines.join('\n')).catch(() => {});
    deps.logger.info('Telegram bot: remote command processed', { type: 'scenes', userId: from.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
  }
}

/** Переключает OBS на сцену по имени из команды /scene <name>. */
export async function handleScene(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    deps.logger.warn('Telegram bot: unauthorized request', { userId: from?.id, username: from?.username });
    await ctx.reply('Доступ запрещён.').catch(() => {});
    return;
  }
  if (!deps.obsScenes) {
    await ctx.reply('OBS scenes недоступны.').catch(() => {});
    return;
  }
  const sceneName = ctx.message.text.replace(/^\s*\/scene\s*/i, '').trim();
  if (!sceneName) {
    await ctx.reply('Использование: /scene <name>').catch(() => {});
    return;
  }
  try {
    await deps.obsScenes.setScene(sceneName);
    deps.logger.info('Telegram bot: remote command processed', { type: 'scene', scene: sceneName, userId: from.id });
    await ctx.reply(`Сцена переключена: ${sceneName}`).catch(() => {});
  } catch (err) {
    if (err instanceof SceneNotFoundError) {
      await ctx.reply(`Сцена не найдена: ${err.sceneName}`).catch(() => {});
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
    }
  }
}

/** Возвращает имя текущей активной сцены OBS. */
export async function handleCurrent(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    deps.logger.warn('Telegram bot: unauthorized request', { userId: from?.id, username: from?.username });
    await ctx.reply('Доступ запрещён.').catch(() => {});
    return;
  }
  if (!deps.obsScenes) {
    await ctx.reply('OBS scenes недоступны.').catch(() => {});
    return;
  }
  try {
    const current = await deps.obsScenes.getCurrentScene();
    await ctx.reply(current ? `Текущая сцена: ${current}` : 'Сцена не определена.').catch(() => {});
    deps.logger.info('Telegram bot: remote command processed', { type: 'current', userId: from.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
  }
}

/** Внутренняя: переключает OBS на сцену по имени (используется handleBackup/handleDefault). */
async function switchToNamedScene(
  name: string,
  type: string,
  ctx: CommandContext,
  deps: TelegramBotDeps
): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    deps.logger.warn('Telegram bot: unauthorized request', { userId: from?.id, username: from?.username });
    await ctx.reply('Доступ запрещён.').catch(() => {});
    return;
  }
  if (!deps.obsScenes) {
    await ctx.reply('OBS scenes недоступны.').catch(() => {});
    return;
  }
  try {
    await deps.obsScenes.setScene(name);
    deps.logger.info('Telegram bot: remote command processed', { type, scene: name, userId: from.id });
    await ctx.reply(`Сцена переключена: ${name}`).catch(() => {});
  } catch (err) {
    if (err instanceof SceneNotFoundError) {
      await ctx.reply(`Сцена не найдена: ${err.sceneName}`).catch(() => {});
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
    }
  }
}

/** Переключает OBS на сцену "backup". */
export async function handleBackup(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  await switchToNamedScene('backup', 'backup', ctx, deps);
}

/** Переключает OBS на сцену "default". */
export async function handleDefault(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  await switchToNamedScene('default', 'default', ctx, deps);
}

/** Обрабатывает текст: если сообщение содержит URL — открывает его в Chrome; иначе просит URL или отвечает «Неизвестная команда». */
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
