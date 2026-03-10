"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const config_1 = require("./modules/config");
const logger_1 = require("./modules/logger");
const startup_checks_1 = require("./modules/startup-checks");
const idle_server_1 = require("./modules/idle-server");
const orchestrator_1 = require("./modules/orchestrator");
const chrome_1 = require("./modules/chrome");
async function main() {
    const config = (0, config_1.getConfig)();
    const logger = (0, logger_1.createLogger)(config.logLevel);
    logger.info('Table server starting');
    await (0, startup_checks_1.checkChromeAndObs)(config, logger);
    await (0, idle_server_1.startIdleServer)(config);
    const chromeModule = (0, chrome_1.createChromeModule)(config, logger);
    const obsStub = {
        name: 'OBS',
        start: async () => {
            logger.info('OBS module stub');
        },
    };
    await (0, orchestrator_1.runOrchestrator)([chromeModule, obsStub], logger);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map