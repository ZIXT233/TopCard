import test from 'node:test';
import assert from 'node:assert/strict';
import { inheritForkTurn } from './fork-turn.ts';
import { DEFAULT_TURN_TAGS, sortedQueue, resolveQueueFocus } from './turn-priority.ts';

const rules = { type: 'custom_message', customType: 'topcard:turn-tag-rules', details: { definitions: DEFAULT_TURN_TAGS } };
const reply = (id, tags) => ({ type: 'message', id, message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: `Reply\n<turn_tags>${JSON.stringify({tags})}</turn_tags>` }] } });
const card = id => ({ id, session: { id }, cwd: '/tmp', phase: 'attention', createdAt: 1000 });

test('a fork inherits its retained reply tags and starts a new waiting clock', () => {
  const fork = card('fork');
  inheritForkTurn(fork, [rules, reply('older-turn', ['🧩 Easy'])], 2000);
  assert.deepEqual(fork.turnTags, ['🧩 Easy']);
  assert.equal(fork.turnKey, 'older-turn');
  assert.equal(fork.waitingSince, 2000);
  const parent = {...card('parent'), priorityWeight: 555, turnTags: []};
  const low = {...card('low'), priorityWeight: 1};
  const queue = { cards: [parent, fork, low], order: ['fork', 'low', 'parent'], sortMode: 'score' };
  const ranked = sortedQueue(queue, 2000);
  assert.deepEqual(ranked.map(c => c.id), ['parent', 'fork', 'low']);
  assert.equal(resolveQueueFocus(ranked, fork.id), 1);
});

test('fork metadata follows historical definitions and does not borrow another turn', () => {
  const fork = card('fork');
  const historicalRules = {...rules, details: { definitions: [{name:'Old tag',weight:4,description:'Old definition'}] }};
  inheritForkTurn(fork, [historicalRules, reply('old', ['Old tag']), rules], 2000);
  assert.deepEqual(fork.turnTags, ['Old tag']);
  const noReply = card('empty');
  inheritForkTurn(noReply, [rules, {type:'message', id:'user', message:{role:'user',content:'hello'}}]);
  assert.equal(noReply.turnTags, undefined);
  const invalid = card('invalid');
  inheritForkTurn(invalid, [rules, reply('bad', ['Unknown'])]);
  assert.equal(invalid.tagEvaluation.status, 'error');
  assert.deepEqual(invalid.turnTags, []);
});
