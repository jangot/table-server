import { readFile, writeFile } from 'node:fs/promises';

export async function readLastUrl(filePath: string): Promise<string | null> {
  try {
    const data = await readFile(filePath, 'utf-8');
    return data.trim() || null;
  } catch {
    return null;
  }
}

export async function writeLastUrl(filePath: string, url: string): Promise<void> {
  try {
    await writeFile(filePath, url, 'utf-8');
  } catch (err) {
    console.error('[lastUrlState] Failed to write last URL:', err);
  }
}
