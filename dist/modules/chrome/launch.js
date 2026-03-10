"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChromeProcess = getChromeProcess;
exports.killChromeProcess = killChromeProcess;
exports.launchChrome = launchChrome;
const node_child_process_1 = require("node:child_process");
const waitDevTools_1 = require("./waitDevTools");
/** Set by launchChrome for use in task 003 (CDP / close). */
let chromeProcess = null;
function getChromeProcess() {
    return chromeProcess;
}
/**
 * Kill the current Chrome process if any. Sets chromeProcess to null.
 * Use before re-launching Chrome (e.g. restart).
 */
function killChromeProcess() {
    if (chromeProcess != null) {
        chromeProcess.kill('SIGTERM');
        chromeProcess = null;
    }
}
/**
 * Launch Chrome with given args, wait for DevTools to be ready, then resolve.
 * On spawn error or timeout: log, reject, and ensure process is not left running on fatal spawn error.
 */
async function launchChrome(chromePath, args, port, timeoutMs, logger) {
    chromeProcess = (0, node_child_process_1.spawn)(chromePath, args, { stdio: 'ignore', shell: false });
    const proc = chromeProcess;
    return new Promise((resolve, reject) => {
        proc.on('error', (err) => {
            chromeProcess = null;
            logger.error('Chrome spawn error', err);
            reject(err);
        });
        proc.on('spawn', () => {
            (0, waitDevTools_1.waitForDevTools)(port, timeoutMs)
                .then(() => {
                logger.info('Chrome DevTools ready');
                resolve();
            })
                .catch((err) => {
                logger.error('Chrome DevTools not ready', err);
                proc.kill('SIGTERM');
                chromeProcess = null;
                reject(err);
            });
        });
    });
}
//# sourceMappingURL=launch.js.map