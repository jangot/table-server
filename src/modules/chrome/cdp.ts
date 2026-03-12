import { connect } from 'puppeteer-core';
import type { Logger } from '../logger';
import { writeLastUrl } from './lastUrlState';
import type { ScriptMap } from './scriptRegistry';
import { resolveScript } from './scriptRegistry';

export async function navigateToUrl(
  port: number,
  url: string,
  statePath: string,
  logger: Logger,
  options?: {
    timeoutMs?: number;
    viewport?: { width: number; height: number; deviceScaleFactor?: number };
    scriptRegistry?: { scriptsDir: string; scriptMap: ScriptMap };
  }
): Promise<void> {
  const browser = await connect({ browserURL: `http://127.0.0.1:${port}` });
  try {
    const pages = await browser.pages();
    const page = pages[0] ?? (await browser.newPage());
    if (options?.viewport) {
      await page.setViewport({
        width: options.viewport.width,
        height: options.viewport.height,
        deviceScaleFactor: options.viewport.deviceScaleFactor ?? 1,
      });
    }
    const timeout = options?.timeoutMs ?? 30000;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

    // Выполнить скрипт для домена, если зарегистрирован
    if (options?.scriptRegistry) {
      const { scriptsDir, scriptMap } = options.scriptRegistry;
      const script = resolveScript(url, scriptsDir, scriptMap, logger);
      if (script) {
        await page.evaluate(script);
        logger.info('Chrome script executed for URL', { url });
      }
    }

    await writeLastUrl(statePath, url);
    logger.info('Navigated to URL', { url });
  } finally {
    await browser.disconnect();
  }
}
