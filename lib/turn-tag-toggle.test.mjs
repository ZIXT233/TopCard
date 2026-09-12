import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withCardQueue } from './card-queue-store.ts';
import { injectTurnTagRules, recordQueueTurn } from './turn-tag-evaluation.ts';
import { DEFAULT_TURN_TAGS, sortedQueue } from './turn-priority.ts';
import { normalizeToolCalls } from './normalize.ts';

test('disabled queues skip new rules, cancel existing rules once, suppress results and preserve score sorting',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'turn-tags-'));
 const previous=process.env.TOPCARD_QUEUE_FILE;
 process.env.TOPCARD_QUEUE_FILE=join(directory,'queue.json');
 const messages=[];
 const inner={sessionId:'s',sessionManager:{getCwd:()=>'/test',buildSessionContext:()=>({messages})},sendCustomMessage:async message=>{messages.push({role:'custom',...message});}};
 try {
  await withCardQueue(state=>{state.cards=[{id:'c',cwd:'/test',session:{id:'s'},phase:'attention',createdAt:0}];state.order=['c'];state.turnTagsEnabled=false;});
  await injectTurnTagRules(inner);assert.equal(messages.length,0);
  await withCardQueue(state=>{state.turnTagsEnabled=true;});
  await injectTurnTagRules(inner);await injectTurnTagRules(inner);
  assert.equal(messages.length,1);assert.equal(messages[0].display,true);assert.equal(messages[0].details.change,'enabled');
  await withCardQueue(state=>{state.turnTagDefinitions[0].description+=' changed';});
  await injectTurnTagRules(inner);assert.equal(messages[1].details.change,'updated');
  await withCardQueue(state=>{state.turnTagsEnabled=false;});
  await injectTurnTagRules(inner);await injectTurnTagRules(inner);
  assert.equal(messages.length,3);assert.equal(messages[2].details.enabled,false);
  await recordQueueTurn('s','turn','Reply <turn_tags>{"tags":["🧩 Easy"]}</turn_tags>',DEFAULT_TURN_TAGS);
  const state=await withCardQueue(state=>state);
  assert.equal(state.sortMode,'score');assert.equal(state.cards[0].tagEvaluation,undefined);
  const urgent={...state.cards[0],id:'urgent',turnKey:'x',turnTags:['🚨 Urgent Call'],urgentCall:{}};
  assert.deepEqual(sortedQueue({...state,cards:[...state.cards,urgent],order:['c','urgent']}).map(card=>card.id),['urgent','c']);
  const weighted={...state.cards[0],id:'weighted',priorityWeight:50};
  assert.deepEqual(sortedQueue({...state,cards:[...state.cards,weighted],order:['c','weighted']},0).map(card=>card.id),['weighted','c']);
  await withCardQueue(state=>{state.turnTagsEnabled=true;state.sortMode='fifo';});
  await injectTurnTagRules(inner);assert.equal(messages.length,3);
  await withCardQueue(state=>{state.sortMode='score';});
  await injectTurnTagRules(inner);assert.equal(messages.length,4);assert.equal(messages[3].details.enabled,true);
 } finally {if(previous===undefined) delete process.env.TOPCARD_QUEUE_FILE;else process.env.TOPCARD_QUEUE_FILE=previous;await rm(directory,{recursive:true,force:true});}
});
test('display normalization retains raw metadata across repeated normalization',()=>{
 const raw='<turn_tags>{"tags":["🧩 Easy"]}</turn_tags>';
 const message={role:'assistant',content:[{type:'text',text:'Hello '+raw}]};
 const normalized=normalizeToolCalls(message);
 assert.equal(normalized.content[0].text,'Hello');assert.equal(normalized.turnTagRaw,raw);
 assert.deepEqual(normalizeToolCalls(normalized),normalized);
 assert.equal(message.content[0].text,'Hello '+raw);
});
