import type { Logger } from '../logger';
export interface AppModule {
    name: string;
    start(): Promise<void>;
}
/**
 * Run modules in order: for each module call start(), await, then next.
 */
export declare function runOrchestrator(modules: AppModule[], logger: Logger): Promise<void>;
//# sourceMappingURL=index.d.ts.map