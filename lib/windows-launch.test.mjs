import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const { windowsCommand } = await jiti.import('./harness/windows-command.ts');
const { bundledPiCommand } = await jiti.import('./harness/bundled-pi.ts');
const { windowsHookCommand, prepareHookLaunch } = await jiti.import('./harness/hook-launch.ts');
const exec = promisify(execFile);

test('native executables retain an argument array without cmd parsing', () => {
  const args = ['--config', 'hooks={"command":"C:\\space path\\node.exe"}'];
  const launch = windowsCommand('C:\\space path\\codex.EXE', args);
  assert.equal(launch.executable, 'C:\\space path\\codex.EXE');
  assert.equal(launch.windowsVerbatimArguments, false);
  assert.deepEqual(launch.args, args);
});

test('Windows batch launch preserves spaces, Unicode, JSON and shell metacharacters', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'topcard Windows 命令 '));
  try {
    const script = join(root, 'echo-args.cjs');
    const batch = join(root, 'agent.CMD');
    await writeFile(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))');
    await writeFile(batch, `@echo off\r\n"${process.execPath}" "%~dp0echo-args.cjs" %*\r\n`);
    const args = ['--version', 'space value', '中文', 'a&b', 'x|y', 'hello^world', '100%', 'bang!', 'hooks={"command":"node C:\\path with space\\"}', 'C:\\trailing\\', ''];
    const launch = windowsCommand(batch, args);
    const { stdout } = await exec(launch.executable, launch.args, { windowsVerbatimArguments: launch.windowsVerbatimArguments, windowsHide: true });
    assert.deepEqual(JSON.parse(stdout), args);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('bundled Pi invokes the actual package CLI with the embedded Node runtime', async () => {
  const command = await bundledPiCommand(process.env);
  const { stdout } = await exec(command.executable, [...command.args, '--version'], { env: command.env, timeout: 15000, windowsHide: true });
  const pkg = JSON.parse(await readFile('node_modules/@earendil-works/pi-coding-agent/package.json', 'utf8'));
  assert.equal(stdout.trim(), pkg.version);
});

test('Windows hooks deliver real lifecycle JSON through both CMD and PowerShell', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'topcard hook 中文 '));
  const previousCursorHooks = process.env.TOPCARD_CURSOR_HOOKS;
  try {
    process.env.TOPCARD_CURSOR_HOOKS = join(root, 'cursor-hooks.json');
    for (const kind of ['codex', 'cursor']) {
      const directory = join(root, kind, 'signals', 'one');
      const launch = await prepareHookLaunch(kind, directory, { kind: 'local' }, 'hook-test');
      const command = kind === 'codex'
        ? JSON.parse(launch.args.find(arg => arg.startsWith('hooks.SessionStart=')).match(/command=("(?:\\.|[^"\\])*"),timeout/)[1])
        : JSON.parse(await readFile(process.env.TOPCARD_CURSOR_HOOKS, 'utf8')).hooks.sessionStart[0].command;
      for (const shell of kind === 'cursor' ? ['cmd'] : ['cmd', 'powershell']) {
        const file = shell === 'cmd' ? process.env.ComSpec : 'powershell.exe';
        const payload = JSON.stringify({ hook_event_name: 'SessionStart', session_id: `hook-${kind}-${shell}`, prompt: '中文' });
        const args = shell === 'cmd' ? ['/d', '/s', '/c', `"${command}"`] : ['-NoProfile', '-Command', command];
        const child = execFile(file, args, { windowsVerbatimArguments: shell === 'cmd', windowsHide: true, env: { ...process.env, ...launch.env }, timeout: 10000 });
        child.stdin.end(payload);
        const { stdout } = await new Promise((resolve, reject) => {
          let stdout = '', stderr = '';
          child.stdout.on('data', data => { stdout += data; });
          child.stderr.on('data', data => { stderr += data; });
          child.on('error', reject);
          child.on('close', code => code === 0 ? resolve({ stdout }) : reject(new Error(`hook ${shell} exit=${code}: ${stderr}`)));
        });
        if (kind === 'cursor') assert.deepEqual(JSON.parse(stdout), {});
        const { readdir } = await import('node:fs/promises');
        const signals = await Promise.all((await readdir(directory)).filter(file => file.endsWith('.json')).map(async file => JSON.parse(await readFile(join(directory, file), 'utf8'))));
        assert.ok(signals.some(signal => signal.sessionId === `hook-${kind}-${shell}` && ['SessionStart', 'sessionStart'].includes(signal.event)));
      }
    }
    const script = windowsHookCommand(process.execPath, 'C:\\a b\\hook.cjs', true);
    assert.match(Buffer.from(script.split(' ').at(-1), 'base64').toString('utf16le'), /ELECTRON_RUN_AS_NODE/);
  } finally {
    if (previousCursorHooks === undefined) delete process.env.TOPCARD_CURSOR_HOOKS;
    else process.env.TOPCARD_CURSOR_HOOKS = previousCursorHooks;
    await rm(root, { recursive: true, force: true });
  }
});
