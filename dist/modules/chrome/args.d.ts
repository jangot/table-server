import type { AppConfig } from '../config/types';
/**
 * Build Chrome CLI args for remote debugging and single-window mode.
 * Uses only config values (no user input). Safe to pass to spawn(argv).
 */
export declare function buildChromeArgs(config: AppConfig, devToolsPort: number, initialUrl: string): string[];
//# sourceMappingURL=args.d.ts.map