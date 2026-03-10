"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOrchestrator = runOrchestrator;
/**
 * Run modules in order: for each module call start(), await, then next.
 */
async function runOrchestrator(modules, logger) {
    for (const mod of modules) {
        logger.info(`Starting ${mod.name}`);
        await mod.start();
    }
}
//# sourceMappingURL=index.js.map