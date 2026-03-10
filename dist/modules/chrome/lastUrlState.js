"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readLastUrl = readLastUrl;
exports.writeLastUrl = writeLastUrl;
const promises_1 = require("node:fs/promises");
async function readLastUrl(filePath) {
    try {
        const data = await (0, promises_1.readFile)(filePath, 'utf-8');
        return data.trim() || null;
    }
    catch {
        return null;
    }
}
async function writeLastUrl(filePath, url) {
    try {
        await (0, promises_1.writeFile)(filePath, url, 'utf-8');
    }
    catch (err) {
        console.error('[lastUrlState] Failed to write last URL:', err);
    }
}
//# sourceMappingURL=lastUrlState.js.map