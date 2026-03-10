import type { Logger } from '../logger';

export interface AppModule {
  name: string;
  start(): Promise<void>;
}

/**
 * Run modules in order: for each module call start(), await, then next.
 */
export async function runOrchestrator(modules: AppModule[], logger: Logger): Promise<void> {
  for (const mod of modules) {
    logger.info(`Starting ${mod.name}`);
    await mod.start();
  }
}
