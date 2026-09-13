import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, mkdir, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJiti } from 'jiti';

async function waitForSignal(directory, timeoutMs = 3000, match) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const files = (await readdir(directory).catch(() => [])).filter(name => name.endsWith('.json'));
    for (const file of files) {
      const signal = JSON.parse(await readFile(join(directory, file), 'utf8'));
      if (!match || match(signal)) return signal;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('hook signal was not written');
}

async function clearSignals(directory) {
  for (const file of (await readdir(directory).catch(() => [])).filter(name => name.endsWith('.json'))) {
    await rm(join(directory, file), { force: true });
  }
}

test('helper records complete JSON before stdin ends and without inherited signal env', async () => {
  const root = await mkdtemp(join(tmpdir(), 'topcard-hook-helper-'));
  try {
    const directory = join(root, 'signals');
    await mkdir(directory);
    const hook = join(root, 'hook.cjs');
    await writeFile(hook, await readFile(new URL('../bin/harness-hook.cjs', import.meta.url)));
    await writeFile(join(root, 'active.json'), JSON.stringify({ directory }));
    const env = { ...process.env, TOPCARD_HARNESS_KIND: 'cursor' };
    delete env.TOPCARD_HARNESS_SIGNAL_DIR;
    delete env.TOPCARD_HARNESS_CHANNEL;
    const child = spawn(process.execPath, [hook, 'beforeSubmitPrompt'], { env, windowsHide: true });
    const stdout = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    const closed = new Promise((resolve, reject) => child.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    child.stdin.end(JSON.stringify({ conversation_id: 'live-session', prompt: '发送' }));
    const signal = await waitForSignal(directory);
    assert.equal(signal.event, 'beforeSubmitPrompt');
    assert.equal(signal.sessionId, 'live-session');
    await closed;
    assert.deepEqual(JSON.parse(Buffer.concat(stdout).toString()), { continue: true });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Cursor afterAgentResponse writes replyPreview before answering JSON', async () => {
  const root = await mkdtemp(join(tmpdir(), 'topcard-hook-reply-'));
  try {
    const directory = join(root, 'signals');
    await mkdir(directory);
    const hook = join(root, 'hook.cjs');
    await writeFile(hook, await readFile(new URL('../bin/harness-hook.cjs', import.meta.url)));
    await writeFile(join(root, 'active.json'), JSON.stringify({ directory }));
    const env = { ...process.env, TOPCARD_HARNESS_KIND: 'cursor' };
    delete env.TOPCARD_HARNESS_SIGNAL_DIR;
    const child = spawn(process.execPath, [hook, 'afterAgentResponse'], { env, windowsHide: true });
    const stdout = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    const closed = new Promise((resolve, reject) => child.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    child.stdin.end(JSON.stringify({ conversation_id: 'reply-session', text: '任务已完成' }));
    const signal = await waitForSignal(directory);
    assert.equal(signal.event, 'afterAgentResponse');
    assert.equal(signal.replyPreview, '任务已完成');
    await closed;
    assert.deepEqual(JSON.parse(Buffer.concat(stdout).toString()), {});
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Cursor stop also accepts text as replyPreview', async () => {
  const root = await mkdtemp(join(tmpdir(), 'topcard-hook-stop-'));
  try {
    const directory = join(root, 'signals');
    await mkdir(directory);
    const hook = join(root, 'hook.cjs');
    await writeFile(hook, await readFile(new URL('../bin/harness-hook.cjs', import.meta.url)));
    const child = spawn(process.execPath, [hook, 'stop'], {
      env: { ...process.env, TOPCARD_HARNESS_KIND: 'cursor', TOPCARD_HARNESS_SIGNAL_DIR: directory },
      windowsHide: true,
    });
    const closed = new Promise(resolve => child.on('close', resolve));
    child.stdin.end(JSON.stringify({ conversation_id: 'stop-session', text: 'from stop' }));
    const signal = await waitForSignal(directory);
    assert.equal(signal.event, 'stop');
    assert.equal(signal.replyPreview, 'from stop');
    await closed;
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Cursor pending active.json ignores foreign prompts and claims on sessionStart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'topcard-hook-route-'));
  try {
    const card = join(root, 'signals', 'card');
    const other = join(root, 'signals', 'other');
    await mkdir(card, { recursive: true });
    await mkdir(other, { recursive: true });
    const hook = join(root, 'hook.cjs');
    await writeFile(hook, await readFile(new URL('../bin/harness-hook.cjs', import.meta.url)));
    await writeFile(join(root, 'active.json'), JSON.stringify({
      kind: 'cursor',
      directory: card,
      pending: [card],
      sessions: {},
    }));
    const env = { ...process.env, TOPCARD_HARNESS_KIND: 'cursor' };
    delete env.TOPCARD_HARNESS_SIGNAL_DIR;
    delete env.TOPCARD_HARNESS_CHANNEL;
    const foreign = spawn(process.execPath, [hook, 'beforeSubmitPrompt'], { env, windowsHide: true });
    foreign.stdout.resume();
    const foreignClosed = new Promise((resolve, reject) => foreign.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    foreign.stdin.end(JSON.stringify({ conversation_id: 'npm-install', prompt: 'npm install -g @anthropic-ai/claude-code 怎么不行' }));
    await foreignClosed;
    assert.deepEqual((await readdir(card)).filter(name => name.endsWith('.json')), []);

    const start = spawn(process.execPath, [hook, 'sessionStart'], { env, windowsHide: true });
    start.stdout.resume();
    const startClosed = new Promise((resolve, reject) => start.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    start.stdin.end(JSON.stringify({ conversation_id: 'fresh-card' }));
    const signal = await waitForSignal(card, 3000, item => item.event === 'sessionStart' && item.sessionId === 'fresh-card');
    assert.equal(signal.sessionId, 'fresh-card');
    await startClosed;
    const active = JSON.parse(await readFile(join(root, 'active.json'), 'utf8'));
    assert.equal(active.sessions['fresh-card'], card);
    assert.deepEqual(active.pending, []);

    await clearSignals(card);
    const prompt = spawn(process.execPath, [hook, 'beforeSubmitPrompt'], { env, windowsHide: true });
    prompt.stdout.resume();
    const promptClosed = new Promise((resolve, reject) => prompt.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    prompt.stdin.end(JSON.stringify({ conversation_id: 'fresh-card', prompt: 'hello' }));
    await waitForSignal(card, 3000, item => item.event === 'beforeSubmitPrompt');
    await promptClosed;

    await writeFile(join(root, 'active.json'), JSON.stringify({
      kind: 'cursor',
      directory: other,
      pending: [other],
      sessions: { 'fresh-card': card },
    }));
    await clearSignals(card);
    const again = spawn(process.execPath, [hook, 'stop'], { env, windowsHide: true });
    again.stdout.resume();
    again.stderr.resume();
    const againClosed = new Promise((resolve, reject) => again.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    again.stdin.end(JSON.stringify({ conversation_id: 'fresh-card', text: 'done' }));
    await againClosed;
    const stop = await waitForSignal(card, 3000, item => item.event === 'stop');
    assert.equal(stop.replyPreview, 'done');
    assert.deepEqual((await readdir(other)).filter(name => name.endsWith('.json')), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Cursor always answers JSON when stdin fails, times out, or is oversized', async () => {
  const root = await mkdtemp(join(tmpdir(), 'topcard-hook-finish-'));
  try {
    const hook = join(root, 'hook.cjs');
    await writeFile(hook, await readFile(new URL('../bin/harness-hook.cjs', import.meta.url)));
    const env = { ...process.env, TOPCARD_HARNESS_KIND: 'cursor', TOPCARD_HARNESS_SIGNAL_DIR: root };

    for (const [event, reply] of [['beforeSubmitPrompt', { continue: true }], ['beforeShellExecution', { permission: 'ask' }]]) {
      const child = spawn(process.execPath, [hook, event], { env, windowsHide: true });
      const stdout = [];
      child.stdout.on('data', chunk => stdout.push(chunk));
      const closed = new Promise((resolve, reject) => child.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      child.stdin.end('{');
      await closed;
      assert.deepEqual(JSON.parse(Buffer.concat(stdout).toString()), reply);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Cursor shell and MCP permission hooks ask and never allow', async () => {
  const root = await mkdtemp(join(tmpdir(), 'topcard-hook-ask-'));
  try {
    const directory = join(root, 'signals');
    await mkdir(directory);
    const hook = join(root, 'hook.cjs');
    await writeFile(hook, await readFile(new URL('../bin/harness-hook.cjs', import.meta.url)));
    for (const event of ['beforeShellExecution', 'beforeMCPExecution']) {
      await clearSignals(directory);
      const child = spawn(process.execPath, [hook, event], {
        env: { ...process.env, TOPCARD_HARNESS_KIND: 'cursor', TOPCARD_HARNESS_SIGNAL_DIR: directory },
        windowsHide: true,
      });
      const stdout = [];
      child.stdout.on('data', chunk => stdout.push(chunk));
      const closed = new Promise((resolve, reject) => child.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      child.stdin.end(JSON.stringify({ conversation_id: 'perm-session', command: 'ls' }));
      const signal = await waitForSignal(directory, 3000, item => item.event === event);
      assert.equal(signal.sessionId, 'perm-session');
      await closed;
      const reply = JSON.parse(Buffer.concat(stdout).toString());
      assert.deepEqual(reply, { permission: 'ask' });
      assert.notEqual(reply.permission, 'allow');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Windows Cursor user hooks invoke node directly so the helper can write signals', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'topcard-cursor-direct-'));
  const previous = process.env.TOPCARD_CURSOR_HOOKS;
  try {
    process.env.TOPCARD_CURSOR_HOOKS = join(root, 'hooks.json');
    const directory = join(root, 'signals', 'one');
    const { prepareHookLaunch } = await createJiti(import.meta.url).import('./harness/hook-launch.ts');
    await prepareHookLaunch('cursor', directory, { kind: 'local' }, 'direct');
    const command = JSON.parse(await readFile(process.env.TOPCARD_CURSOR_HOOKS, 'utf8')).hooks.beforeSubmitPrompt[0].command;
    assert.doesNotMatch(command, /EncodedCommand|powershell|set "|TOPCARD_HARNESS_SIGNAL_DIR/i);
    assert.match(command, /hook\.cjs/);
    assert.match(command, /beforeSubmitPrompt/);
    assert.equal(JSON.parse(await readFile(join(root, 'harness-plugins', 'cursor', 'active.json'), 'utf8')).directory, directory);
    assert.deepEqual(JSON.parse(await readFile(join(root, 'harness-plugins', 'cursor', 'active.json'), 'utf8')).pending, [directory]);
  } finally {
    if (previous === undefined) delete process.env.TOPCARD_CURSOR_HOOKS;
    else process.env.TOPCARD_CURSOR_HOOKS = previous;
    await rm(root, { recursive: true, force: true });
  }
});
