import 'dotenv/config';
import { getConfig } from './modules/config';
import { createLogger } from './modules/logger';
import { checkChromeAndObs } from './modules/startup-checks';
import { startIdleServer } from './modules/idle-server';
import { runOrchestrator } from './modules/orchestrator';
import { createChromeModule } from './modules/chrome';
import { createObsModule } from './modules/obs';

async function main(): Promise<void> {
  const config = getConfig();
  const logger = createLogger(config.logLevel);
  logger.info('Table server starting');

  await checkChromeAndObs(config, logger);

  await startIdleServer(config);

  const chromeModule = createChromeModule(config, logger);
  const obsModule = createObsModule(config, logger);
  await runOrchestrator([chromeModule, obsModule], logger);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
