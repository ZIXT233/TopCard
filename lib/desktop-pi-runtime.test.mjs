import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restorePiRuntime } from '../desktop/pi-runtime-assets.mjs';

test('desktop restores dynamic Pi assets in root and nested SDK dependency instances', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-runtime-assets-'));
  const source = join(root, 'source'), runtime = join(root, 'runtime');
  const packages = [
    ['node_modules/@earendil-works/pi-coding-agent', 'modes/interactive/theme/dark.json'],
    ['node_modules/@earendil-works/pi-ai', 'auth/oauth/openai-codex.js'],
    ['node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai', 'auth/oauth/openai-codex.js'],
  ];
  try {
    for (const [pkg, asset] of packages) {
      await mkdir(join(source, pkg, 'dist', asset, '..'), { recursive: true });
      await writeFile(join(source, pkg, 'dist', asset), 'dynamic runtime asset');
      await mkdir(join(runtime, pkg, 'dist'), { recursive: true });
      await writeFile(join(runtime, pkg, 'dist/index.js'), 'traced entry');
    }
    await restorePiRuntime(source, runtime);
    for (const [pkg, asset] of packages) {
      assert.equal(await readFile(join(runtime, pkg, 'dist', asset), 'utf8'), 'dynamic runtime asset');
      assert.equal(await readFile(join(runtime, pkg, 'dist/index.js'), 'utf8'), 'traced entry');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
