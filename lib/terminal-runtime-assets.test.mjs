import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { restoreTerminalRuntime } from '../desktop/terminal-runtime-assets.mjs';

test('desktop restoration includes the dynamically loaded ConPTY worker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'topcard-terminal-assets-'));
  try {
    await restoreTerminalRuntime(process.cwd(), root);
    const worker = 'node_modules/node-pty/lib/worker/conoutSocketWorker.js';
    assert.equal(await readFile(join(root, worker), 'utf8'), await readFile(worker, 'utf8'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('restored Windows terminal runs PowerShell in an Electron utility process', { skip: process.platform !== 'win32', timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'topcard-electron-pty-'));
  try {
    await restoreTerminalRuntime(process.cwd(), root);
    await writeFile(join(root, 'worker.cjs'), `
      const pty = require('./node_modules/node-pty/lib/index.js');
      const terminal = pty.spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-Command', 'Write-Output "TOPCARD_SHELL_READY"'], { cwd: __dirname, env: process.env, cols: 80, rows: 24 });
      let output = '';
      const timer = setTimeout(() => { terminal.kill(); process.exit(2); }, 10000);
      terminal.onData(data => { output += data; });
      terminal.onExit(({exitCode}) => { clearTimeout(timer); console.log(JSON.stringify({exitCode, ready: output.includes('TOPCARD_SHELL_READY'), output})); process.exit(exitCode === 0 && output.includes('TOPCARD_SHELL_READY') ? 0 : 1); });
    `);
    await writeFile(join(root, 'main.cjs'), `
      const {app, utilityProcess} = require('electron');
      const {join} = require('node:path');
      app.setPath('userData', join(__dirname, 'profile'));
      app.whenReady().then(() => {
        const child = utilityProcess.fork(join(__dirname, 'worker.cjs'), [], {cwd: __dirname, stdio: 'pipe'});
        child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
        child.once('exit', code => app.exit(code));
      });
    `);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const electron = createRequire(import.meta.url)('electron');
    const { stdout } = await promisify(execFile)(electron, [join(root, 'main.cjs')], { env, timeout: 20000, windowsHide: true });
    assert.match(stdout, /"exitCode":0,"ready":true/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
