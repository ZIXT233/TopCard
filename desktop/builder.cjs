/* eslint-disable @typescript-eslint/no-require-imports */
const { rename, cp, rm } = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const staging = mkdtempSync(join(tmpdir(), 'topcard-package-'));
const runtime = process.env.TOPCARD_DESKTOP_RUNTIME_DIR || 'build/desktop-runtime';

module.exports = {
  appId: 'app.topcard.desktop', productName: 'TopCard',
  directories: { output: process.env.TOPCARD_DESKTOP_RELEASE_DIR || 'build/releases' },
  files: ['desktop/main.cjs', 'desktop/backend.cjs', 'desktop/preload.cjs', 'desktop/storage.cjs', 'desktop/tray.png', 'desktop/app-icon.png', 'package.json', '!node_modules/**/*'],
  extraMetadata: { main: 'desktop/main.cjs' },
  extraResources: [{ from: staging, to: 'runtime' }],
  beforePack: async () => {
    const begin = Date.now();
    console.log('[desktop-package] start beforePack copy runtime');
    try {
      await cp(runtime, staging, { recursive: true });
      await rename(join(staging, 'node_modules'), join(staging, 'modules'));
      console.log(`[desktop-package] beforePack copy runtime: ${((Date.now() - begin) / 1000).toFixed(1)}s`);
    } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
  },
  afterPack: async ({ appOutDir, electronPlatformName }) => {
    const resources = electronPlatformName === 'darwin'
      ? join(appOutDir, 'TopCard.app', 'Contents', 'Resources')
      : join(appOutDir, 'resources');
    // extraResources filters source directories named node_modules. Stage the
    // traced dependencies as "modules", then restore Node's standard layout in
    // the completed app so both CommonJS and ESM package resolution work.
    const begin = Date.now();
    console.log('[desktop-package] start afterPack restore node_modules');
    try {
      await rename(join(resources, 'runtime', 'modules'), join(resources, 'runtime', 'node_modules'));
      execFileSync(process.execPath, [join(__dirname, 'verify-pi-runtime.mjs'), join(resources, 'runtime')], { stdio: 'inherit', timeout: 120000 });
      console.log(`[desktop-package] afterPack restore+verify: ${((Date.now() - begin) / 1000).toFixed(1)}s`);
    } finally { await rm(staging, { recursive: true, force: true }); }
  },
  npmRebuild: false,
  mac: { category: 'public.app-category.productivity', target: ['dmg'], identity: "-", icon: 'public/icons/topcard-512.png' },
  win: { target: ['nsis'], icon: 'desktop/app-icon.ico' },
  linux: { target: ['AppImage'], category: 'Development', icon: 'public/icons/topcard-512.png' },
};
