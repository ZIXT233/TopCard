import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { createHookOscProbe } from './harness/hook-osc.ts';
import * as hookContract from './harness/hook-contract.ts';
import { observeHook } from './harness/signals.ts';
import { launchCardHarness } from './harness/card-launch.ts';
import { withCardQueue } from './card-queue-store.ts';
const require = createRequire(import.meta.url);
function load(file, mocks, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), process, console, Buffer, ...globals });
  return exports;
}
const full = '01a094e0-ee17-7113-9ba6-b1b16ea0f76d';
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
test('remote Codex preserves matching known identity and clears it after a different title prefix', async () => {
  const mocks = Object.fromEntries(['./windows-command','./bundled-pi','./local-environment','./shell-launch','./shell-probe','./hook-launch','./hook-osc','./codex','../terminal-transcript','./codex-title','./signals','./registry','../ssh-connection','../ssh-workspace','../card-queue-live'].map(k => [k, {}]));
  mocks['./hook-contract'] = hookContract;
  mocks['../card-queue-live'] = { notifyQueueChanged() {} };
  mocks['../terminal-manager'] = { getTerminalSnapshot: () => ({ exited: false }) };
  const current = { state: 'working', at: 0, sessionId: full, sessionIdPrefix: full.slice(0, 29) };
  const runtime = load('lib/harness/runtime.ts', mocks, { __topcardHarnessProbes: new Map([['regression', current]]) });
  const session = { kind: 'codex', terminalId: 'regression', remote: true, providerSessionId: full };
  assert.equal((await runtime.harnessSnapshot(session)).providerSessionId, full);
  current.sessionIdPrefix = 'aaaaaaaa-ee17-7113-9ba6-b1b16';
  assert.equal((await runtime.harnessSnapshot(session)).providerSessionId, undefined);
  current.sessionIdPrefix = undefined;
  const updated = observeHook(current, { event: 'SessionStart', at: 1, sessionId: full });
  Object.assign(current, updated);
  assert.equal((await runtime.harnessSnapshot(session)).providerSessionId, full);
});
test('Cursor ownership recognizes PowerShell EncodedCommand and stale remote helper paths', async () => {
  const hook = load('lib/harness/hook-launch.ts', { './inherited-config': {}, './hook-contract': hookContract, 'node:os': { homedir: () => '/tmp' }, '../ssh-workspace': { shellQuote: quote }, '../node-runtime': { embeddedNodeExecutable: () => '/usr/bin/node' } });
  const current = '/home/u/.cache/topcard/harness/newtoken/hook.cjs';
  const encoded = hook.windowsHookCommand('/usr/bin/node', '/home/u/.cache/topcard/harness/oldtoken/hook.cjs', false, 'beforeSubmitPrompt', { TOPCARD_HARNESS_KIND: 'cursor' });
  assert.equal(hook.isTopCardCursorCommand(encoded, current), true);
  assert.equal(hook.isTopCardCursorCommand('echo foreign', current), false);
  const merged = hook.mergeCursorUserHooks({ version: 1, hooks: { beforeSubmitPrompt: [{ command: encoded }, { command: 'echo foreign' }] } }, { hooks: { beforeSubmitPrompt: [{ command: `TOPCARD_HARNESS_KIND=cursor /usr/bin/node ${current} beforeSubmitPrompt` }] } }, current);
  const commands = merged.hooks.beforeSubmitPrompt.map(entry => String(entry.command));
  assert.equal(commands.length, 2);
  assert.equal(commands[0], 'echo foreign');
  assert.equal(commands[1], `TOPCARD_HARNESS_KIND=cursor /usr/bin/node ${current} beforeSubmitPrompt`);
});
test('Cursor user hooks merge opens the TUI gate without replacing foreign entries', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topcard-cursor-hooks-'));
  const previous = process.env.TOPCARD_CURSOR_HOOKS;
  delete process.env.TOPCARD_CURSOR_HOOKS;
  try {
    const hook = load('lib/harness/hook-launch.ts', { './inherited-config': {}, './hook-contract': hookContract, 'node:os': { homedir: () => dir }, '../ssh-workspace': { shellQuote: quote }, '../node-runtime': { embeddedNodeExecutable: () => process.execPath } });
    const signalDir = path.join(dir, 'signals', 'one');
    const configPath = path.join(dir, '.cursor', 'hooks.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ version: 1, hooks: { beforeSubmitPrompt: [{ command: 'echo foreign', timeout: 2 }], stop: [{ command: 'echo keep' }] } }));
    await hook.prepareHookLaunch('cursor', signalDir, { kind: 'local' }, 'one');
    await hook.prepareHookLaunch('cursor', signalDir, { kind: 'local' }, 'two');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(config.hooks.beforeSubmitPrompt.filter(entry => entry.command === 'echo foreign').length, 1);
    assert.equal(config.hooks.stop.filter(entry => entry.command === 'echo keep').length, 1);
    const owned = config.hooks.beforeSubmitPrompt.filter(entry => hook.isTopCardCursorCommand(entry.command, path.join(dir, 'harness-plugins', 'cursor', 'hook.cjs')));
    assert.equal(owned.length, 1);
    assert.ok(Array.isArray(config.hooks.beforeShellExecution) && config.hooks.beforeShellExecution.length >= 1);
    assert.ok(Array.isArray(config.hooks.beforeMCPExecution) && config.hooks.beforeMCPExecution.length >= 1);
    assert.match(owned[0].command, /hook\.cjs|TOPCARD_HARNESS_KIND=cursor|EncodedCommand/);
    assert.doesNotMatch(owned[0].command, /^set "/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'harness-plugins', 'cursor', 'hooks', 'hooks.json'), 'utf8')).hooks, {});
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'harness-plugins', 'cursor', 'active.json'), 'utf8')).directory, signalDir);
    const mergedActive = hook.mergeCursorActive({ kind: 'cursor', pending: [signalDir], sessions: { bound: signalDir } }, '/remote/cards/two', 'token-two');
    assert.deepEqual(mergedActive.pending, [signalDir, '/remote/cards/two']);
    assert.equal(mergedActive.sessions.bound, signalDir);
    assert.equal(mergedActive.channels['/remote/cards/two'], 'token-two');
    fs.writeFileSync(configPath, '[]');
    await assert.rejects(hook.prepareHookLaunch('cursor', signalDir, { kind: 'local' }, 'three'), /Invalid Cursor hooks/);
  } finally {
    if (previous === undefined) delete process.env.TOPCARD_CURSOR_HOOKS;
    else process.env.TOPCARD_CURSOR_HOOKS = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('Antigravity custom data directory can launch twice without replacing foreign hooks', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topcard-hook-regression-'));
  try {
    const hook = load('lib/harness/hook-launch.ts', { './inherited-config': {}, './hook-contract': hookContract, 'node:os': { homedir: () => dir }, '../ssh-workspace': { shellQuote: quote }, '../node-runtime': { embeddedNodeExecutable: () => process.execPath } });
    const signalDir = path.join(dir, 'custom data', 'harness-signals', 'one');
    await hook.prepareHookLaunch('antigravity', signalDir, { kind: 'local' }, 'one');
    await hook.prepareHookLaunch('antigravity', signalDir, { kind: 'local' }, 'two');
    const configPath = path.join(dir, '.gemini/config/hooks.json');
    const foreign = { 'topcard-session-state': { Stop: [{ command: 'echo foreign' }] }, other: { enabled: true } };
    fs.writeFileSync(configPath, JSON.stringify(foreign));
    await assert.rejects(hook.prepareHookLaunch('antigravity', signalDir, { kind: 'local' }, 'three'), /同名/);
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath)), foreign);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('remote Codex installs stable session hooks and real helper output delivers identity and state', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topcard-remote-hook-'));
  try {
    const sshExec = async (_host, command) => {
      if (command === 'printf "%s" "$HOME"') return Buffer.from(dir);
      if (command === 'command -v node') return Buffer.from(process.execPath);
      return execFileSync('/bin/sh', ['-c', command]);
    };
    const hook = load('lib/harness/hook-launch.ts', { './inherited-config': {}, './hook-contract': hookContract, '../ssh-workspace': { shellQuote: quote, sshExec, sshLoginExec: sshExec }, '../node-runtime': { embeddedNodeExecutable: () => process.execPath } });
    const workspace = { kind: 'ssh', sshHost: 'fixture' };
    const one = await hook.prepareHookLaunch('codex', '/unused', workspace, 'token-one');
    const two = await hook.prepareHookLaunch('codex', '/unused', workspace, 'token-two');
    assert.equal(JSON.stringify(one.args), JSON.stringify(two.args));
    assert.ok(one.args.includes('hooks'));
    assert.ok(!one.args.some(arg => arg.includes('bypass')));
    const config = one.args.find(arg => arg.startsWith('hooks.SessionStart='));
    const command = JSON.parse(config.match(/command=("(?:\\.|[^"\\])*"),timeout/)[1]);
    const tty = path.join(dir, 'tty');
    let state = { state: 'starting', at: 0 };
    const receive = createHookOscProbe('token-one', signal => { state = observeHook(state, signal); });
    for (const [event, expected] of [['SessionStart','attention'], ['UserPromptSubmit','working'], ['PermissionRequest','attention'], ['PostToolUse','working'], ['Stop','attention']]) {
      const output = execFileSync('/bin/sh', ['-c', command], { input: JSON.stringify({ hook_event_name: event, session_id: full }), env: { ...process.env, ...one.env, TOPCARD_HARNESS_TTY: tty } });
      assert.equal(output.length, 0);
      const bytes = fs.readFileSync(tty, 'utf8');
      for (let i = 0; i < bytes.length; i += 7) receive(bytes.slice(i, i + 7));
      assert.equal(state.sessionId, full);
      assert.equal(state.state, expected);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('remote Cursor shares plugin active.json and maps OSC channels per card', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topcard-remote-cursor-'));
  try {
    const sshExec = async (_host, command) => {
      if (command === 'printf "%s" "$HOME"') return Buffer.from(dir);
      if (command === 'command -v node') return Buffer.from(process.execPath);
      return execFileSync('/bin/sh', ['-c', command]);
    };
    const hook = load('lib/harness/hook-launch.ts', { './inherited-config': {}, './hook-contract': hookContract, '../ssh-workspace': { shellQuote: quote, sshExec, sshLoginExec: sshExec }, '../node-runtime': { embeddedNodeExecutable: () => process.execPath } });
    const workspace = { kind: 'ssh', sshHost: 'fixture' };
    await hook.prepareHookLaunch('cursor', '/unused-one', workspace, 'card-one');
    await hook.prepareHookLaunch('cursor', '/unused-two', workspace, 'card-two');
    const plugin = path.join(dir, '.cache', 'topcard', 'harness-plugins', 'cursor');
    const active = JSON.parse(fs.readFileSync(path.join(plugin, 'active.json'), 'utf8'));
    assert.deepEqual(active.pending, [`${plugin}/cards/card-one`, `${plugin}/cards/card-two`]);
    assert.equal(active.channels[`${plugin}/cards/card-one`], 'card-one');
    assert.equal(active.channels[`${plugin}/cards/card-two`], 'card-two');
    assert.match(fs.readFileSync(path.join(plugin, 'hook.cjs'), 'utf8'), /beforeShellExecution/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

async function queueFixture(work) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topcard-launch-regression-'));
  const old = process.env.TOPCARD_QUEUE_FILE;
  process.env.TOPCARD_QUEUE_FILE = path.join(dir, 'queue.json');
  fs.writeFileSync(process.env.TOPCARD_QUEUE_FILE, JSON.stringify({ version: 1, revision: 0, cards: [{ id: 'one', cwd: dir, workspaceId: 'w', session: null, phase: 'draft', createdAt: 1 }], order: [], workspaces: [{ id: 'w', name: 'test', cwd: dir, runtimeCwd: dir, kind: 'local' }] }));
  try { await work(); } finally {
    if (old === undefined) delete process.env.TOPCARD_QUEUE_FILE; else process.env.TOPCARD_QUEUE_FILE = old;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
test('pending launch leaves queue readable, rejects duplicate launch and commits once', () => queueFixture(async () => {
  const started = deferred(), gate = deferred(); const killed = [];
  const deps = { sync: async () => {}, kill: id => killed.push(id), launch: async () => { started.resolve(); await gate.promise; return { kind: 'pi', terminalId: 'new', state: 'starting' }; } };
  const launch = launchCardHarness('one', 'harness_start', 'pi', deps);
  await started.promise;
  try {
    await assert.rejects(launchCardHarness('one', 'harness_start', 'pi', deps), /正在启动/);
    // If preflight still owns the global lock this times out; release in finally.
    await Promise.race([withCardQueue(state => { state.cards[0].priorityWeight = 7; }), new Promise((_, reject) => { const t = setTimeout(() => reject(Error('queue blocked')), 500); t.unref(); })]);
  } finally { gate.resolve(); }
  const result = await launch;
  assert.equal(result.cards[0].harness.terminalId, 'new');
  assert.equal(result.cards[0].priorityWeight, 7);
  assert.deepEqual(result.order, ['one']); assert.deepEqual(killed, []);
}));
test('card deletion during preflight rejects commit and disposes the orphan terminal', () => queueFixture(async () => {
  const started = deferred(), gate = deferred(); const killed = [];
  const launch = launchCardHarness('one', 'harness_start', 'pi', { sync: async () => {}, kill: id => killed.push(id), launch: async () => { started.resolve(); await gate.promise; return { kind: 'pi', terminalId: 'orphan', state: 'starting' }; } });
  await started.promise;
  await withCardQueue(state => { state.cards = []; }); gate.resolve();
  await assert.rejects(launch, /已变更/);
  assert.deepEqual(killed, ['orphan']);
}));
test('failed queue persistence cleans up new PTY and releases the launch reservation', () => queueFixture(async () => {
  const killed = [];
  let calls = 0;
  const temporary = `${process.env.TOPCARD_QUEUE_FILE}.${process.pid}.tmp`;
  const deps = { sync: async () => { if (++calls === 2) fs.mkdirSync(temporary); }, kill: id => killed.push(id), launch: async () => ({ kind: 'pi', terminalId: 'new', state: 'starting' }) };
  await assert.rejects(launchCardHarness('one', 'harness_start', 'pi', deps), /EISDIR/);
  assert.deepEqual(killed, ['new']);
  fs.rmdirSync(temporary);
  const result = await launchCardHarness('one', 'harness_start', 'pi', deps);
  assert.equal(result.cards[0].harness.terminalId, 'new');
}));
test('remote Codex launch passes hook configuration and token to its SSH PTY', async () => {
  let prepared = false, spawned;
  const mocks = Object.fromEntries(['./windows-command','./bundled-pi','./local-environment','./shell-launch','./shell-probe','./codex','../terminal-transcript','./codex-title','./signals','../card-queue-live'].map(k => [k, {}]));
  mocks['./shell-probe'] = { createShellProbe: () => () => {} };
  mocks['./hook-osc'] = { createHookOscProbe: () => () => {} };
  mocks['./hook-launch'] = { prepareHookLaunch: async (_kind, _directory, _workspace, token) => { prepared = true; return { args: ['--enable', 'hooks'], env: { TOPCARD_HARNESS_CHANNEL: token } }; } };
  mocks['./registry'] = { getHarnessAdapter: () => ({ id: 'codex', executable: 'codex', args: [], createProbe: () => ({ push() {} }) }) };
  mocks['../ssh-connection'] = { connectionArgs: async () => ['-tt', 'host'] };
  mocks['../ssh-workspace'] = { shellQuote: quote, sshLoginExec: async () => Buffer.from('codex-cli 0.154.0'), sshLoginCommand: command => `login-shell ${command}` };
  mocks['../terminal-manager'] = { createTerminal: (...args) => { spawned = args; } };
  mocks['./hook-contract'] = hookContract;
  const runtime = load('lib/harness/runtime.ts', mocks);
  const result = await runtime.launchHarness('codex', { kind: 'ssh', sshHost: 'host', cwd: '/remote', runtimeCwd: '/local' });
  assert.equal(prepared, true);
  assert.equal(spawned[4].executable, 'ssh');
  assert.ok(spawned[4].args.at(-1).startsWith('login-shell '));
  assert.ok(spawned[4].args.at(-1).includes("'--enable' 'hooks'"));
  assert.ok(spawned[4].args.at(-1).includes('TOPCARD_HARNESS_TTY=$(tty)'));
  assert.equal(spawned[4].env.TOPCARD_HARNESS_CHANNEL, result.terminalId);
});
test('changed workspace rejects a stale launch; failed resume retains the original session', () => queueFixture(async () => {
  const killed = [];
  const started = deferred(), gate = deferred();
  const launch = launchCardHarness('one', 'harness_start', 'pi', { sync: async () => {}, kill: id => killed.push(id), launch: async () => { started.resolve(); await gate.promise; return { kind: 'pi', terminalId: 'stale', state: 'starting' }; } });
  await started.promise;
  await withCardQueue(state => { state.workspaces[0].cwd = '/another'; }); gate.resolve();
  await assert.rejects(launch, /已变更/);
  assert.deepEqual(killed, ['stale']);
  await withCardQueue(state => { state.cards[0].harness = { kind: 'codex', terminalId: 'old', state: 'exited', providerSessionId: full }; state.cards[0].archivedAt = 123; });
  await assert.rejects(launchCardHarness('one', 'harness_resume', undefined, { sync: async () => {}, kill: id => killed.push(id), launch: async () => { throw Error('SSH unavailable'); } }), /SSH unavailable/);
  await withCardQueue(state => {
    assert.equal(state.cards[0].harness.terminalId, 'old');
    assert.equal(state.cards[0].harness.providerSessionId, full);
    assert.equal(state.cards[0].archivedAt, 123);
  });
  assert.deepEqual(killed, ['stale']);
}));
