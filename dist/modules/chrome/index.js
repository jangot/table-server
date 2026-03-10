"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForDevTools = exports.writeLastUrl = exports.readLastUrl = exports.getChromeProcess = exports.buildChromeArgs = void 0;
exports.createChromeModule = createChromeModule;
exports.navigateToUrl = navigateToUrl;
const args_1 = require("./args");
const cdp_1 = require("./cdp");
const launch_1 = require("./launch");
const launch_2 = require("./launch");
function createChromeModule(config, logger) {
    return {
        name: 'Chrome',
        async start() {
            const port = config.devToolsPort ?? 9222;
            const timeoutMs = config.chromeReadyTimeout ?? 30000;
            const idleUrl = `http://localhost:${config.idlePort}/`;
            const args = (0, args_1.buildChromeArgs)(config, port, idleUrl);
            await (0, launch_2.launchChrome)(config.chromePath, args, port, timeoutMs, logger);
        },
    };
}
var args_2 = require("./args");
Object.defineProperty(exports, "buildChromeArgs", { enumerable: true, get: function () { return args_2.buildChromeArgs; } });
var launch_3 = require("./launch");
Object.defineProperty(exports, "getChromeProcess", { enumerable: true, get: function () { return launch_3.getChromeProcess; } });
var lastUrlState_1 = require("./lastUrlState");
Object.defineProperty(exports, "readLastUrl", { enumerable: true, get: function () { return lastUrlState_1.readLastUrl; } });
Object.defineProperty(exports, "writeLastUrl", { enumerable: true, get: function () { return lastUrlState_1.writeLastUrl; } });
var waitDevTools_1 = require("./waitDevTools");
Object.defineProperty(exports, "waitForDevTools", { enumerable: true, get: function () { return waitDevTools_1.waitForDevTools; } });
async function navigateToUrl(url, deps) {
    if ((0, launch_1.getChromeProcess)() == null) {
        throw new Error('Chrome is not running');
    }
    const port = deps.config.devToolsPort ?? 9222;
    const statePath = deps.config.lastUrlStatePath ?? './.last-url';
    await (0, cdp_1.navigateToUrl)(port, url, statePath, deps.logger);
}
//# sourceMappingURL=index.js.map