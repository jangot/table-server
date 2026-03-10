import { getConfig } from './modules/config';
import { createLogger } from './modules/logger';
import { checkChromeAndObs } from './modules/startup-checks';
import { startIdleServer } from './modules/idle-server';
import { runOrchestrator, type AppModule } from './modules/orchestrator';

async function main(): Promise<void> {
  const config = getConfig();
  const logger = createLogger(config.logLevel);
  logger.info('Table server starting');

  await checkChromeAndObs(config, logger);

  await startIdleServer(config);

  const chromeStub: AppModule = {
    name: 'Chrome',
    start: async () => {
      logger.info('Chrome module stub');
    },
  };
  const obsStub: AppModule = {
    name: 'OBS',
    start: async () => {
      logger.info('OBS module stub');
    },
  };
  await runOrchestrator([chromeStub, obsStub], logger);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
