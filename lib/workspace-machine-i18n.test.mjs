import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const { enLocale } = await jiti.import('./i18n/messages/en.ts');
const { zhCNLocale } = await jiti.import('./i18n/messages/zh-CN.ts');
const { zhTWLocale } = await jiti.import('./i18n/messages/zh-TW.ts');
const { MACHINE_ERROR_CODES, machineErrorKey } = await jiti.import('./workspace-machine-errors.ts');
test('machine UI and error codes have complete English, Simplified and Traditional translations', () => {
  const keys = Object.keys(enLocale.messages).filter(key => key.startsWith('machines.'));
  assert.ok(keys.length > 60);
  for (const locale of [enLocale, zhCNLocale, zhTWLocale]) {
    assert.deepEqual(Object.keys(locale.messages).filter(key => key.startsWith('machines.')).sort(), [...keys].sort());
    for (const code of MACHINE_ERROR_CODES) assert.ok(locale.messages[machineErrorKey({ code })]);
  }
  assert.equal(machineErrorKey(new Error('ssh -S /private/path')), 'machines.error.CONNECTION_FAILED');
});
