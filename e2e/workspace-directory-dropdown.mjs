import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => localStorage.setItem('pi-locale', 'en'));
  await page.route('**/api/workspace-machines', async route => {
    const body = route.request().postDataJSON();
    if (!body) return route.fulfill({ json: { hosts: [{ id: 'fixture', name: 'dev-server', source: 'config' }] } });
    if (body.action === 'connect') return route.fulfill({ json: { cwd: '/few' } });
    const count = body.path === '/many/' ? 100 : body.path === '/empty/' ? 0 : 2;
    await route.fulfill({ json: { directories: Array.from({ length: count }, (_, i) => ({ name: `folder-${i}`, path: `${body.path}folder-${i}/` })) } });
  });
  await page.goto('http://127.0.0.1:30141');
  await page.locator('.cq-new').click();
  await page.locator('.cq-picker-add').click();
  await page.getByRole('button', { name: /dev-server/ }).click();
  await page.getByRole('option', { name: 'folder-1', exact: true }).waitFor();
  const bounds = await page.locator('.machine-dialog').boundingBox();
  const input = page.locator('#workspace-cwd');
  await input.fill('/many/');
  await page.getByRole('option', { name: 'folder-99', exact: true }).waitFor({ state: 'attached' });
  assert.deepEqual(await page.locator('.machine-dialog').boundingBox(), bounds);
  assert.equal(await page.locator('.remote-directories').evaluate(el => el.scrollHeight > el.clientHeight), true);
  await input.fill('/empty/');
  await page.getByRole('option', { name: 'folder-0', exact: true }).waitFor({ state: 'detached' });
  assert.deepEqual(await page.locator('.machine-dialog').boundingBox(), bounds);
  await input.press('Escape');
  await page.locator('.remote-directory-popup').waitFor({ state: 'hidden' });
  assert.equal(await input.getAttribute('aria-expanded'), 'false');
  await input.press('ArrowDown');
  await page.locator('.remote-directory-popup').waitFor();
  await input.press('Tab');
  await page.waitForFunction(() => document.querySelector('#workspace-cwd')?.value === '/');
  await input.press('Tab');
  await page.locator('.remote-directory-popup').waitFor({ state: 'hidden' });
  assert.deepEqual(await page.locator('.machine-dialog').boundingBox(), bounds);
  console.log('PASS: floating directory suggestions never resize/reposition dialog; internal scrolling, Escape, focus and parent entry work');
} finally { await browser.close(); }
