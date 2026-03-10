"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnv = validateEnv;
const LOG_LEVELS = ['info', 'warn', 'error', 'debug'];
const CHROME_WINDOW_MODES = [
    'kiosk',
    'app',
    'fullscreen',
    'default',
];
function getEnv(name) {
    return process.env[name];
}
function requireEnv(name) {
    const value = getEnv(name);
    if (value === undefined || value.trim() === '') {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value.trim();
}
function parsePort(name, value) {
    const num = parseInt(value, 10);
    if (Number.isNaN(num) || num < 1 || num > 65535) {
        throw new Error(`Invalid port in ${name}: "${value}" (expected 1-65535)`);
    }
    return num;
}
function parseLogLevel(name, value) {
    const normalized = value.toLowerCase().trim();
    if (!LOG_LEVELS.includes(normalized)) {
        throw new Error(`Invalid ${name}: "${value}" (expected one of: ${LOG_LEVELS.join(', ')})`);
    }
    return normalized;
}
function parseOptionalPort(name, value) {
    if (value === undefined || value.trim() === '')
        return undefined;
    const num = parseInt(value.trim(), 10);
    if (Number.isNaN(num) || num < 1 || num > 65535) {
        throw new Error(`Invalid port in ${name}: "${value}" (expected 1-65535)`);
    }
    return num;
}
function parseOptionalPositiveInt(name, value) {
    if (value === undefined || value.trim() === '')
        return undefined;
    const num = parseInt(value.trim(), 10);
    if (Number.isNaN(num) || num < 1) {
        throw new Error(`Invalid ${name}: "${value}" (expected positive integer)`);
    }
    return num;
}
function parseChromeWindowMode(name, value) {
    if (value === undefined || value.trim() === '')
        return undefined;
    const normalized = value.toLowerCase().trim();
    if (!CHROME_WINDOW_MODES.includes(normalized)) {
        throw new Error(`Invalid ${name}: "${value}" (expected one of: ${CHROME_WINDOW_MODES.join(', ')})`);
    }
    return normalized;
}
/**
 * Read and validate environment variables, return typed config.
 * On validation error: throws Error with a clear message.
 */
function validateEnv() {
    const chromePath = requireEnv('CHROME_PATH');
    const obsPath = requireEnv('OBS_PATH');
    const idlePort = parsePort('IDLE_PORT', requireEnv('IDLE_PORT'));
    const idleViewsPath = requireEnv('IDLE_VIEWS_PATH');
    const logLevel = parseLogLevel('LOG_LEVEL', requireEnv('LOG_LEVEL'));
    const devToolsPort = parseOptionalPort('DEVTOOLS_PORT', getEnv('DEVTOOLS_PORT'));
    const chromeReadyTimeout = parseOptionalPositiveInt('CHROME_READY_TIMEOUT', getEnv('CHROME_READY_TIMEOUT'));
    const obsReadyTimeout = parseOptionalPositiveInt('OBS_READY_TIMEOUT', getEnv('OBS_READY_TIMEOUT'));
    const chromeWindowMode = parseChromeWindowMode('CHROME_WINDOW_MODE', getEnv('CHROME_WINDOW_MODE'));
    return {
        chromePath,
        obsPath,
        idlePort,
        idleViewsPath,
        logLevel,
        devToolsPort,
        chromeReadyTimeout,
        chromeWindowMode: chromeWindowMode ?? 'default',
        obsReadyTimeout,
    };
}
//# sourceMappingURL=validate.js.map