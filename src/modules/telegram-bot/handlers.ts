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
  reply: (text: string, extra?: unknown) => Promise<unknown>;
}

export interface CallbackContext {
  from?: { id: number; username?: string } | null;
  callbackQuery: { data?: string };
  answerCbQuery: (text?: string) => Promise<unknown>;
  reply: (text: string, extra?: unknown) => Promise<unknown>;
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
    const allScenes = await deps.obsScenes.getScenesForDisplay();
    const scenes = allScenes.filter((s) => s.name.startsWith('src.'));
    if (scenes.length === 0) {
      await ctx.reply('Сцены не найдены.').catch(() => {});
      return;
    }
    const inline_keyboard = scenes.map((s) => [
      { text: s.title ?? s.name.slice(4), callback_data: `scene:${s.name}` },
    ]);
    await ctx.reply('Выберите сцену:', { reply_markup: { inline_keyboard } }).catch(() => {});
    deps.logger.info('Telegram bot: remote command processed', { type: 'scenes', userId: from.id });
  } catch (err) {
    deps.logger.error('Telegram bot: get scenes failed', String(err));
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
  }
}

/** Внутренняя: переключает OBS на сцену src.<inputName>, проверяя наличие в списке. */
async function switchSceneByName(
  inputName: string,
  from: { id: number; username?: string },
  deps: TelegramBotDeps,
  reply: (text: string) => Promise<unknown>
): Promise<void> {
  if (!deps.obsScenes) {
    await reply('OBS scenes недоступны.').catch(() => {});
    return;
  }
  const fullName = `src.${inputName}`;
  const scenes = await deps.obsScenes.getScenesForDisplay();
  const isAllowed = scenes.some((s) => s.name === fullName);
  if (!isAllowed) {
    await reply(`Сцена недоступна для переключения: ${inputName}`).catch(() => {});
    return;
  }
  try {
    await deps.obsScenes.setScene(fullName);
    deps.logger.info('Telegram bot: remote command processed', { type: 'scene', scene: fullName, userId: from.id });
    await reply(`Сцена переключена: ${inputName}`).catch(() => {});
  } catch (err) {
    if (err instanceof SceneNotFoundError) {
      const displayName = err.sceneName.startsWith('src.') ? err.sceneName.slice(4) : err.sceneName;
      await reply(`Сцена не найдена: ${displayName}`).catch(() => {});
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      await reply(`Ошибка: ${msg}`).catch(() => {});
    }
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
  const inputName = ctx.message.text.replace(/^\s*\/scene\s*/i, '').trim();
  if (!inputName) {
    await ctx.reply('Использование: /scene <name>').catch(() => {});
    return;
  }
  await switchSceneByName(inputName, from, deps, ctx.reply.bind(ctx));
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

/** Возвращает список всех доступных команд бота. */
export async function handleHelp(ctx: CommandContext): Promise<void> {
  const text = [
    'Доступные команды:',
    '',
    '/status — статус системы (Chrome, OBS, текущая сцена)',
    '/idle — переключить Chrome на idle-страницу',
    '/restart chrome|obs|all — перезапустить Chrome, OBS или оба',
    '/scenes — список сцен OBS',
    '/scene <name> — переключить OBS на сцену',
    '/current — текущая активная сцена OBS',
    '/backup — переключить OBS на сцену "backup"',
    '/default — переключить OBS на сцену "default"',
    '/help — показать это сообщение',
    '',
    'Также можно отправить URL (http/https) — страница откроется в Chrome.',
  ].join('\n');
  await ctx.reply(text).catch(() => {});
}

/** Обрабатывает нажатие кнопки сцены (callback_data: 'scene:src.<name>'). */
export async function handleCallbackScene(ctx: CallbackContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    deps.logger.warn('Telegram bot: unauthorized callback', { userId: from?.id, username: from?.username });
    await ctx.answerCbQuery('Доступ запрещён.').catch(() => {});
    return;
  }
  const data = ctx.callbackQuery.data ?? '';
  const fullName = data.replace(/^scene:/, '');
  const inputName = fullName.startsWith('src.') ? fullName.slice(4) : fullName;

  await ctx.answerCbQuery().catch(() => {});
  await switchSceneByName(inputName, from, deps, ctx.reply.bind(ctx));
}

/** Обрабатывает нажатие кнопки рестарта (callback_data: 'restart:chrome|obs|all'). */
export async function handleCallbackRestart(ctx: CallbackContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    await ctx.answerCbQuery('Доступ запрещён.').catch(() => {});
    return;
  }
  const { restartChrome, restartObs } = deps;
  if (!restartChrome || !restartObs) {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply('Рестарт недоступен.').catch(() => {});
    return;
  }
  const data = ctx.callbackQuery.data ?? '';
  const arg = data.replace(/^restart:/, '').toLowerCase();
  if (!['chrome', 'obs', 'all'].includes(arg)) {
    await ctx.answerCbQuery().catch(() => {});
    return;
  }
  await ctx.answerCbQuery().catch(() => {});
  try {
    if (arg === 'chrome' || arg === 'all') await restartChrome(deps.config, deps.logger);
    if (arg === 'obs' || arg === 'all') await restartObs(deps.config, deps.logger);
    deps.logger.info('Telegram bot: remote command processed', { type: 'restart', target: arg, userId: from.id });
    const label = arg === 'chrome' ? 'Chrome перезапущен.' : arg === 'obs' ? 'OBS перезапущен.' : 'Chrome и OBS перезапущены.';
    await ctx.reply(label).catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Ошибка: ${msg}`).catch(() => {});
  }
}

/** Отправляет меню с кнопками для всех основных команд. */
export async function handleMenu(ctx: CommandContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    await ctx.reply('Доступ запрещён.').catch(() => {});
    return;
  }
  const inline_keyboard = [
    [
      { text: 'Статус', callback_data: 'menu:status' },
      { text: 'Текущая сцена', callback_data: 'menu:current' },
    ],
    [
      { text: 'Сцены', callback_data: 'menu:scenes' },
      { text: 'Idle', callback_data: 'menu:idle' },
    ],
    [
      { text: 'Backup', callback_data: 'menu:backup' },
      { text: 'Default', callback_data: 'menu:default' },
    ],
    [
      { text: 'Restart Chrome', callback_data: 'restart:chrome' },
      { text: 'Restart OBS', callback_data: 'restart:obs' },
      { text: 'Restart All', callback_data: 'restart:all' },
    ],
  ];
  await ctx.reply('Меню:', { reply_markup: { inline_keyboard } }).catch(() => {});
}

/** Диспетчер кнопок меню (callback_data: 'menu:<command>'). */
export async function handleCallbackMenu(ctx: CallbackContext, deps: TelegramBotDeps): Promise<void> {
  const from = ctx.from;
  if (!from || !deps.allowedUsers.isAllowed({ id: from.id, username: from.username })) {
    await ctx.answerCbQuery('Доступ запрещён.').catch(() => {});
    return;
  }
  await ctx.answerCbQuery().catch(() => {});
  const data = ctx.callbackQuery.data ?? '';
  const command = data.replace(/^menu:/, '');

  const proxyCtx: CommandContext = {
    from,
    message: { text: `/${command}` },
    reply: ctx.reply.bind(ctx),
  };

  switch (command) {
    case 'status':  return handleStatus(proxyCtx, deps);
    case 'current': return handleCurrent(proxyCtx, deps);
    case 'scenes':  return handleScenes(proxyCtx, deps);
    case 'idle':    return handleIdle(proxyCtx, deps);
    case 'backup':  return handleBackup(proxyCtx, deps);
    case 'default': return handleDefault(proxyCtx, deps);
  }
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
