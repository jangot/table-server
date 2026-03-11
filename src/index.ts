import 'reflect-metadata';
import 'dotenv/config';
import { getConfig } from './modules/config';
import { createLogger } from './modules/logger';
import { checkChromeAndObs } from './modules/startup-checks';
import { startIdleServer, setHealthChecker } from './modules/idle-server';
import { runOrchestrator } from './modules/orchestrator';
import { createChromeModule, isChromeAlive, navigateToUrl, readLastUrl, restartChrome } from './modules/chrome';
import { createObsModule, isObsAlive, restartObs } from './modules/obs';
import { createObsScenesService } from './modules/obs-scenes';
import { startWatchdog } from './modules/watchdog';
import { createAllowedUsersChecker } from './modules/users';
import { startBot } from './modules/telegram-bot';

async function main(): Promise<void> {
  const config = getConfig();
  const logger = createLogger(config.logLevel);
  logger.info('Table server starting');

  await checkChromeAndObs(config, logger);

  await startIdleServer(config);

  const chromeModule = createChromeModule(config, logger);
  const obsModule = createObsModule(config, logger);
  await runOrchestrator([chromeModule, obsModule], logger);

  const obsScenesService = createObsScenesService(config.obs, logger, config.scenesConfigPath);
  // obsScenesService reserved for Telegram bot (014) and Web API (015)
  void obsScenesService;

  if (config.watchdog.checkIntervalMs != null && config.watchdog.checkIntervalMs > 0) {
    startWatchdog(config, logger, {
      isChromeAlive,
      restartChrome,
      isObsAlive,
      restartObs,
    });
  }

  setHealthChecker(() => ({
    chrome: isChromeAlive(config),
    obs: isObsAlive(),
  }));

  const lastUrlPath = config.lastUrlStatePath ?? './.last-url';
  const lastUrl = await readLastUrl(lastUrlPath);
  if (lastUrl) {
    await navigateToUrl(lastUrl, { config, logger });
  }

  if (config.telegram.botToken) {
    const allowedUsers = createAllowedUsersChecker(config);
    startBot({
      config,
      logger,
      allowedUsers,
      navigateToUrl,
      isChromeAlive,
      isObsAlive: (c) => (void c, isObsAlive()),
      restartChrome,
      restartObs,
    }).catch((err) => {
      logger.error('Telegram bot failed to start', err);
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
