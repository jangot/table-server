"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChromeProcess = exports.waitForDevTools = exports.buildChromeArgs = void 0;
exports.createChromeModule = createChromeModule;
const args_1 = require("./args");
const launch_1 = require("./launch");
function createChromeModule(config, logger) {
    return {
        name: 'Chrome',
        async start() {
            const port = config.devToolsPort ?? 9222;
            const timeoutMs = config.chromeReadyTimeout ?? 30000;
            const idleUrl = `http://localhost:${config.idlePort}/`;
            const args = (0, args_1.buildChromeArgs)(config, port, idleUrl);
            await (0, launch_1.launchChrome)(config.chromePath, args, port, timeoutMs, logger);
        },
    };
}
var args_2 = require("./args");
Object.defineProperty(exports, "buildChromeArgs", { enumerable: true, get: function () { return args_2.buildChromeArgs; } });
var waitDevTools_1 = require("./waitDevTools");
Object.defineProperty(exports, "waitForDevTools", { enumerable: true, get: function () { return waitDevTools_1.waitForDevTools; } });
var launch_2 = require("./launch");
Object.defineProperty(exports, "getChromeProcess", { enumerable: true, get: function () { return launch_2.getChromeProcess; } });
//# sourceMappingURL=index.js.map