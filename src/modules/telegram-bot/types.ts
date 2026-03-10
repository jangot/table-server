import type { AppConfig } from '../config/types';
import type { Logger } from '../logger';
import type { AllowedUsersChecker } from '../users';

export interface TelegramBotDeps {
  config: AppConfig;
  logger: Logger;
  allowedUsers: AllowedUsersChecker;
  navigateToUrl: (url: string, deps: { config: AppConfig; logger: Logger }) => Promise<void>;
  isChromeAlive: (config: AppConfig) => boolean;
  isObsAlive: (config: AppConfig) => boolean;
  restartChrome?: (config: AppConfig, logger: Logger) => Promise<void>;
  restartObs?: (config: AppConfig, logger: Logger) => Promise<void>;
}
