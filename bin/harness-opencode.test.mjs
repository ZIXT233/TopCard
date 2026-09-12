import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TopCardState } from './harness-opencode.mjs';
test('message IDs never block session idle and same-millisecond signals preserve order', async () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'topcard-hook-test-'));
 const old=process.env.TOPCARD_HARNESS_SIGNAL_DIR;
 const now=Date.now;
 process.env.TOPCARD_HARNESS_SIGNAL_DIR=dir;
 Date.now=()=>1000;
 try {
  const queried=[];
  const hook=await TopCardState({client:{session:{get:async ({path:{id}})=>{queried.push(id);return {data:{id,title:'Example'}};}}}});
  await hook['chat.message']({sessionID:'root'});
  await hook.event({event:{type:'message.updated',properties:{info:{id:'message-id',sessionID:'root'}}}});
  await hook.event({event:{type:'session.idle',properties:{sessionID:'root'}}});
  assert.deepEqual(queried,['root']);
  const signals=fs.readdirSync(dir).sort().map(file=>JSON.parse(fs.readFileSync(path.join(dir,file))));
  assert.deepEqual(signals.map(s=>s.event),['UserPromptSubmit','Stop']);
  assert.ok(signals[1].at>signals[0].at);
 } finally {
  Date.now=now;
  if(old===undefined)delete process.env.TOPCARD_HARNESS_SIGNAL_DIR;else process.env.TOPCARD_HARNESS_SIGNAL_DIR=old;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
