"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildObsArgs = buildObsArgs;
/**
 * Build CLI arguments for OBS (path is passed separately to spawn).
 * Uses only config values, no user input substitution.
 */
function buildObsArgs(config) {
    const args = [];
    if (config.obsProfilePath) {
        args.push(`--profile=${config.obsProfilePath}`);
    }
    return args;
}
//# sourceMappingURL=args.js.map