import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadScenesConfigSync } from '../src/modules/obs-scenes/scenes-config';

describe('loadScenesConfigSync', () => {
  it('returns null when path is undefined', () => {
    assert.strictEqual(loadScenesConfigSync(undefined), null);
  });

  it('returns null when path is empty string', () => {
    assert.strictEqual(loadScenesConfigSync(''), null);
  });

  it('returns null when path is whitespace-only', () => {
    assert.strictEqual(loadScenesConfigSync('   '), null);
  });

  it('returns null when file does not exist', () => {
    const p = path.join(os.tmpdir(), `nonexistent-${Date.now()}.json`);
    assert.strictEqual(loadScenesConfigSync(p), null);
  });

  it('returns null when JSON is invalid', () => {
    const tmp = path.join(os.tmpdir(), `scenes-invalid-${Date.now()}.json`);
    try {
      fs.writeFileSync(tmp, 'not json {');
      assert.strictEqual(loadScenesConfigSync(tmp), null);
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  });

  it('returns null when root is not an array', () => {
    const tmp = path.join(os.tmpdir(), `scenes-object-${Date.now()}.json`);
    try {
      fs.writeFileSync(tmp, '{"scenes": []}');
      assert.strictEqual(loadScenesConfigSync(tmp), null);
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  });

  it('returns array of entries for valid JSON array with name/title/type/enabled', () => {
    const tmp = path.join(os.tmpdir(), `scenes-valid-${Date.now()}.json`);
    const content = JSON.stringify([
      { name: 'chrome', title: 'Chrome', type: 'working', enabled: true },
      { name: 'intro', title: 'Intro', enabled: false },
      { name: 'minimal' },
    ]);
    try {
      fs.writeFileSync(tmp, content);
      const result = loadScenesConfigSync(tmp);
      assert.ok(Array.isArray(result));
      assert.strictEqual(result!.length, 3);
      assert.deepStrictEqual(result![0], { name: 'chrome', title: 'Chrome', type: 'working', enabled: true });
      assert.deepStrictEqual(result![1], { name: 'intro', title: 'Intro', enabled: false });
      assert.deepStrictEqual(result![2], { name: 'minimal' });
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  });

  it('skips array elements without name or non-object', () => {
    const tmp = path.join(os.tmpdir(), `scenes-skip-${Date.now()}.json`);
    const content = JSON.stringify([
      { name: 'valid' },
      { title: 'no name' },
      null,
      'string',
      42,
    ]);
    try {
      fs.writeFileSync(tmp, content);
      const result = loadScenesConfigSync(tmp);
      assert.ok(Array.isArray(result));
      assert.strictEqual(result!.length, 1);
      assert.deepStrictEqual(result![0], { name: 'valid' });
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  });
});
