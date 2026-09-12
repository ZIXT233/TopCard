import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const data = await mkdtemp(join(tmpdir(), 'topcard-desktop-test-'));
await writeFile(join(data, 'notification-setup-requested'), '1');
const app = await electron.launch({
  ...(process.env.TOPCARD_DESKTOP_EXECUTABLE ? { executablePath: process.env.TOPCARD_DESKTOP_EXECUTABLE, args: [] } : { args: [resolve('.')] }),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '', TOPCARD_DESKTOP_USER_DATA: data },
});
let origin;
try {
  const page = await app.firstWindow();
  await page.waitForURL(/127\.0\.0\.1/);
  await page.waitForFunction(() => document.body.innerText.includes('TopCard'));
  origin = new URL(page.url()).origin;
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => !!window.topcardDesktop), true);
  await page.evaluate(async () => {
    const image = new Image(); image.src = '/icons/topcard-192.png'; await image.decode();
    if (image.naturalWidth !== 192) throw new Error('Desktop image asset failed to load');
  });
  assert.equal((await fetch(origin + '/api/card-queue')).status, 401);
  await app.evaluate(async ({ session }) => { await session.defaultSession.clearStorageData({ storages: ['cookies'] }); });
  await page.reload();
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(await page.evaluate(async () => (await fetch('/api/card-queue')).status), 200);
  await page.evaluate(async () => { await fetch('/api/web-auth', {method:'DELETE'}); });
  await page.goto(origin + '/login');
  await page.waitForURL(origin + '/');
  console.log('PASS desktop authentication survives cookie loss and logout; external requests stay unauthorized');
  await page.getByRole('button', {name: /^(设置|Settings)$/}).click();
  await page.locator('.settings-general').waitFor({state: 'visible'});
  assert.equal(await page.getByRole('button', {name: /^(退出登录|Log out|Sign out)$/}).count(), 0);
  console.log('PASS desktop general settings have no web logout control');
  await page.keyboard.press('Escape');
  const api = async (path, body, method = 'POST') => page.evaluate(async ({path, body, method}) => {
    const response = await fetch(path, {method, headers: {'Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {})});
    const result = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(result));
    return result;
  }, {path, body, method});
  await api('/api/cwd/validate', {cwd:data});
  await api(`/api/models?cwd=${encodeURIComponent(data)}`, null, 'GET');
  if (process.env.TOPCARD_TEST_PI_PROMPT === '1') {
    const { sessionId } = await api('/api/agent/new', { cwd: data, type: 'ensure_session', toolNames: [] });
    try {
      await api(`/api/agent/${sessionId}`, { type: 'prompt', message: 'Reply with exactly TOPCARD_DESKTOP_PI_OK.' });
      await page.waitForFunction(async id => {
        const response = await fetch(`/api/sessions/${id}`);
        const data = await response.json();
        return data.context?.messages?.some(message => message.role === 'assistant'
          && Array.isArray(message.content) && message.content.some(block => block.type === 'text' && block.text.includes('TOPCARD_DESKTOP_PI_OK')));
      }, sessionId, { timeout: 120000 });
      console.log('PASS real Pi provider request and persisted assistant reply');
    } finally {
      await api(`/api/agent/${sessionId}`, { type: 'abort' }).catch(() => {});
      await api(`/api/sessions/${sessionId}`, null, 'DELETE');
    }
  }
  const {id} = await api('/api/terminal', {cwd:data, cols:80, rows:24});
  try {
    await page.evaluate(id => {
      window.desktopTestOutput = '';
      window.desktopTestStream = new EventSource(`/api/terminal/${id}/events`);
      window.desktopTestStream.onmessage = event => { window.desktopTestOutput += event.data; };
    }, id);
    await api(`/api/terminal/${id}`, {type:'input', data:"printf 'DESKTOP_%s_OK\\n' PTY\r"});
    await page.waitForFunction(() => window.desktopTestOutput.includes('DESKTOP_PTY_OK'));
    await api(`/api/terminal/${id}`, {type:'resize', cols:100, rows:30});
  } finally { await page.evaluate(()=>window.desktopTestStream.close()); await api(`/api/terminal/${id}`, null, 'DELETE'); }
  await page.evaluate(() => window.open(location.origin, 'duplicate-main'));
  await page.waitForTimeout(100);
  assert.equal(app.windows().length, 1);
  const cardId = '00000000-0000-4000-8000-000000000001';
  const cardPromise = app.waitForEvent('window');
  await page.evaluate(id => window.topcardDesktop.openCard(id), cardId);
  const cardWindow = await cardPromise;
  await cardWindow.waitForURL(new RegExp(cardId));
  await cardWindow.evaluate(() => { window.desktopReuseMarker = 'retained'; });
  await cardWindow.evaluate(() => window.topcardDesktop.openNotification('/?attention=notification-target'));
  await page.waitForURL(/attention=notification-target/);
  assert.equal(new URL(cardWindow.url()).searchParams.get('card'), cardId);
  assert.equal(app.windows().length, 2);
  // A notification sent by any window must restore the already-open target card.
  await page.evaluate(id => window.topcardDesktop.openNotification(`/?card=${id}`), cardId);
  assert.equal(await cardWindow.evaluate(() => window.desktopReuseMarker), 'retained');
  console.log('PASS notification from detached window preserves main target; detached target reused');
  await app.evaluate(({BrowserWindow}, cardId) => {
    const child = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes(cardId));
    child.minimize();
    BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes(cardId)).focus();
  }, cardId);
  await page.evaluate(id => window.topcardDesktop.openCard(id), cardId);
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await app.evaluate(({BrowserWindow}, id) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes(id))?.isFocused(), cardId)) break;
    await page.waitForTimeout(100);
  }
  const reused = await app.evaluate(({BrowserWindow}, cardId) => {
    const windows = BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().includes(cardId));
    return {count:windows.length, minimized:windows[0].isMinimized(), visible:windows[0].isVisible(), focused:windows[0].isFocused()};
  }, cardId);
  assert.equal(reused.count, 1);
  assert.equal(reused.minimized, false);
  assert.equal(reused.visible, true);
  // Native OS focus requires an interactive desktop without another running copy.
  if (process.env.TOPCARD_TEST_NATIVE_FOCUS === '1') assert.equal(reused.focused, true);
  assert.equal(await cardWindow.evaluate(() => window.desktopReuseMarker), 'retained');
  await cardWindow.close();
  const reopenedPromise = app.waitForEvent('window');
  await page.evaluate(id => window.topcardDesktop.openCard(id), cardId);
  const reopened = await reopenedPromise; await reopened.waitForURL(new RegExp(cardId)); await reopened.close();
  console.log('PASS: card window restored, reused without reload, reopened after close');
  await page.evaluate(() => Notification.requestPermission());
  assert.equal(await page.evaluate(() => Notification.permission), 'granted');
  await app.evaluate(({BrowserWindow}) => { BrowserWindow.getAllWindows()[0].close(); });
  assert.equal(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  await page.evaluate(() => window.topcardDesktop.focus());
  assert.equal(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isVisible()), true);
  await page.screenshot({path:'/tmp/topcard-electron-production.png'});
  console.log('PASS: production boot, auth, Pi models, native PTY I/O + resize, detached window, permission, hide + show');
} finally { await app.close(); await rm(data, {recursive:true, force:true}); }
for (let i=0;i<30;i++) {
  try { await fetch(origin); await new Promise(resolve=>setTimeout(resolve,100)); }
  catch { console.log('PASS: owned backend stopped on app quit'); process.exit(0); }
}
throw new Error('Backend remained alive after quit');
