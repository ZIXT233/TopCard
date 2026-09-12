import test from 'node:test';
import assert from 'node:assert/strict';
import { markQueueCardWorking, mergeQueueSnapshot } from './card-queue-snapshot.ts';
const snapshot = () => ({revision: 2, order:['a','b'], cards:[{id:'a',phase:'attention',session:{id:'s'}},{id:'b',phase:'attention',session:null}]});
test('identical polls preserve the entire snapshot and stale revisions are ignored', () => {
 const previous=snapshot();
 assert.equal(mergeQueueSnapshot(previous,structuredClone(previous)),previous);
 assert.equal(mergeQueueSnapshot(previous,{...snapshot(),revision:1}),previous);
});
test('new revisions retain unchanged card identities while adopting changed sessions', () => {
 const previous=snapshot(); const next=structuredClone(previous); next.revision++;
 next.cards[1].phase='working';
 const result=mergeQueueSnapshot(previous,next);
 assert.equal(result.cards[0],previous.cards[0]);
 assert.equal(result.cards[1],next.cards[1]);
 assert.equal(result.revision,3);
});
test('same-revision authoritative data can reconcile optimistic state and removals', () => {
 const previous=snapshot(); const next=structuredClone(previous); next.cards.shift(); next.order=['b'];
 const result=mergeQueueSnapshot(previous,next);
 assert.deepEqual(result,next);
 assert.equal(result.cards[0],previous.cards[1]);
});

test('an accepted fresh session leaves the deck before its durable attachment completes', () => {
 const queue={revision:2,order:['draft','ready'],cards:[
  {id:'draft',phase:'draft',session:null,readyAt:10,waitingSince:10,turnKey:'old'},
  {id:'ready',phase:'attention',session:{id:'existing'}},
 ]};
 const session={id:'fresh',cwd:'/workspace',messageCount:1,firstMessage:'hello'};
 const result=markQueueCardWorking(queue,'draft',session);
 assert.deepEqual(result.order,['ready']);
 assert.equal(result.cards[0].phase,'working');
 assert.equal(result.cards[0].session,session);
 assert.equal(result.cards[0].readyAt,undefined);
 assert.equal(result.cards[0].waitingSince,undefined);
 assert.equal(result.cards[0].turnKey,undefined);
});

test('a submitted draft can enter working before it has a session id', () => {
 const queue={revision:2,order:[],cards:[{id:'draft',phase:'draft',session:null}]};
 const result=markQueueCardWorking(queue,'draft');
 assert.equal(result.cards[0].phase,'working');
 assert.equal(result.cards[0].session,null);
 assert.equal(markQueueCardWorking(queue,'missing'),queue);
});

test('waiting scores schedule their own next boundary without a changed snapshot', async () => {
 const { nextQueueScoreChange } = await import('./card-queue-snapshot.ts');
 const queue = {...snapshot(),sortMode:'score',cards:[{id:'a',phase:'attention',readyAt:1000},{id:'b',phase:'attention',readyAt:3000}]};
 assert.equal(nextQueueScoreChange(queue,60_000),61_000);
 assert.equal(nextQueueScoreChange(queue,61_000),63_000);
 assert.equal(nextQueueScoreChange(queue,6_000_000),null);
 assert.equal(nextQueueScoreChange({...queue,sortMode:'fifo'},60_000),null);
 assert.equal(nextQueueScoreChange({...queue,cards:[{...queue.cards[0],phase:'working'}]},60_000),null);
});
