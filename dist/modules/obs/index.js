"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getObsProcess = void 0;
exports.createObsModule = createObsModule;
const args_1 = require("./args");
const launch_1 = require("./launch");
const restart_1 = require("./restart");
const RESTART_MIN_INTERVAL_MS = 5000;
const MAX_RESTARTS = 10;
function createObsModule(config, logger) {
    let lastRestartAt = 0;
    let restartCount = 0;
    function run() {
        const args = (0, args_1.buildObsArgs)(config);
        const timeoutMs = config.obsReadyTimeout ?? 10000;
        return (0, launch_1.launchObs)(config.obsPath, args, timeoutMs, logger);
    }
    function scheduleRestart() {
        const proc = (0, launch_1.getObsProcess)();
        if (!proc)
            return;
        proc.once('exit', (code, signal) => {
            logger.warn('OBS exited', { code, signal });
            restartCount++;
            if (restartCount > MAX_RESTARTS) {
                logger.error('OBS max restarts reached, not restarting');
                return;
            }
            const delay = (0, restart_1.getRestartDelayMs)(lastRestartAt, RESTART_MIN_INTERVAL_MS);
            const doRestart = () => {
                lastRestartAt = Date.now();
                run()
                    .then(() => scheduleRestart())
                    .catch((err) => logger.error('OBS restart failed', err));
            };
            if (delay > 0)
                setTimeout(doRestart, delay);
            else
                doRestart();
        });
    }
    return {
        name: 'OBS',
        async start() {
            await run();
            scheduleRestart();
        },
    };
}
var launch_2 = require("./launch");
Object.defineProperty(exports, "getObsProcess", { enumerable: true, get: function () { return launch_2.getObsProcess; } });
//# sourceMappingURL=index.js.map