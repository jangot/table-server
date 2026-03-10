"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
const LEVEL_ORDER = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
function shouldLog(level, messageLevel) {
    return LEVEL_ORDER[messageLevel] >= LEVEL_ORDER[level];
}
function formatMessage(level, msg, args) {
    const prefix = `[${new Date().toISOString()}] ${level.toUpperCase()}`;
    if (args.length === 0)
        return `${prefix} ${msg}`;
    const rest = args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ');
    return `${prefix} ${msg} ${rest}`;
}
/**
 * Create a logger that outputs only messages at or above the given level.
 * info/debug -> stdout, warn/error -> stderr.
 */
function createLogger(logLevel) {
    return {
        info(msg, ...args) {
            if (shouldLog(logLevel, 'info')) {
                console.log(formatMessage('info', msg, args));
            }
        },
        warn(msg, ...args) {
            if (shouldLog(logLevel, 'warn')) {
                console.warn(formatMessage('warn', msg, args));
            }
        },
        error(msg, ...args) {
            if (shouldLog(logLevel, 'error')) {
                console.error(formatMessage('error', msg, args));
            }
        },
        debug(msg, ...args) {
            if (shouldLog(logLevel, 'debug')) {
                console.log(formatMessage('debug', msg, args));
            }
        },
    };
}
//# sourceMappingURL=index.js.map