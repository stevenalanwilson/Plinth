import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { loadIndexTemplate } from './indexTemplate';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'client-dist-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadIndexTemplate', () => {
  it('returns the built client’s index.html', async () => {
    await writeFile(path.join(dir, 'index.html'), '<html><head></head></html>');

    expect(await loadIndexTemplate(dir)).toBe('<html><head></head></html>');
  });

  it('returns null when there is no build, as in development', async () => {
    expect(await loadIndexTemplate(dir)).toBeNull();
    expect(await loadIndexTemplate(path.join(dir, 'missing'))).toBeNull();
  });
});
