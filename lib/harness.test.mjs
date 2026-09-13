import test from 'node:test';
import assert from 'node:assert/strict';
import { codexAdapter } from './harness/codex.ts';
import { hookState, observeHook, observeTitle } from './harness/signals.ts';
import { reconcileQueue, pinDraft, archiveCard } from './card-queue.ts';
import { completedCards } from './card-completion.ts';

const title = value => `\x1b]0;codex ${value}\x07`;
test('Codex OSC survives every chunk boundary, ignores text, treats command waiting as work', () => {
  for (const status of ['Working','Thinking','Waiting','Ready','[ ! ] Action Required']) {
    const sequence=title(status);
    for(let split=1;split<sequence.length;split++) {
      const probe=codexAdapter.createProbe();
      assert.equal(probe.push(sequence.slice(0,split)),undefined);
      assert.equal(probe.push(sequence.slice(split)), /Ready|Action/.test(status)?'attention':'working');
    }
  }
  const probe=codexAdapter.createProbe();
  assert.equal(probe.push('codex Ready\nWorking\n'),undefined);
  assert.equal(probe.push('\x1b]2;codex Ready\x1b\\'),'attention');
});
test('hooks distinguish human input from tool completion and ignore child stops', () => {
  assert.equal(hookState({event:'PreToolUse',tool:'request_user_input'}),'attention');
  assert.equal(hookState({event:'PermissionRequest'}),'attention');
  assert.equal(hookState({event:'PostToolUse'}),'working');
  assert.equal(hookState({event:'Stop'}),'attention');
  assert.equal(hookState({event:'afterAgentResponse'}),'attention');
  assert.equal(hookState({event:'SessionStart'}),undefined);
  assert.equal(hookState({event:'Stop',agentId:'child'}),undefined);
});
test('stale events and repeated spinner do not undo approval; a new title transition recovers', () => {
  let state=observeTitle({state:'starting',at:0},'working',10);
  state=observeHook(state,{event:'PermissionRequest',at:20,sessionId:'s'});
  state=observeTitle(state,'working',30);
  assert.equal(state.state,'attention');
  state=observeHook(state,{event:'UserPromptSubmit',at:5});
  assert.equal(state.state,'attention');
  state=observeTitle(state,'attention',40);
  state=observeTitle(state,'working',50);
  assert.equal(state.state,'working');
  assert.equal(state.hookSeen,true);
});
test('terminal card survives draft pruning, moves with state, notifies and archives without a Pi session', () => {
  let q={version:1,revision:0,cards:[{id:'cli',session:null,phase:'attention',cwd:'/tmp',createdAt:1,harness:{kind:'codex',state:'attention'}},{id:'draft',session:null,phase:'draft',createdAt:2}],order:['cli']};
  pinDraft(q);assert.equal(q.cards.length,2);
  q.cards[0].harness.state='working';
  q=reconcileQueue(q,new Set(),new Set(),10);assert.equal(q.cards[0].phase,'working');assert.deepEqual(q.order,[]);
  const old=structuredClone(q.cards);
  q.cards[0].harness.state='attention';q=reconcileQueue(q,new Set(),new Set(),20);
  assert.deepEqual(q.order,['cli']);assert.equal(q.cards[0].readyAt,20);assert.equal(completedCards(old,q.cards).length,1);
  archiveCard(q,'cli',30);q=reconcileQueue(q,new Set(),new Set(),40);
  assert.equal(q.cards[0].archivedAt,30);assert.deepEqual(q.order,[]);
});

test('Codex resume targets the captured session, never opens a new session on missing identity', () => {
  const id='01a094e0-ee17-7113-9ba6-b1b16ea0f76d';
  assert.deepEqual(codexAdapter.resumeArgs(id),['resume',id]);
  assert.throws(()=>codexAdapter.resumeArgs(''),/无法续接/);
  const probe=codexAdapter.createProbe();
  probe.push(title(`Ready | ${id}`));
  assert.equal(probe.sessionId,id);
});

test('truncated Codex identities track in-terminal session changes without matching project names', () => {
  const p=codexAdapter.createProbe();
  assert.equal(p.push('\x1b]0;Reply with Ready | topcard-codex-smoke\x07'),undefined);
  assert.equal(p.push(title('Ready | 01a094e0-ee17-7113-9ba6-b1b16...')),'attention');
  assert.equal(p.sessionIdPrefix,'01a094e0-ee17-7113-9ba6-b1b16');
  p.push(title('Ready | 01a094e7-1643-7d83-bb25-f8c33...'));
  assert.equal(p.sessionIdPrefix,'01a094e7-1643-7d83-bb25-f8c33');
  assert.equal(p.sessionId,undefined);
  const current={state:'attention',at:30,sessionId:'new',identityAt:30};
  assert.equal(observeHook(current,{event:'Stop',at:20,sessionId:'old'}).sessionId,'new');
});

test('Codex exit identity accepts terminal cleanup, not ordinary conversation text', async () => {
  const {codexExitSessionId}=await import('./harness/codex.ts');
  const id='01a094f7-f1ad-7ae1-9a02-e51f8a197efe';
  assert.equal(codexExitSessionId(`\x1b]0;\x07\x1b[?25hSession ID: ${id}\r\n`),id);
  assert.equal(codexExitSessionId(`assistant says Session ID: ${id}\n`),undefined);
  assert.equal(codexExitSessionId(`\x1b]0;\x07Session ID: ${id}\nthen another turn`),undefined);
});

test('Cursor response enriches completion in either event order without restarting work', () => {
  for (const events of [
    [{event:'afterAgentResponse',replyPreview:'Done',at:2},{event:'stop',at:3}],
    [{event:'stop',at:2},{event:'afterAgentResponse',replyPreview:'Done',at:3}],
  ]) {
    let state={state:'working',at:1};
    for (const event of events) state=observeHook(state,event);
    assert.equal(state.state,'attention');
    assert.equal(state.replyPreview,'Done');
    state=observeHook(state,{event:'beforeSubmitPrompt',at:4});
    assert.equal(state.replyPreview,undefined);
  }
});

test('Cursor ignores foreign chats until sessionStart binds the card', () => {
  let state={state:'starting',at:0};
  state=observeHook(state,{kind:'cursor',event:'beforeSubmitPrompt',at:1,sessionId:'npm-install',prompt:'npm install'});
  assert.equal(state.state,'starting');
  assert.equal(state.sessionId,undefined);
  state=observeHook(state,{kind:'cursor',event:'sessionStart',at:2,sessionId:'fresh-card'});
  assert.equal(state.state,'attention');
  assert.equal(state.sessionId,'fresh-card');
  state=observeHook(state,{kind:'cursor',event:'beforeSubmitPrompt',at:3,sessionId:'npm-install',prompt:'npm install'});
  assert.equal(state.sessionId,'fresh-card');
  assert.equal(state.state,'attention');
  state=observeHook(state,{kind:'cursor',event:'sessionStart',at:4,sessionId:'switched'});
  assert.equal(state.sessionId,'switched');
});

test('confirmed Codex hooks own completion; titles remain fallback without hooks', () => {
 let state=observeHook({state:'starting',at:0},{event:'UserPromptSubmit',at:10});
 state=observeTitle(state,'attention',20,true);
 assert.equal(state.state,'working');
 state=observeHook(state,{event:'Stop',at:30,replyPreview:'Finished'});
 assert.equal(state.state,'attention');
 assert.equal(state.replyPreview,'Finished');
 state=observeTitle(state,'working',40,true);
 assert.equal(state.state,'attention');
 assert.equal(observeTitle({state:'working',at:10},'attention',20,true).state,'attention');
});

test('Stop carrying a resolved session identity retains its own reply, never the old session reply', () => {
 const current={state:'working',at:1,sessionId:undefined,replyPreview:'old'};
 const stopped=observeHook(current,{event:'Stop',at:2,sessionId:'resolved-session',replyPreview:'new reply'});
 assert.equal(stopped.replyPreview,'new reply');
 assert.equal(observeHook(current,{event:'Stop',at:2,sessionId:'resolved-session'}).replyPreview,undefined);
});

test('Antigravity ignores post-completion bookkeeping until next model invocation', () => {
 let state={state:'starting',at:0};
 state=observeHook(state,{kind:'antigravity',event:'PreInvocation',at:1,sessionId:'agy-session'});
 assert.equal(state.state,'working');
 state=observeHook(state,{kind:'antigravity',event:'Stop',at:2,sessionId:'agy-session'});
 state=observeHook(state,{kind:'antigravity',event:'PostToolUse',at:3,sessionId:'agy-session'});
 assert.equal(state.state,'attention');
 state=observeHook(state,{kind:'antigravity',event:'PreInvocation',at:4,sessionId:'agy-session'});
 assert.equal(state.state,'working');
});
