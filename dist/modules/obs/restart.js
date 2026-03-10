"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRestartDelayMs = getRestartDelayMs;
exports.shouldThrottleRestart = shouldThrottleRestart;
/**
 * Helpers for throttling OBS restarts (min interval between restarts).
 */
function getRestartDelayMs(lastRestartAt, minIntervalMs) {
    const elapsed = Date.now() - lastRestartAt;
    return Math.max(0, minIntervalMs - elapsed);
}
function shouldThrottleRestart(lastRestartAt, minIntervalMs) {
    return getRestartDelayMs(lastRestartAt, minIntervalMs) > 0;
}
//# sourceMappingURL=restart.js.map