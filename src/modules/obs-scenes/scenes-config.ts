/**
 * Synchronous load and parse of scenes config JSON.
 * Returns null on missing path, empty path, file/parse/format errors (no throw).
 */

import * as fs from 'node:fs';
import type { SceneConfigEntry } from './types';

export function loadScenesConfigSync(path: string | undefined): SceneConfigEntry[] | null {
  if (path === undefined || path.trim() === '') return null;
  try {
    const raw = fs.readFileSync(path, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    const result: SceneConfigEntry[] = [];
    for (const item of data) {
      if (item != null && typeof item === 'object' && typeof item.name === 'string') {
        const entry: SceneConfigEntry = { name: item.name };
        if (typeof item.title === 'string') entry.title = item.title;
        if (typeof item.type === 'string') entry.type = item.type;
        if (typeof item.enabled === 'boolean') entry.enabled = item.enabled;
        result.push(entry);
      }
    }
    return result;
  } catch {
    return null;
  }
}
