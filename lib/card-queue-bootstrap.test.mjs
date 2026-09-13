import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EMPTY_QUEUE } from './card-queue.ts';
import { readCardQueueSnapshot, withCardQueue } from './card-queue-store.ts';

test('bootstrap reads the committed board while live reconciliation holds the queue lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'topcard-bootstrap-'));
  const previous = process.env.TOPCARD_QUEUE_FILE;
  process.env.TOPCARD_QUEUE_FILE = join(root, 'queue.json');
  let release, entered, writer, timer;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  try {
    await writeFile(process.env.TOPCARD_QUEUE_FILE, JSON.stringify({ ...EMPTY_QUEUE, revision: 7 }));
    writer = withCardQueue(async state => { entered(); await gate; state.revision = 8; });
    await started;
    const snapshot = await Promise.race([
      readCardQueueSnapshot(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('bootstrap waited for reconciliation')), 1000); }),
    ]);
    assert.equal(snapshot.revision, 7);
    release();
    await writer;
    assert.equal((await readCardQueueSnapshot()).revision, 9);
  } finally {
    clearTimeout(timer);
    release();
    await writer;
    if (previous === undefined) delete process.env.TOPCARD_QUEUE_FILE;
    else process.env.TOPCARD_QUEUE_FILE = previous;
    await rm(root, { recursive: true, force: true });
  }
});
