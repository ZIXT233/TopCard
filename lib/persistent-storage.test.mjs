import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStorage } from '../desktop/storage.cjs';
import { persistentStorage } from './persistent-storage.ts';

test('desktop writes and deletions survive reopening; quota failures retain the previous value', () => {
  const directory = mkdtempSync(join(tmpdir(), 'topcard-storage-'));
  const file = join(directory, 'preferences.json');
  try {
    const storage = createStorage(file);
    storage('set', 'pi-theme', 'dark');
    storage('set', 'topcard:draft:session', 'unsent');
    const reopened = createStorage(file);
    assert.equal(reopened('get', 'pi-theme').value, 'dark');
    assert.equal(reopened('get', 'topcard:draft:session').value, 'unsent');
    assert.throws(() => reopened('set', 'pi-theme', 'x'.repeat(8 * 1024 * 1024)), /quota/);
    assert.equal(reopened('get', 'pi-theme').value, 'dark');
    reopened('remove', 'topcard:draft:session');
    assert.equal(createStorage(file)('get', 'topcard:draft:session').value, null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('desktop storage takes precedence even when browser storage is inaccessible', () => {
  const storage = { getItem: () => 'dark', setItem() {}, removeItem() {} };
  globalThis.window = { topcardDesktop: { storage }, get localStorage() { throw new Error('blocked'); } };
  try { assert.equal(persistentStorage(), storage); }
  finally { delete globalThis.window; }
});

test('browser and desktop dev retain browser storage', () => {
  const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.window = { localStorage, topcardDesktop: {} };
  try { assert.equal(persistentStorage(), localStorage); }
  finally { delete globalThis.window; }
});
