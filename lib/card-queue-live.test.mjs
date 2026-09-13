import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  ensureQueueLiveWatch,
  notifyQueueChanged,
  resetQueueLiveForTests,
  subscribeQueueLive,
} from './card-queue-live.ts';
import { queueFallbackPollMs } from './card-queue-snapshot.ts';

test('live fallback polling is slower than the offline 1.2s scan', () => {
  assert.equal(queueFallbackPollMs(true, true), 8000);
  assert.equal(queueFallbackPollMs(false, true), 20000);
  assert.equal(queueFallbackPollMs(true, false), 1200);
  assert.equal(queueFallbackPollMs(false, false), 3000);
});

test('queue live subscribers receive one event per burst', async () => {
  resetQueueLiveForTests();
  const seen = [];
  const stop = subscribeQueueLive(reason => seen.push(reason));
  try {
    notifyQueueChanged('hook');
    notifyQueueChanged('queue');
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.deepEqual(seen, ['queue']);
  } finally {
    stop();
    resetQueueLiveForTests();
  }
});

test('writing a harness signal file notifies live subscribers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'topcard-queue-live-'));
  const previous = process.env.TOPCARD_DATA_DIR;
  process.env.TOPCARD_DATA_DIR = root;
  resetQueueLiveForTests();
  const seen = [];
  const stop = subscribeQueueLive(reason => seen.push(reason));
  try {
    await ensureQueueLiveWatch();
    const directory = join(root, 'harness-signals', 'one');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${Date.now()}-00000000-0000-4000-8000-000000000001.json`), '{"event":"beforeSubmitPrompt"}');
    const deadline = Date.now() + 1000;
    while (!seen.includes('hook') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(seen.includes('hook'));
  } finally {
    stop();
    resetQueueLiveForTests();
    if (previous === undefined) delete process.env.TOPCARD_DATA_DIR;
    else process.env.TOPCARD_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('the queue hook uses SSE and keeps a slow fallback poll', () => {
  const source = readFileSync(new URL('../hooks/useCardQueue.ts', import.meta.url), 'utf8');
  assert.match(source, /EventSource\("\/api\/card-queue\/events"\)/);
  assert.match(source, /queueFallbackPollMs/);
});
