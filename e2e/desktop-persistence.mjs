import { _electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';

const data = await mkdtemp(join(tmpdir(), 'topcard-persistence-'));
await writeFile(join(data, 'notification-setup-requested'), '1');
const launch = () => _electron.launch({
  ...(process.env.TOPCARD_DESKTOP_EXECUTABLE
    ? { executablePath: process.env.TOPCARD_DESKTOP_EXECUTABLE, args: [] }
    : { args: [resolve('.')] }),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '', TOPCARD_DESKTOP_USER_DATA: data },
});
let app;
let reservedPort;
try {
  app = await launch();
  app.context().setDefaultTimeout(15000);
  let page = await app.firstWindow();
  await page.waitForURL(/127\.0\.0\.1/);
  const firstOrigin = new URL(page.url()).origin;
  const queue = await page.evaluate(async cwd => {
    const response = await fetch('/api/card-queue', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'workspace_create', kind: 'local', name: 'Persistence test', cwd, createCard: true }) });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }, data);
  const cardId = queue.cards.find(card => card.phase === 'draft').id;
  const openDraft = async () => {
    await page.locator('.cq-new').click();
    await page.getByText('Persistence test', { exact: true }).click();
  };
  await page.reload();
  await openDraft();
  const input = () => page.locator(`[data-card-id="${cardId}"] textarea`).first();
  await input().fill('Unsent draft survives a different backend port').catch(async error => { console.log(await page.locator('body').innerText()); throw error; });
  await page.waitForFunction(id => window.topcardDesktop.storage.getItem(`topcard:draft:card:${id}`)?.includes('Unsent draft'), cardId);
  await page.evaluate(() => {
    const storage = window.topcardDesktop.storage;
    storage.setItem('pi-theme', 'dark');
    storage.setItem('pi-chat-content-font-size', '19');
    storage.setItem('topcard:sound-enabled', 'false');
  });
  await app.close(); app = null;
  // Occupy the old port so the second launch cannot accidentally reuse its origin.
  reservedPort = net.createServer();
  await new Promise((resolve, reject) => {
    reservedPort.once('error', reject);
    reservedPort.listen(Number(new URL(firstOrigin).port), '127.0.0.1', resolve);
  });
  app = await launch();
  app.context().setDefaultTimeout(15000);
  page = await app.firstWindow();
  await page.waitForURL(/127\.0\.0\.1/);
  assert.notEqual(new URL(page.url()).origin, firstOrigin);
  await openDraft();
  await input().waitFor();
  assert.equal(await input().inputValue(), 'Unsent draft survives a different backend port');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--chat-content-font-size') === '19px');
  assert.equal(await page.evaluate(() => window.topcardDesktop.storage.getItem('topcard:sound-enabled')), 'false');
  const opened = app.waitForEvent('window');
  await page.evaluate(id => window.topcardDesktop.openCard(id), cardId);
  const child = await opened;
  await child.waitForURL(new RegExp(cardId));
  await child.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await child.evaluate(() => window.topcardDesktop.storage.setItem('pi-theme', 'light'));
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await child.close();
  await page.evaluate(id => window.topcardDesktop.storage.removeItem(`topcard:draft:card:${id}`), cardId);
  await page.reload();
  await openDraft();
  await input().waitFor();
  assert.equal(await input().inputValue(), '');
  console.log('PASS real composer draft, theme, font size and sound survive changed origin; cross-window theme sync and draft deletion');
} finally {
  if (app) await app.close();
  if (reservedPort?.listening) await new Promise(resolve => reservedPort.close(resolve));
  await rm(data, { recursive: true, force: true });
}
