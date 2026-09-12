import { _electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const executablePath = process.env.TOPCARD_DESKTOP_EXECUTABLE;
const host = process.env.TOPCARD_TEST_SSH_HOST;
const cwd = process.env.TOPCARD_TEST_SSH_CWD;
if (!executablePath || !host || !cwd) throw new Error('Set TOPCARD_DESKTOP_EXECUTABLE, TOPCARD_TEST_SSH_HOST and TOPCARD_TEST_SSH_CWD');
const data = await mkdtemp(join(tmpdir(), 'topcard-desktop-ssh-'));
await writeFile(join(data, 'notification-setup-requested'), '1');
let app;
try {
  app = await _electron.launch({ executablePath, args: [], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', TOPCARD_DESKTOP_USER_DATA: data } });
  app.context().setDefaultTimeout(20000);
  const page = await app.firstWindow();
  await page.waitForURL(/127\.0\.0\.1/);
  const api = (path, body, method = 'POST') => page.evaluate(async ({ path, body, method }) => {
    const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }, { path, body, method });
  const queue = await api('/api/card-queue', { action: 'workspace_create', kind: 'ssh', sshHost: host, cwd, name: 'SSH Codex regression', createCard: true });
  const id = queue.cards.find(card => card.phase === 'draft').id;
  const launched = await api('/api/card-queue', { action: 'harness_start', id, kind: 'codex' });
  const harness = launched.cards.find(card => card.id === id).harness;
  assert.match(harness.version, /codex-cli/);
  try {
    await page.evaluate(id => {
      window.sshTestOutput = '';
      window.sshTestEvents = new EventSource(`/api/terminal/${id}/events`);
      window.sshTestEvents.onmessage = event => { window.sshTestOutput += event.data; };
    }, harness.terminalId);
    await page.waitForFunction(() => /OpenAI Codex|Welcome to Codex|trust|Trust/.test(window.sshTestOutput));
    assert.equal((await api(`/api/terminal/${harness.terminalId}`, null, 'GET')).readOnly, false);
    console.log(`PASS packaged remote Codex startup via real SSH: ${harness.version}`);
  } finally {
    await page.evaluate(() => window.sshTestEvents?.close());
    await api(`/api/terminal/${harness.terminalId}`, null, 'DELETE');
  }
} finally {
  if (app) await app.close();
  await rm(data, { recursive: true, force: true });
}
