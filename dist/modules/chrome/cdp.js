"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.navigateToUrl = navigateToUrl;
const puppeteer_core_1 = require("puppeteer-core");
const lastUrlState_1 = require("./lastUrlState");
async function navigateToUrl(port, url, statePath, logger, options) {
    const browser = await (0, puppeteer_core_1.connect)({ browserURL: `http://127.0.0.1:${port}` });
    try {
        const pages = await browser.pages();
        const page = pages[0] ?? (await browser.newPage());
        const timeout = options?.timeoutMs ?? 30000;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
        await (0, lastUrlState_1.writeLastUrl)(statePath, url);
        logger.info('Navigated to URL', { url });
    }
    finally {
        await browser.disconnect();
    }
}
//# sourceMappingURL=cdp.js.map