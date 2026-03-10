"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startIdleServer = startIdleServer;
const express_1 = __importDefault(require("express"));
/**
 * Start the idle HTTP server (Express + EJS). Resolves when listening.
 */
function startIdleServer(config) {
    const app = (0, express_1.default)();
    app.set('views', config.idleViewsPath);
    app.set('view engine', 'ejs');
    app.get('/', (_req, res) => res.render('idle'));
    return new Promise((resolve) => {
        const server = app.listen(config.idlePort, () => resolve(server));
    });
}
//# sourceMappingURL=index.js.map