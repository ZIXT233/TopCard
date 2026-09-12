// Mock every API: exercise animation and lifecycle without modifying real sessions.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(() => {
    window.renderCounts = {};
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, renderers: new Map(),
      inject(renderer) { this.renderers.set(1, renderer); return 1; },
      onCommitFiberRoot(_id, root) {
        const visit = fiber => {
          if (!fiber) return;
          const name = fiber.type?.name || fiber.type?.type?.name;
          if ((fiber.flags & 1) && ['CardQueueShell', 'DeckContent', 'SessionCard', 'CardDeck'].includes(name))
            window.renderCounts[name] = (window.renderCounts[name] || 0) + 1;
          visit(fiber.child); visit(fiber.sibling);
        };
        visit(root.current);
      },
      onCommitFiberUnmount() {},
    };
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const requests = [];
  const cards = Array.from({ length: 30 }, (_, i) => ({
    id: `c${i}`, cwd: '/tmp/queue-lifecycle', phase: 'attention', createdAt: i + 1,
    session: { id: `s${i}`, name: `Card ${i}`, cwd: '/tmp/queue-lifecycle', firstMessage: 'Test', messageCount: 0, modified: '2026-09-11T00:00:00Z' },
  }));
  let queue = { version: 1, revision: 1, sortMode: 'fifo', order: cards.map(c => c.id), cards };
  let releaseSlow;
  const slow = new Promise(resolve => { releaseSlow = resolve; });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    let data = {};
    if (path === '/api/card-queue') data = queue;
    else if (path === '/api/models') data = { models: [], modelList: [], defaultModel: null };
    else if (path.endsWith('/state')) data = { running: false };
    else if (path.startsWith('/api/sessions/')) {
      if (path === '/api/sessions/s1') await Promise.race([slow, new Promise(resolve => setTimeout(resolve, 10000))]);
      data = { context: { messages: [], entryIds: [] }, tree: [], leafId: null };
    } else if (path === '/api/agent/running') data = { ids: [] };
    else if (path.startsWith('/api/agent/')) data = { running: false };
    else if (path === '/api/home') data = { home: '/tmp' };
    await route.fulfill({ json: data }).catch(() => {});
  });
  await page.goto(process.env.E2E_BASE_URL || 'http://127.0.0.1:30141', {waitUntil:'domcontentloaded'});
  page.setDefaultTimeout(10000);
  await page.locator('[data-card-id="c0"] textarea').waitFor().catch(async error => { console.error({errors,requests,body:(await page.locator('body').innerText()).slice(0,2000)}); throw error; });
  const mounted = () => page.locator('.cq-deck-layer .cq-chat').count();
  assert.equal(await mounted(), 2, 'only near cards load conversations');
  // Cross the preview-window boundary once before measuring fractional frames.
  await page.evaluate(() => {
    const scroller = document.querySelector('.cq-deck-scroller');
    scroller.classList.add('cq-pointer-drag');
    scroller.scrollLeft = 3;
  });
  await page.waitForTimeout(150);
  const before = await page.evaluate(() => ({ ...window.renderCounts }));
  // Hold snapping off just as the mouse drag does; remain within the same card.
  await page.evaluate(async () => {
    const scroller = document.querySelector('.cq-deck-scroller');
    scroller.classList.add('cq-pointer-drag');
    for (let x = 2; x <= 20; x++) {
      scroller.scrollLeft = x * 3;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    }
  });
  const after = await page.evaluate(() => ({ ...window.renderCounts }));
  assert.ok(after.CardDeck > before.CardDeck, 'animation frames actually rendered');
  assert.equal(after.CardQueueShell, before.CardQueueShell, 'fractional frames do not render shell');
  assert.equal(after.DeckContent, before.DeckContent, 'fractional frames do not render chat content');
  await page.evaluate(() => {
    const scroller = document.querySelector('.cq-deck-scroller');
    const width = parseFloat(document.querySelector('.cq-deck-sticky').style.width);
    scroller.scrollLeft = Math.max(320, width * .85) * 15;
  });
  await page.waitForFunction(() => document.querySelector('.cq-deck-layer[aria-hidden="false"]')?.dataset.transferId === 'c15');
  assert.ok(await mounted() <= 4, 'conversation mounts stay bounded with thirty cards');
  releaseSlow();
  await page.waitForTimeout(250);
  assert.equal(requests.includes('/api/sessions/s1/state'), false, 'unmounted slow load cannot launch follow-up state requests');
  // Simulate visibility transitions, including rapid repeated foreground events.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const queueReads = () => requests.filter(path => path === '/api/card-queue').length;
  const hiddenReads = queueReads();
  await page.waitForTimeout(1500);
  assert.equal(queueReads(), hiddenReads, 'hidden tabs stop polling');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    for (let i = 0; i < 5; i++) document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(150);
  assert.equal(queueReads(), hiddenReads + 1, 'foreground reconciliations share one request');
  await page.waitForTimeout(1300);
  assert.equal(queueReads(), hiddenReads + 2, 'only one polling chain resumes');
  // A score tick must still happen when every subsequent poll is identical.
  queue = { ...queue, revision: 2, sortMode: 'score', cards: cards.map(card => ({ ...card, readyAt: Date.now() - 58_000 })) };
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const waitScore = page.locator('.cq-deck-layer[aria-hidden="false"] .cq-score-wait b');
  await waitScore.waitFor();
  assert.equal(await waitScore.innerText(), '0');
  await page.waitForFunction(() => document.querySelector('.cq-deck-layer[aria-hidden="false"] .cq-score-wait b')?.textContent === '1');
  // Cancellation must clean up cloned transfer nodes, not wait for completion.
  queue = { ...queue, revision: 3, cards: queue.cards.map(card => card.id === 'c15' ? { ...card, phase: 'working' } : card), order: queue.order.filter(id => id !== 'c15') };
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.locator('.cq-transfer-flight').waitFor({state:'attached'});
  await page.evaluate(() => document.querySelectorAll('.cq-transfer-flight').forEach(el => el.getAnimations().forEach(animation => animation.cancel())));
  await page.waitForFunction(() => !document.querySelector('.cq-transfer-flight'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', fractionalFrameRenders: Object.fromEntries(Object.keys(after).map(key => [key, after[key] - (before[key] || 0)])), mountedConversations: await mounted(), checks: ['bounded mounts', 'cancel slow loads', 'hidden polling', 'single resume chain', 'independent score clock', 'cancel transfer cleanup'] }));
} finally { await browser.close(); }
