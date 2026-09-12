import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(() => {
    window.tones = 0;
    window.contexts = [];
    window.AudioContext = class {
      state = 'interrupted'; currentTime = 0; destination = {};
      constructor() { window.contexts.push(this); }
      async resume() { this.state = 'running'; }
      createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, start() { if (window.contexts[0].state === 'running') window.tones++; }, stop() {} }; }
      createGain() { return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
    };
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === '/api/card-queue' ? { version: 1, revision: 1, order: [], cards: [], workspaces: [] } : path === '/api/models' ? { models: [], modelList: [] } : {};
    await route.fulfill({ json: data });
  });
  await page.goto('http://127.0.0.1:30141');
  await page.locator('.cq-sidebar-brand > button').last().click();
  await page.locator('.settings-section-tab').first().click();
  const preview = page.getByRole('button', { name: /^(Test sound|试听|試聽)$/ });
  await page.evaluate(() => { window.contexts[0].state = 'interrupted'; });
  await preview.click();
  await page.waitForFunction(() => window.tones === 4);
  assert.equal(await page.evaluate(() => window.contexts.length), 1, 'settings and queue share the unlocked context');
  const toggle = page.getByRole('switch', { name: /^(Notification sound|通知提示音)$/ });
  await toggle.click();
  assert.equal(await page.evaluate(() => localStorage.getItem('topcard:sound-enabled')), 'false');
  await preview.click();
  await page.waitForFunction(() => window.tones === 8);
  assert.equal(await toggle.getAttribute('aria-checked'), 'false', 'preview does not change the sound preference');
  console.log('PASS: interrupted audio recovers; one shared context; explicit preview works while muted');
} finally { await browser.close(); }
