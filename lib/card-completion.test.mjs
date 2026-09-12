import test from 'node:test';
import assert from 'node:assert/strict';
import { completedCards } from './card-completion.ts';
const working = { id: 'a', phase: 'working', session: { id: 's' } };
const done = { ...working, phase: 'attention', readyAt: 42 };
test('only reports a working card becoming ready, never initial or repeated snapshots', () => {
  assert.deepEqual(completedCards(null, [done]), []);
  assert.deepEqual(completedCards([working], [done]), [done]);
  assert.deepEqual(completedCards([done], [{ ...done, turnTags: ['important'] }]), []);
  assert.deepEqual(completedCards([], [done]), []);
});
test('excludes archived cards and subagents', () => {
  assert.deepEqual(completedCards([working], [{ ...done, archivedAt: 10 }]), []);
  assert.deepEqual(completedCards([working], [{ ...done, session: { id: 's', relation: { kind: 'subagent' } } }]), []);
});
