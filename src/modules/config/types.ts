/**
 * Application configuration (stage 001: idle server and executable checks).
 * Extended in later stages: botToken, allowedUsers, restart policy, etc.
 */
export interface AppConfig {
  chromePath: string;
  obsPath: string;
  idlePort: number;
  idleViewsPath: string;
  logLevel: 'info' | 'warn' | 'error' | 'debug';
  devToolsPort?: number;
  chromeReadyTimeout?: number;
  obsReadyTimeout?: number;
}
