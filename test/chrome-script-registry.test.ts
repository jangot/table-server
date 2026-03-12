import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { loadScriptMap, resolveScript } from '../src/modules/chrome/scriptRegistry';

function makeLogger() {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    warn: (...args: unknown[]) => calls.push({ method: 'warn', args }),
    info: (...args: unknown[]) => calls.push({ method: 'info', args }),
    error: (...args: unknown[]) => calls.push({ method: 'error', args }),
    debug: (...args: unknown[]) => calls.push({ method: 'debug', args }),
    getCalls: () => calls,
    hasWarn: () => calls.some((c) => c.method === 'warn'),
  };
}

describe('loadScriptMap', () => {
  let tmpDir: string;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'script-registry-'));
    logger = makeLogger();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads valid map file', () => {
    const mapPath = path.join(tmpDir, 'domains.json');
    fs.writeFileSync(mapPath, JSON.stringify({ 'example.com': 'login.js' }));
    const result = loadScriptMap(mapPath, logger);
    assert.deepStrictEqual(result, { 'example.com': 'login.js' });
    assert.strictEqual(logger.hasWarn(), false);
  });

  it('returns null for undefined path', () => {
    assert.strictEqual(loadScriptMap(undefined, logger), null);
    assert.strictEqual(logger.hasWarn(), false);
  });

  it('returns null and warns for missing file', () => {
    assert.strictEqual(loadScriptMap('/nonexistent/map.json', logger), null);
    assert.strictEqual(logger.hasWarn(), true);
  });

  it('returns null and warns for invalid JSON', () => {
    const mapPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(mapPath, 'not json');
    assert.strictEqual(loadScriptMap(mapPath, logger), null);
    assert.strictEqual(logger.hasWarn(), true);
  });

  it('returns null and warns when JSON is an array', () => {
    const mapPath = path.join(tmpDir, 'arr.json');
    fs.writeFileSync(mapPath, '[]');
    assert.strictEqual(loadScriptMap(mapPath, logger), null);
    assert.strictEqual(logger.hasWarn(), true);
  });
});

describe('resolveScript', () => {
  let tmpDir: string;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scripts-'));
    logger = makeLogger();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns script content for matching domain', () => {
    const scriptPath = path.join(tmpDir, 'login.js');
    fs.writeFileSync(scriptPath, 'console.log("hello")');
    const result = resolveScript(
      'https://example.com/page',
      tmpDir,
      { 'example.com': 'login.js' },
      logger
    );
    assert.strictEqual(result, 'console.log("hello")');
  });

  it('returns null when domain not in map', () => {
    assert.strictEqual(resolveScript('https://other.com/', tmpDir, {}, logger), null);
  });

  it('returns null for invalid URL', () => {
    assert.strictEqual(resolveScript('not-a-url', tmpDir, { '': 'x.js' }, logger), null);
  });

  it('returns null and warns for unsafe filename with path traversal', () => {
    const result = resolveScript(
      'https://evil.com/',
      tmpDir,
      { 'evil.com': '../secret.js' },
      logger
    );
    assert.strictEqual(result, null);
    assert.strictEqual(logger.hasWarn(), true);
  });

  it('returns null and warns when script file not found', () => {
    const result = resolveScript(
      'https://example.com/',
      tmpDir,
      { 'example.com': 'missing.js' },
      logger
    );
    assert.strictEqual(result, null);
    assert.strictEqual(logger.hasWarn(), true);
  });
});
