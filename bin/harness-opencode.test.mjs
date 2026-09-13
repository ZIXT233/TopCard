import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TopCardState } from './harness-opencode.mjs';

function readSignals(dir) {
  return fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort()
    .map(file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
}

test('message IDs never block session idle and same-millisecond signals preserve order', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topcard-hook-test-'));
  const old = process.env.TOPCARD_HARNESS_SIGNAL_DIR;
  const now = Date.now;
  process.env.TOPCARD_HARNESS_SIGNAL_DIR = dir;
  Date.now = () => 1000;
  try {
    const queried = [];
    const hook = await TopCardState({
      client: {
        session: {
          get: async ({ path: { id } }) => {
            queried.push(id);
            return { data: { id, title: 'Example' } };
          },
        },
      },
    });
    await hook['chat.message']({ sessionID: 'root' });
    await hook.event({ event: { type: 'message.updated', properties: { info: { id: 'message-id', sessionID: 'root' } } } });
    await hook.event({ event: { type: 'session.idle', properties: { sessionID: 'root' } } });
    assert.deepEqual(queried, ['root']);
    const signals = readSignals(dir);
    assert.deepEqual(signals.map(s => s.event), ['UserPromptSubmit', 'Stop']);
    assert.equal(signals[0].kind, 'opencode');
    assert.ok(signals[1].at > signals[0].at);
  } finally {
    Date.now = now;
    if (old === undefined) delete process.env.TOPCARD_HARNESS_SIGNAL_DIR;
    else process.env.TOPCARD_HARNESS_SIGNAL_DIR = old;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('status events still complete when session.get fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topcard-opencode-fallback-'));
  const old = process.env.TOPCARD_HARNESS_SIGNAL_DIR;
  process.env.TOPCARD_HARNESS_SIGNAL_DIR = dir;
  try {
    const hook = await TopCardState({
      client: {
        session: {
          get: async () => { throw new Error('unavailable'); },
          messages: async () => ({
            data: [
              { info: { role: 'user' }, parts: [{ type: 'text', text: 'hi' }] },
              { info: { role: 'assistant' }, parts: [{ type: 'text', text: 'OpenCode 已完成' }] },
            ],
          }),
        },
      },
    });
    await hook.event({ event: { type: 'session.status', properties: { sessionID: 's1', status: { type: 'busy' } } } });
    await hook.event({ event: { type: 'session.status', properties: { sessionID: 's1', status: { type: 'idle' } } } });
    const signals = readSignals(dir);
    assert.deepEqual(signals.map(s => s.event), ['UserPromptSubmit', 'Stop']);
    assert.equal(signals[1].replyPreview, 'OpenCode 已完成');
  } finally {
    if (old === undefined) delete process.env.TOPCARD_HARNESS_SIGNAL_DIR;
    else process.env.TOPCARD_HARNESS_SIGNAL_DIR = old;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('session.created marks the card ready before the first prompt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topcard-opencode-start-'));
  const old = process.env.TOPCARD_HARNESS_SIGNAL_DIR;
  process.env.TOPCARD_HARNESS_SIGNAL_DIR = dir;
  try {
    const hook = await TopCardState({ client: { session: { get: async () => ({ data: { id: 'new' } }) } } });
    await hook.event({ event: { type: 'session.created', properties: { info: { id: 'new', title: 'New session' } } } });
    const signals = readSignals(dir);
    assert.equal(signals[0].event, 'SessionStart');
    assert.equal(signals[0].title, 'New session');
  } finally {
    if (old === undefined) delete process.env.TOPCARD_HARNESS_SIGNAL_DIR;
    else process.env.TOPCARD_HARNESS_SIGNAL_DIR = old;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
