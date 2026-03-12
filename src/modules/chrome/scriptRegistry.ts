import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Logger } from '../logger';

/** Содержимое domains.json: { "hostname": "script.js" } */
export type ScriptMap = Record<string, string>;

/**
 * Загружает JSON мап-файл домен→файл.
 * Возвращает null при отсутствии пути, ошибке чтения или неверном формате.
 */
export function loadScriptMap(mapPath: string | undefined, logger: Logger): ScriptMap | null {
  if (!mapPath || mapPath.trim() === '') return null;
  try {
    const raw = fs.readFileSync(mapPath, 'utf-8');
    const data = JSON.parse(raw);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      logger.warn('Chrome script map: invalid format (expected object)', { mapPath });
      return null;
    }
    // Фильтруем только string-значения
    const result: ScriptMap = {};
    for (const [key, val] of Object.entries(data)) {
      if (typeof val === 'string') result[key] = val;
    }
    return result;
  } catch {
    logger.warn('Chrome script map: failed to read or parse', { mapPath });
    return null;
  }
}

/**
 * По URL ищет домен в мапе, читает соответствующий JS-файл из scriptsDir.
 * Возвращает содержимое скрипта или null (без ошибки).
 */
export function resolveScript(
  url: string,
  scriptsDir: string,
  scriptMap: ScriptMap,
  logger: Logger
): string | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }

  const fileName = scriptMap[hostname];
  if (!fileName) return null;

  // Безопасность: только basename
  const safe = path.basename(fileName);
  if (safe !== fileName || safe === '' || safe.includes('..')) {
    logger.warn('Chrome script map: unsafe filename ignored', { fileName });
    return null;
  }

  const scriptPath = path.join(scriptsDir, safe);
  try {
    return fs.readFileSync(scriptPath, 'utf-8');
  } catch {
    logger.warn('Chrome script: failed to read script file', { scriptPath });
    return null;
  }
}
