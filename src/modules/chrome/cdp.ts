import { connect } from 'puppeteer-core';
import type { Logger } from '../logger';
import { writeLastUrl } from './lastUrlState';

export async function navigateToUrl(
  port: number,
  url: string,
  statePath: string,
  logger: Logger,
  options?: { timeoutMs?: number }
): Promise<void> {
  const browser = await connect({ browserURL: `http://127.0.0.1:${port}` });
  try {
    const pages = await browser.pages();
    const page = pages[0] ?? (await browser.newPage());
    const timeout = options?.timeoutMs ?? 30000;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await writeLastUrl(statePath, url);
    logger.info('Navigated to URL', { url });
  } finally {
    await browser.disconnect();
  }
}
