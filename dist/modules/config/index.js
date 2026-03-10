"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnv = void 0;
exports.getConfig = getConfig;
exports.resetConfigForTesting = resetConfigForTesting;
const validate_1 = require("./validate");
let cached = null;
/**
 * Return validated config from environment (cached after first call).
 * On validation error: logs to stderr and process.exit(1).
 */
function getConfig() {
    if (cached === null) {
        try {
            cached = (0, validate_1.validateEnv)();
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(msg);
            process.exit(1);
        }
    }
    return cached;
}
/**
 * Reset cached config (for tests only). Next getConfig() will re-validate env.
 */
function resetConfigForTesting() {
    cached = null;
}
var validate_2 = require("./validate");
Object.defineProperty(exports, "validateEnv", { enumerable: true, get: function () { return validate_2.validateEnv; } });
//# sourceMappingURL=index.js.map