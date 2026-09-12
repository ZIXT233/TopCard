/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync, writeFileSync, renameSync, mkdirSync } = require('node:fs');
const { dirname } = require('node:path');

// Bound synchronous IPC like browser localStorage. Acknowledge writes only
// after atomic persistence, including immediately before the application quits.
function createStorage(file) {
  let values = Object.create(null);
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || Object.values(parsed).some(value => typeof value !== 'string')) throw new Error('Invalid desktop storage');
    values = Object.assign(Object.create(null), parsed);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return (operation, key, value) => {
    if (typeof key !== 'string' || key.length > 2048) throw new Error('Invalid storage key');
    const oldValue = values[key] ?? null;
    if (operation === 'get') return { value: oldValue };
    if (operation !== 'set' && operation !== 'remove') throw new Error('Invalid storage operation');
    if (operation === 'set' && typeof value !== 'string') throw new Error('Invalid storage value');
    const newValue = operation === 'remove' ? null : value;
    if (oldValue === newValue) return { value: null };
    const next = Object.assign(Object.create(null), values);
    if (newValue === null) delete next[key]; else next[key] = newValue;
    const serialized = JSON.stringify(next);
    if (Buffer.byteLength(serialized) > 8 * 1024 * 1024) throw new Error('Desktop storage quota exceeded');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file + '.tmp', serialized, { mode: 0o600 });
    renameSync(file + '.tmp', file);
    values = next;
    return { value: null, change: { key, oldValue, newValue } };
  };
}
module.exports = { createStorage };
