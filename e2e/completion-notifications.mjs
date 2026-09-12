import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await page.addInitScript(() => {
    window.notices = [];
    window.tones = 0;
    window.AudioContext = class {
      state = 'running'; currentTime = 0; destination = {};
      createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() { window.tones++; }, stop() {} }; }
      createGain() { return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
    };
    class MockNotification {
      static permission = 'default';
      static async requestPermission() { this.permission = 'granted'; return 'granted'; }
      constructor(title, options) { window.notices.push({ title, ...options }); }
      close() {}
    }
    window.Notification = MockNotification;
  });
  let queue = { version: 1, revision: 1, order: [], cards: [{ id: 'c1', cwd: '/tmp/test', phase: 'working', createdAt: 1, session: { id: 's1', name: 'Notification test', cwd: '/tmp/test', messageCount: 0, modified: '2026-09-11T00:00:00Z' } }] };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === '/api/card-queue' ? queue : path === '/api/models' ? { models: [], modelList: [] } : path.startsWith('/api/sessions/') ? { context: { messages: [], entryIds: [] }, tree: [], leafId: null } : {};
    await route.fulfill({ json: data });
  });
  await page.goto('http://127.0.0.1:30141');
  await page.getByRole('button', { name: '开启系统完成通知' }).click();
  await page.getByRole('button', { name: '系统完成通知：已开启' }).waitFor();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
  });
  queue = { ...queue, revision: 2, order: ['c1'], cards: [{ ...queue.cards[0], phase: 'attention', readyAt: 21 }] };
  await page.locator('[data-card-id="c1"][data-phase="attention"]').first().waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.tones), 0, 'ordinary completion stays silent while focused');
  assert.equal(await page.evaluate(() => window.notices.length), 0, 'ordinary completion has no notification while focused');
  queue = { ...queue, revision: 3, order: [], cards: [{ ...queue.cards[0], phase: 'working', readyAt: undefined }] };
  await page.locator('.cq-working-list [data-transfer-id="c1"]').waitFor();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  queue = { ...queue, revision: 4, order: ['c1'], cards: [{ ...queue.cards[0], phase: 'attention', readyAt: 42 }] };
  await page.waitForFunction(() => window.notices.length === 1);
  assert.equal(await page.evaluate(() => window.notices[0].title), 'AI 回复已就绪');
  await page.waitForTimeout(3500);
  assert.equal(await page.evaluate(() => window.notices.length), 1);
  assert.equal(await page.evaluate(() => window.tones), 4, 'one two-note wooden-bar chime for completion of an unmounted working card');
  console.log('PASS: permission button, hidden-page polling, completion delivery, repeated-snapshot deduplication');
} finally { await browser.close(); }
