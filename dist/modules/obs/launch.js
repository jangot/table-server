"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getObsProcess = getObsProcess;
exports.launchObs = launchObs;
const node_child_process_1 = require("node:child_process");
const ready_1 = require("./ready");
let obsProcess = null;
function getObsProcess() {
    return obsProcess;
}
/**
 * Launch OBS process, wait for ready (process alive for one interval), then resolve.
 * On spawn error or timeout: log, reject, and kill process on ready timeout.
 */
async function launchObs(obsPath, args, timeoutMs, logger) {
    obsProcess = (0, node_child_process_1.spawn)(obsPath, args, { stdio: 'ignore', shell: false });
    const proc = obsProcess;
    return new Promise((resolve, reject) => {
        proc.on('error', (err) => {
            obsProcess = null;
            logger.error('OBS spawn error', err);
            reject(err);
        });
        proc.on('spawn', () => {
            (0, ready_1.waitForObsReady)(proc, timeoutMs)
                .then(() => {
                logger.info('OBS ready');
                resolve();
            })
                .catch((err) => {
                logger.error('OBS not ready', err);
                proc.kill('SIGTERM');
                obsProcess = null;
                reject(err);
            });
        });
    });
}
//# sourceMappingURL=launch.js.map