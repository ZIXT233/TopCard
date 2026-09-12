import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => localStorage.setItem('pi-locale', 'zh-CN'));
  const host = { id: 'fixture', name: '测试服务器', hostname: 'fixture', source: 'config' };
  let saved, localPicker = 0;
  await page.route('**/api/workspace-machines', async route => {
    const body = route.request().postDataJSON();
    let data;
    if (!body) data = { hosts: [host] };
    else if (body.action === 'connect') {
      if (body.password !== 'test-password') { await route.fulfill({ status: 400, json: { error: '需要密码', code: 'AUTH_REQUIRED' } }); return; }
      data = { cwd: '/home/dev' };
    } else if (body.action === 'directories') data = { directories: body.path === '/home/dev/' ? [{ name: 'project with space', path: '/home/dev/project with space/' }] : [] };
    else if (body.action === 'local-folder') { localPicker++; data = { cwd: '/tmp/local-project' }; }
    else data = { ok: true };
    await route.fulfill({ json: data });
  });
  await page.route('**/api/card-queue', async route => {
    if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'workspace_create') {
      saved = route.request().postDataJSON();
      await route.fulfill({ status: 400, json: { error: 'fixture: save captured' } });
    } else await route.continue();
  });
  await page.goto('http://127.0.0.1:30141');
  await page.locator('.cq-new').click();
  await page.locator('.cq-picker-add').click();
  await page.getByRole('button', { name: /测试服务器/ }).click();
  await page.getByRole('dialog', { name: 'SSH 身份验证', exact: true }).waitFor();
  await page.locator('input[type=password]').fill('test-password');
  await page.getByRole('button', { name: '连接', exact: true }).click();
  await page.getByRole('option', { name: /project with space/ }).waitFor();
  assert.match(await page.locator('#remote-directories [role=option]').first().innerText(), /上一级/);
  await page.locator('#remote-directories [role=option]').first().click();
  await page.waitForFunction(() => document.querySelector('#workspace-cwd')?.value === '/home/');
  await page.locator('#workspace-cwd').fill('/');
  assert.equal(await page.getByRole('option', { name: /上一级/ }).count(), 0);
  await page.locator('#workspace-cwd').fill('/home/dev/');
  await page.getByRole('option', { name: /project with space/ }).click();
  await page.getByRole('button', { name: '使用此文件夹' }).click();
  await page.locator('.machine-error').waitFor();
  assert.equal(saved.sshHost, 'fixture');
  assert.equal(saved.cwd, '/home/dev/project with space/');
  assert.equal(saved.name, 'project with space');
  assert.equal(saved.password, undefined);
  await page.screenshot({ path: '/tmp/cq-remote-folder.png' });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('.cq-new').click();
  await page.locator('.cq-picker-add').click();
  await page.getByRole('button', { name: /本机.*使用系统/ }).click();
  await page.waitForFunction(() => document.querySelector('#workspace-cwd')?.value === '/tmp/local-project');
  assert.equal(localPicker, 1);
  console.log('PASS: machine → password → remote directory → workspace payload; local machine invokes native-picker endpoint');
} finally { await browser.close(); }
