import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => console.error(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('pi-locale', 'zh-CN');
    window.EventSource = class {
      static CLOSED = 2;
      readyState = 1;
      constructor() { this.timer = setTimeout(() => { this.onopen?.(); this.onmessage?.({data:JSON.stringify({type:'output',data:'\x1b[?1049h\x1b[?1000h\x1b[?1006hterminal ready\r\n',offset:16})}); }, 100); }
      close() { clearTimeout(this.timer); this.readyState=2; }
    };
  });
  const cards = [0, 1, 2].map(i => ({ id: `gesture-${i}`, cwd: '/tmp', phase: 'attention', createdAt: i + 1, session: null,
    harness: {kind:'codex', terminalId:`terminal-${i}`, state:'attention', version:'test', title:`终端 ${i}`} }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path === '/api/card-queue') data = { version:1, revision:1, sortMode:'fifo', order:cards.map(c=>c.id), cards };
    else if (path === '/api/models') data = {models:[], modelList:[], defaultModel:null};
    else if (path === '/api/agent/running') data = {ids:[]};
    else if (path.endsWith('/events')) { await route.fulfill({contentType:'text/event-stream',body:'data: {"type":"output","data":"terminal ready\\r\\n"}\n\n'}); return; }
    await route.fulfill({json:data});
  });
  await page.goto(process.env.E2E_BASE_URL || 'http://127.0.0.1:30141', {waitUntil:'domcontentloaded'});

  await page.locator('.cq-deck-layer[aria-hidden="false"] .xterm').waitFor();
  await page.evaluate(() => { document.documentElement.classList.add('topcard-desktop'); document.documentElement.dataset.desktopPlatform='linux'; });
  for (const width of [1440, 1100, 900]) {
    await page.setViewportSize({width,height:1000});
    const geometry = await page.evaluate(() => {
      const content=document.querySelector('.cq-content').getBoundingClientRect();
      const search=document.querySelector('.cq-card-search').getBoundingClientRect();
      return {content:content.x+content.width/2, search:search.x+search.width/2};
    });
    assert.ok(Math.abs(geometry.content-geometry.search)<1, JSON.stringify(geometry));
  }
  await page.setViewportSize({width:1440,height:1000});
  const terminal = page.locator('.cq-deck-layer[aria-hidden="false"] .xterm');
  await terminal.hover();
  await page.waitForTimeout(300);
  await page.mouse.wheel(650, 0);
  await page.waitForFunction(() => document.querySelector('.cq-deck-scroller').scrollLeft > 100);
  await page.waitForTimeout(400);
  const sendWheel = (selector, dx, dy) => page.evaluate(({selector, dx, dy}) => {
    const target = document.querySelector(selector);
    const rect = target.getBoundingClientRect();
    const event = new WheelEvent('wheel', {deltaX:dx, deltaY:dy, clientX:rect.x+rect.width/2,
      clientY:rect.y+rect.height/2, bubbles:true, cancelable:true});
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }, {selector, dx, dy});
  const header = '.cq-deck-layer[aria-hidden="false"] .cq-card-identity';
  assert.equal(await sendWheel(header, 0, 80), true, 'vertical header gesture mapped');
  assert.equal(await sendWheel(header, 90, 80), true, 'mapped burst does not change axis');
  await page.waitForTimeout(450);
  assert.equal(await sendWheel(header, 80, 80), false, 'diagonal starts native');
  assert.equal(await sendWheel(header, 0, 80), false, 'native burst stays native');
  await page.waitForTimeout(450);
  assert.equal(await sendWheel('.cq-deck-layer[aria-hidden="false"] .cq-card-header button', 0, 80), false, 'buttons excluded');
  await page.waitForTimeout(450);
  const heading = page.locator(header);
  await heading.hover();
  const before = await page.locator('.cq-deck-scroller').evaluate(el => el.scrollLeft);
  await page.mouse.wheel(0, -650);
  await page.waitForFunction(before => document.querySelector('.cq-deck-scroller').scrollLeft < before-100, before);
  await page.waitForTimeout(450);
  const outsideMapped = await page.evaluate(() => {
    const deck = document.querySelector('.cq-deck-scroller');
    const front = document.querySelector('.cq-deck-layer[aria-hidden="false"]').getBoundingClientRect();
    const event = new WheelEvent('wheel', {deltaY:80, clientX:front.left-8, clientY:front.top+100, bubbles:true, cancelable:true});
    deck.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(outsideMapped, true, 'outside card mapped');
  await page.waitForTimeout(450);
  const bodyMapped = await page.evaluate(() => {
    const panel = document.querySelector('.cq-deck-layer[aria-hidden="false"] .xterm').parentElement;
    const rect = panel.getBoundingClientRect();
    const event = new WheelEvent('wheel', {deltaY:80, clientX:rect.x+rect.width/2, clientY:rect.y+rect.height/2, bubbles:true, cancelable:true});
    panel.dispatchEvent(event);
    return document.querySelector('.cq-deck-scroller').classList.contains('cq-vertical-wheel');
  });
  assert.equal(bodyMapped, false, 'terminal body never mapped vertically');
  const markers = page.locator('.cq-queue-minimap-track button');
  const first = await markers.nth(0).boundingBox();
  const last = await markers.nth(2).boundingBox();
  await page.mouse.move(first.x + first.width/2, first.y + first.height/2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width/2, last.y + last.height/2, {steps:8});
  await page.waitForFunction(() => document.querySelectorAll('.cq-queue-minimap-track button')[2].getAttribute('aria-current') === 'true');
  await page.mouse.up();
  await markers.nth(0).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.cq-queue-minimap-track button')[0].getAttribute('aria-current') === 'true');
  console.log('PASS minimap selects continuously while held and keeps keyboard activation');
  console.log('PASS search geometry, terminal horizontal scrolling, vertical header navigation and gesture direction lock');
} finally { await browser.close(); }
