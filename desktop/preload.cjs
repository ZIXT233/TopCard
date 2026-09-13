/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require('electron');
const persistent = process.argv.includes('--topcard-persistent-storage');
const requestStorage = (operation, key, value) => {
  const result = ipcRenderer.sendSync('topcard:storage', operation, String(key), value);
  if (result.error) throw new Error(result.error);
  return result.value;
};
const storage = persistent ? {
  getItem: key => requestStorage('get', key),
  setItem: (key, value) => { requestStorage('set', key, String(value)); },
  removeItem: key => { requestStorage('remove', key); },
} : undefined;
if (persistent) ipcRenderer.on('topcard:storage-changed', (_event, change) => {
  window.dispatchEvent(new StorageEvent('storage', change));
});
ipcRenderer.on('topcard:notification-click', (_event, url) => {
  if (typeof url === 'string') {
    window.dispatchEvent(new CustomEvent('topcard:notification-click', { detail: { url } }));
  }
});
// No filesystem or process APIs are exposed to the renderer.
contextBridge.exposeInMainWorld('topcardDesktop', { storage, platform: process.platform, writeClipboardText: (text) => ipcRenderer.invoke('topcard:write-clipboard', text), setWindowTheme: (dark) => ipcRenderer.send('topcard:window-theme', dark), owner: process.argv.find(arg => arg.startsWith('--topcard-owner='))?.slice('--topcard-owner='.length), openCard: (cardId) => ipcRenderer.send('topcard:open-card', cardId), focus: () => ipcRenderer.send('topcard:focus'), openNotification: (url) => ipcRenderer.send('topcard:open-notification', url), requestNotifications: () => ipcRenderer.invoke('topcard:request-notifications'), openNotificationSettings: () => ipcRenderer.invoke('topcard:open-notification-settings') });
