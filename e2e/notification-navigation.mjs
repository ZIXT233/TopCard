import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let archives = 0;
  let queue = { version: 1, revision: 1, sortMode: 'score', order: ['a', 'b', 'c'], cards: ['a', 'b', 'c'].map(id => ({ id, priorityWeight: id === 'a' ? 100 : 0, cwd: '/tmp/test', phase: 'attention', createdAt: 1, session: { id, name: id, cwd: '/tmp/test', messageCount: 0, modified: '2026-09-11T00:00:00Z' } })) };
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
  await page.goto('http://127.0.0.1:30141/?session=b');
  await page.waitForFunction(() => document.querySelector('.cq-deck-layer[aria-hidden="false"]')?.getAttribute('data-transfer-id') === 'b');
  await page.locator('.cq-stage').hover();
  await page.mouse.wheel(-600, 0);
  await page.waitForFunction(() => document.querySelector('.cq-deck-layer[aria-hidden="false"]')?.getAttribute('data-transfer-id') === 'a');
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'notification-click', url: location.href } })));
  await page.waitForFunction(() => document.querySelector('.cq-deck-layer[aria-hidden="false"]')?.getAttribute('data-transfer-id') === 'b');
  assert.equal(archives, 0);
  console.log('PASS: notification URL selects a lower-ranked card; repeated notification click reselects it');
} finally { await browser.close(); }
