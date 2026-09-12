import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let archives = 0;
  let queue = { version: 1, revision: 1, sortMode: 'fifo', order: ['a', 'b', 'c'], cards: ['a', 'b', 'c'].map(id => ({ id, cwd: '/tmp/test', phase: 'attention', createdAt: 1, session: { id, name: id, cwd: '/tmp/test', messageCount: 0, modified: '2026-09-11T00:00:00Z' } })) };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path === '/api/card-queue') {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (body.action === 'archive') {
          archives++;
          queue = { ...queue, revision: queue.revision + 1, order: queue.order.filter(id => id !== body.id), cards: queue.cards.map(card => card.id === body.id ? { ...card, archivedAt: Date.now() } : card) };
        }
      }
      data = queue;
    } else if (path === '/api/models') data = { models: [], modelList: [] };
    else if (path.startsWith('/api/sessions/')) data = { context: { messages: [], entryIds: [] }, tree: [], leafId: null };
    await route.fulfill({ json: data });
  });
  await page.goto('http://127.0.0.1:30141');
  const archive = () => page.locator('.cq-deck-layer[aria-hidden="false"] .cq-action-archive').first().click();
  const dialog = page.locator('.cq-archive-confirm');
  await archive();
  await dialog.getByRole('checkbox').check();
  await dialog.locator('.cq-confirm-actions > button').first().click();
  await archive();
  assert.equal(await dialog.getByRole('checkbox').isChecked(), false, 'cancel does not save the preference');
  await dialog.getByRole('checkbox').check();
  await dialog.locator('.cq-confirm-actions > button').last().click();
  await dialog.waitFor({ state: 'hidden' });
  await archive();
  await page.waitForFunction(() => document.querySelector('.cq-deck-layer[aria-hidden="false"]')?.getAttribute('data-transfer-id') === 'c');
  assert.equal(archives, 2);
  assert.equal(await dialog.count(), 0);
  await page.reload();
  await archive();
  await dialog.waitFor();
  assert.equal(archives, 2, 'reload restores confirmation');
  console.log('PASS: cancel, current-page skip, and reload reset');
} finally { await browser.close(); }
