/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, Menu, Tray, nativeImage, shell, session, dialog, ipcMain, clipboard, Notification, utilityProcess } = require('electron');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { mkdirSync, createWriteStream, existsSync, writeFileSync } = require('node:fs');
const { randomBytes, createHmac } = require('node:crypto');
const net = require('node:net');
const { createStorage } = require('./storage.cjs');

app.setName('TopCard');
app.setAppUserModelId('app.topcard.desktop');
if (process.env.TOPCARD_DESKTOP_USER_DATA) app.setPath('userData', process.env.TOPCARD_DESKTOP_USER_DATA);
const logsDir = join(app.getPath('userData'), 'logs');
mkdirSync(logsDir, { recursive: true });
const mainLog = createWriteStream(join(logsDir, 'main.log'), { flags: 'a' });
const log = (...args) => {
  const line = `[${new Date().toISOString()}] ${args.map(value => value instanceof Error ? value.stack || value.message : String(value)).join(' ')}\n`;
  mainLog.write(line);
  console.log(...args);
};
if (process.argv.includes('--enable-logging') || process.env.TOPCARD_DESKTOP_DEBUG) {
  app.commandLine.appendSwitch('enable-logging');
  app.commandLine.appendSwitch('log-file', join(logsDir, 'chromium.log'));
}
const dev = process.argv.includes('--dev');
let origin, backend, mainWindow, tray, quitting = false, backendExited = false;
const root = join(__dirname, '..');
const cardWindows = new Map();
const cardReleases = new Map();
const setupNotices = new Set();
const instanceId = randomBytes(16).toString("hex");
const trusted = (url) => { try { return new URL(url).origin === origin; } catch { return false; } };
const external = (url) => { if (/^https?:\/\//i.test(url)) void shell.openExternal(url); };
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const windowChrome = () => ({
  titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
  ...(process.platform === 'darwin'
    ? { trafficLightPosition: { x: 24, y: 25 } }
    : { titleBarOverlay: { color: '#f1f2ef', symbolColor: '#303731', height: 64 }, autoHideMenuBar: true }),
});

async function startBackend() {
  if (dev) {
    origin = 'http://127.0.0.1:30141';
    const response = await fetch(origin + '/api/web-auth');
    if (!response.ok) throw new Error('开发服务不可用，请先运行 npm run dev。');
    return;
  }
  const runtime = app.isPackaged ? join(process.resourcesPath, 'runtime') : join(root, 'build', 'desktop-runtime');
  const listener = net.createServer();
  const port = await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const port = listener.address().port;
      listener.close(() => resolve(port));
    });
  });
  origin = `http://127.0.0.1:${port}`;
  const secret = randomBytes(32).toString('hex');
  const serverLog = createWriteStream(join(logsDir, 'server.log'), { flags: 'w' });
  log('backend runtime', runtime, 'port', String(port));
  let loginPath = process.env.PATH || '';
  if (process.platform !== 'win32') {
    try { loginPath = execFileSync(process.env.SHELL || '/bin/sh', ['-lc', 'printenv PATH'], { encoding: 'utf8', timeout: 5000 }).trim(); } catch { /* Retain the inherited environment. */ }
  }
  // A utility process reuses Electron's Node runtime without registering the
  // long-running local server as a second Dock application.
  backendExited = false;
  backend = utilityProcess.fork(join(__dirname, 'backend.cjs'), [], {
    cwd: runtime,
    env: { ...process.env, NODE_PATH: join(runtime, 'node_modules'), PATH: loginPath, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port),
      TOPCARD_SERVER_ENTRY: join(runtime, 'server.js'), TOPCARD_NODE_EXECUTABLE: process.execPath, TOPCARD_NODE_RUN_AS_NODE: '1',
      TOPCARD_DESKTOP_INSTANCE: instanceId, TOPCARD_DATA_DIR: join(app.getPath('userData'), '.topcard'), PI_WEB_PASSWORD: secret },
    stdio: 'pipe', serviceName: 'TopCard Local Service',
  });
  backend.stdout?.on('data', chunk => { serverLog.write(chunk); });
  backend.stderr?.on('data', chunk => { serverLog.write(chunk); mainLog.write(`[${new Date().toISOString()}] [server] ${chunk}`); });
  let failure;
  backend.once('error', error => { failure = new Error(`本地服务异常：${error.type}${error.location ? ` (${error.location})` : ''}`); log('backend error', failure); });
  backend.once('exit', code => {
    backendExited = true;
    failure = new Error(`本地服务退出 (${code})，日志：${logsDir}`);
    log('backend exit', String(code));
    if (mainWindow && !quitting) { dialog.showErrorBox('TopCard 服务已停止', failure.message); app.quit(); }
  });
  let ready = false;
  const healthStarted = Date.now();
  for (let i = 0; i < 150; i++) {
    if (failure) throw failure;
    try { ready = (await fetch(origin + '/api/web-auth', { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) {
      log('backend ready', `${Date.now() - healthStarted}ms`, `polls=${i + 1}`);
      break;
    }
    if (i === 0 || (i + 1) % 10 === 0) log('backend waiting', `poll=${i + 1}`, `${Date.now() - healthStarted}ms`);
    await pause(200);
  }
  if (!ready) throw new Error(`本地服务启动超时，日志：${logsDir}`);
  const createToken = () => {
    const payload = `v1.${Math.floor(Date.now() / 1000) + 30 * 86400}.${randomBytes(16).toString('hex')}`;
    return `${payload}.${createHmac('sha256', secret).update(`pi-web-session:${payload}`).digest('hex')}`;
  };
  // Desktop authentication belongs to the main process, not browser cookie persistence.
  // Scope the credential to this exact backend origin (including its random port).
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${origin}/*`] }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    const cookieKey = Object.keys(headers).find(key => key.toLowerCase() === 'cookie');
    const cookies = String(cookieKey ? headers[cookieKey] : '').split(';').map(value => value.trim())
      .filter(value => value && !value.startsWith('pi_web_session='));
    if (cookieKey) delete headers[cookieKey];
    headers.Cookie = [...cookies, `pi_web_session=${createToken()}`].join('; ');
    callback({ requestHeaders: headers });
  });
  await session.defaultSession.cookies.set({ url: origin, name: 'pi_web_session', value: createToken(), httpOnly: true, sameSite: 'strict', path: '/' });
}

async function openNotificationSettings() {
  const target = process.platform === 'darwin'
    ? 'x-apple.systempreferences:com.apple.Notifications-Settings.extension'
    : process.platform === 'win32' ? 'ms-settings:notifications' : null;
  if (!target) {
    dialog.showErrorBox('系统通知设置', '请在桌面环境的系统设置中允许 TopCard 显示通知。');
    return false;
  }
  try { await shell.openExternal(target); return true; }
  catch { return false; }
}

function notificationOriginAllowed(contents, requestingOrigin, details = {}) {
  const candidates = [
    requestingOrigin,
    details.requestingUrl,
    details.securityOrigin,
    details.embeddingOrigin,
    contents?.getURL?.(),
    origin,
  ];
  return candidates.some((candidate) => typeof candidate === 'string' && candidate && trusted(candidate));
}

async function requestSystemNotifications(verifyDelivery = false) {
  if (!Notification.isSupported()) return 'unsupported';
  // Constructing/showing the first native notification invokes OS authorization.
  const id = `topcard-permission-${Date.now()}`;
  const notice = new Notification({ id, title: 'TopCard 通知测试', body: '会话回复完成时，你会在这里收到提醒。', silent: true });
  setupNotices.add(notice);
  notice.once('close', () => setupNotices.delete(notice));
  notice.once('click', showMain);
  let shown = false;
  let failed = false;
  notice.once('show', () => { shown = true; });
  notice.once('failed', async () => {
    failed = true;
    setupNotices.delete(notice);
    if (verifyDelivery) return;
    const result = await dialog.showMessageBox({ type: 'info', message: 'TopCard 无法发送系统通知',
      detail: '请在系统通知设置中允许 TopCard，并开启桌面横幅。', buttons: ['打开系统通知设置', '稍后'], defaultId: 0, cancelId: 1 });
    if (result.response === 0) void openNotificationSettings();
  });
  notice.show();
  if (!verifyDelivery) return 'requested';
  await pause(700);
  if (failed) return await openNotificationSettings() ? 'settings-opened' : 'failed';
  if (shown) return 'granted';
  if (process.platform === 'darwin') {
    // macOS will not show the authorization dialog again after the user disables
    // an app in System Settings. Verify that the test reached Notification Center;
    // otherwise take the user to TopCard's notification settings.
    try {
      if ((await Notification.getHistory()).some(item => item.id === id)) return 'granted';
    } catch { /* Fall through to the only recovery macOS permits. */ }
    return await openNotificationSettings() ? 'settings-opened' : 'failed';
  }
  // Windows may delay or suppress the show event (Focus Assist / Start Menu
  // shortcut). Treat a non-failed show() as requested rather than failing closed.
  return 'requested';
}

function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = new BrowserWindow({ title: 'TopCard', icon: join(__dirname, 'app-icon.png'), width: 1440, height: 960, minWidth: 720, minHeight: 540,
      ...windowChrome(), backgroundColor: '#f1f2ef', show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false,
        preload: join(__dirname, 'preload.cjs'), additionalArguments: dev ? [] : ['--topcard-persistent-storage'] },
    });
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      log('window shown', origin);
      if (!dev) {
        const marker = join(app.getPath('userData'), 'notification-setup-requested');
        if (!existsSync(marker)) {
          writeFileSync(marker, '1');
          requestSystemNotifications();
        }
      }
    });
    mainWindow.webContents.on('did-start-loading', () => log('window loading', origin));
    mainWindow.webContents.on('did-finish-load', () => log('window loaded', mainWindow.webContents.getURL()));
    mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => log('window failed', String(code), description, url));
    mainWindow.on('close', event => { if (!quitting) { event.preventDefault(); mainWindow.hide(); } });
    log('window loadURL', origin);
    void mainWindow.loadURL(origin);
  } else { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
}

function showCard(cardId) {
  if (typeof cardId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(cardId)) return;
  let window = cardWindows.get(cardId);
  if (window && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore();
    window.show(); window.focus(); return;
  }
  const owner = `desktop:${instanceId}:${randomBytes(16).toString('hex')}`;
  window = new BrowserWindow({ title: 'TopCard', icon: join(__dirname, 'app-icon.png'), width: 1200, height: 900, show: false,
    ...windowChrome(),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false,
      preload: join(__dirname, 'preload.cjs'), additionalArguments: [`--topcard-owner=${owner}`, ...(dev ? [] : ['--topcard-persistent-storage'])] } });
  cardWindows.set(cardId, window);
  window.once('ready-to-show', () => { window.show(); window.focus(); });
  window.once('closed', () => {
    cardWindows.delete(cardId);
    const release = session.defaultSession.fetch(`${origin}/api/card-queue`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ action: 'release', id: cardId, owner }),
    }).catch(() => {});
    cardReleases.set(cardId, release);
    void release.finally(() => { if (cardReleases.get(cardId) === release) cardReleases.delete(cardId); });
    if (!quitting) showMain();
  });
  // A newly opened window must not race the previous window's release request.
  void Promise.resolve(cardReleases.get(cardId)).then(() => {
    if (!window.isDestroyed()) return window.loadURL(`${origin}/?card=${encodeURIComponent(cardId)}`);
  });
}

function routeAppWindow(url, frameName) {
  if (url === 'about:blank') {
    if (frameName?.startsWith('card-')) showCard(frameName.slice(5));
    else showMain();
    return true;
  }
  if (!trusted(url)) return false;
  const parsed = new URL(url);
  if (parsed.pathname !== '/' && parsed.pathname !== '/workspace') return false;
  const cardId = parsed.searchParams.get('card');
  if (cardId) showCard(cardId);
  else {
    const attentionId = parsed.searchParams.get('attention');
    if (attentionId && cardWindows.has(attentionId)) showCard(attentionId);
    else {
      showMain();
      // Soft-route attention/session into the live renderer — loadURL reloads the queue.
      if (attentionId || parsed.searchParams.has('session')) {
        let current;
        try { current = new URL(mainWindow.webContents.getURL()); } catch { current = null; }
        const live = current && current.origin === origin
          && (current.pathname === '/' || current.pathname === '/workspace')
          && !mainWindow.webContents.isLoadingMainFrame();
        if (live) mainWindow.webContents.send('topcard:notification-click', parsed.href);
        else void mainWindow.loadURL(parsed.href);
      }
    }
  }
  return true;
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (origin) showMain(); });
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!trusted(url)) { event.preventDefault(); external(url); return; }
      const target = new URL(url);
      const ownCard = [...cardWindows].find(([, window]) => window.webContents === contents)?.[0];
      if ((target.pathname === '/' || target.pathname === '/workspace') && target.searchParams.get('card') !== (ownCard || null)) {
        event.preventDefault(); routeAppWindow(url);
      }
    });
    contents.on('will-redirect', (event, url) => { if (!trusted(url)) event.preventDefault(); });
    contents.setWindowOpenHandler(({ url, frameName }) => {
      if (routeAppWindow(url, frameName)) return { action: 'deny' };
      if (!trusted(url)) { external(url); return { action: 'deny' }; }
      return { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } } };
    });
  });
  app.whenReady().then(async () => {
    log('app ready', `packaged=${app.isPackaged}`, `dev=${dev}`);
    // Renderer and main-process fetch share Chromium's session. A PAC/system
    // proxy that captures loopback leaves the window on "Connecting to Pi".
    await session.defaultSession.setProxy({ proxyRules: 'direct://' });
    log('session proxy', 'direct');
    await startBackend();
    if (!dev) {
      const storage = createStorage(join(app.getPath('userData'), 'preferences.json'));
      ipcMain.on('topcard:storage', (event, operation, key, value) => {
        if (!trusted(event.senderFrame?.url) || event.senderFrame !== event.sender.mainFrame) {
          event.returnValue = { error: 'Untrusted storage request' }; return;
        }
        try {
          const result = storage(operation, key, value);
          if (result.change) {
            for (const window of BrowserWindow.getAllWindows()) {
              if (window.webContents !== event.sender && trusted(window.webContents.getURL())) {
                window.webContents.send('topcard:storage-changed', { ...result.change, url: event.senderFrame.url });
              }
            }
          }
          event.returnValue = result;
        } catch (error) { event.returnValue = { error: error.message }; }
      });
    }
    ipcMain.on('topcard:open-card', (event, cardId) => {
      if (trusted(event.senderFrame?.url)) showCard(cardId);
    });
    ipcMain.on('topcard:focus', (event) => {
      if (!trusted(event.senderFrame?.url)) return;
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
    });
    ipcMain.on('topcard:window-theme', (event, dark) => {
      if (!trusted(event.senderFrame?.url) || typeof dark !== 'boolean') return;
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) return;
      window.setBackgroundColor(dark ? '#191c1a' : '#f1f2ef');
      if (process.platform !== 'darwin') window.setTitleBarOverlay({
        color: dark ? '#191c1a' : '#f1f2ef', symbolColor: dark ? '#e7ebe5' : '#303731', height: 64,
      });
    });
    ipcMain.on('topcard:open-notification', (event, url) => {
      if (!trusted(event.senderFrame?.url) || typeof url !== 'string') return;
      try {
        const target = new URL(url, origin);
        // A detached window may have been closed since this notification was sent.
        const cardId = target.searchParams.get('card');
        if (cardId) {
          target.searchParams.delete('card');
          target.searchParams.set('attention', cardId);
        }
        if (trusted(target.href)) routeAppWindow(target.href);
      } catch { /* Ignore malformed notification targets. */ }
    });
    ipcMain.handle('topcard:write-clipboard', (event, text) => {
      if (!trusted(event.senderFrame?.url) || typeof text !== 'string' || text.length > 1024 * 1024) return false;
      clipboard.writeText(text);
      return true;
    });
    ipcMain.handle('topcard:request-notifications', (event) => {
      if (!trusted(event.senderFrame?.url)) return 'unsupported';
      return requestSystemNotifications(true);
    });
    ipcMain.handle('topcard:open-notification-settings', (event) => {
      if (!trusted(event.senderFrame?.url)) return false;
      return openNotificationSettings();
    });
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(permission === 'notifications' && notificationOriginAllowed(contents, details?.requestingUrl || details?.securityOrigin, details));
    });
    // Notification permission checks often pass null webContents and an empty
    // requestingOrigin (especially on Windows). Falling back to our loopback
    // origin keeps HTML5 notifications from being stuck on "denied".
    session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => (
      permission === 'notifications' && notificationOriginAllowed(contents, requestingOrigin, details)
    ));
    const actions = [{ label: '显示 TopCard', click: showMain }, { type: 'separator' }, { label: '退出 TopCard（结束本应用的会话进程）', click: () => app.quit() }];
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'TopCard', submenu: actions },
      { label: '通知', submenu: [{ label: '申请权限 / 测试通知', click: requestSystemNotifications }, { label: '系统通知设置…', click: openNotificationSettings }] },
      { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: '视图', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
      { role: 'windowMenu' },
    ]));
    const icon = nativeImage.createFromPath(join(__dirname, 'tray.png'));
    tray = new Tray(icon); tray.setToolTip('TopCard'); tray.setContextMenu(Menu.buildFromTemplate(actions)); tray.on('click', showMain);
    showMain();
  }).catch(error => { dialog.showErrorBox('TopCard 启动失败', error.message); app.quit(); });
  app.on('activate', (_event, hasVisibleWindows) => {
    // Notification activation already restores its target window. Only a Dock
    // activation with no visible windows needs the main window as a fallback.
    if (origin && !hasVisibleWindows && !BrowserWindow.getAllWindows().some(window => window.isVisible())) showMain();
  });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; if (backend && !backendExited) backend.kill(); });
}
