// Uses the existing dev server; every API is mocked so no real tasks are changed.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 await page.addInitScript(() => {
  window.tones = 0;
  window.AudioContext = class {
   state = 'running'; currentTime = 0; destination = {};
   createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() { window.tones++; }, stop() {} }; }
   createGain() { return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
  };
 });
 const errors=[];
 page.on('pageerror', error=>errors.push(error.message));
 const card=(id,weight)=>({id,cwd:'/tmp/soft-preemption',session:{id,name:id,cwd:'/tmp/soft-preemption',firstMessage:id,messageCount:0,modified:new Date().toISOString()},phase:'attention',createdAt:Date.now(),readyAt:Date.now(),priorityWeight:weight});
 let queue={version:1,revision:1,sortMode:'score',order:['A','B','C'],cards:[card('A',45),card('B',31),card('C',18)]};
 await page.route('**/api/**', async route=>{
  const path=new URL(route.request().url()).pathname;
  let data={};
  if(path==='/api/card-queue') data=queue;
  else if(path==='/api/models') data={models:[],modelList:[],defaultModel:null};
  else if(path.endsWith('/state')) data={running:false};
  else if(path.startsWith('/api/sessions/')) data={context:{messages:[],entryIds:[]},tree:[],leafId:null};
  else if(path==='/api/agent/running') data={ids:[]};
  else if(path.startsWith('/api/agent/')) data={running:false};
  else if(path==='/api/home') data={home:'/tmp'};
  await route.fulfill({json:data});
 });
 await page.goto(process.env.E2E_BASE_URL || 'http://127.0.0.1:30141');
 const front=()=>page.locator('.cq-deck-layer[aria-hidden="false"]');
 const input=page.locator('[data-transfer-id="A"] textarea');
 await input.fill('Keep this draft and cursor');
 await input.evaluate(el=>{el.setSelectionRange(5,9);window.originalComposer=el;});
 const before=await front().boundingBox();
 queue={...queue,revision:2,order:['A','B','C','D'],cards:[...queue.cards,card('D',82)]};
 await page.waitForFunction(()=>document.querySelector('.cq-preemption-count')?.textContent==='1');
 assert.equal(await front().getAttribute('data-transfer-id'),'A');
 assert.equal(await front().getAttribute('data-deck-index'),'1');
 await page.waitForFunction(()=>window.tones===4);
 assert.deepEqual(await input.evaluate(el=>[el===window.originalComposer,document.activeElement===el,el.value,el.selectionStart,el.selectionEnd]),[true,true,'Keep this draft and cursor',5,9]);
 assert.equal(Math.round((await front().boundingBox()).x),Math.round(before.x));
 // Move A farther than the render window: its input must still never remount.
 const arrivals=Array.from({length:7},(_,i)=>card(`E${i}`,100+i));
 queue={...queue,revision:3,order:[...queue.order,...arrivals.map(c=>c.id)],cards:[...queue.cards,...arrivals]};
 await page.waitForFunction(()=>document.querySelector('.cq-preemption-count')?.textContent==='8');
 assert.equal(await front().getAttribute('data-transfer-id'),'A');
 assert.equal(await input.evaluate(el=>el===window.originalComposer && document.activeElement===el),true);
 await page.waitForFunction(()=>window.tones===8);
 // Existing cards change rank when their tag/weight changes.
 queue={...queue,revision:4,cards:queue.cards.map(c=>c.id==='B'?{...c,priorityWeight:151}:c)};
 await page.waitForFunction(()=>document.querySelector('.cq-preemption-count')?.textContent==='9');
 assert.equal(await front().getAttribute('data-transfer-id'),'A');
 assert.equal(await input.evaluate(el=>el===window.originalComposer && document.activeElement===el && el.selectionStart===5 && el.selectionEnd===9),true);
 await page.waitForFunction(()=>window.tones===12);
 await page.waitForTimeout(1500);
 assert.equal(await page.evaluate(()=>window.tones),12,'unchanged polls do not repeat the chime');
 await page.locator('.cq-preemption-hint').click();
 await page.waitForFunction(()=>document.querySelector('.cq-deck-layer[aria-hidden="false"]')?.dataset.transferId==='B');
 assert.equal(await page.locator('.cq-preemption-hint').count(),0);
 // Manual horizontal browsing still docks and changes focus.
 await page.locator('.cq-stage').hover();
 await page.mouse.wheel(600,0);
 await page.waitForFunction(()=>document.querySelector('.cq-deck-layer[aria-hidden="false"]')?.dataset.transferId!=='B');
 await page.waitForFunction(()=>{const el=document.querySelector('.cq-deck-layer[aria-hidden="false"]');return Number.isInteger(Number(el?.dataset.deckPosition));});
 assert.equal(await page.evaluate(()=>window.tones),12,'reading and navigation do not chime');
 assert.deepEqual(errors,[]);
 console.log('PASS: soft preemption preserves DOM, input focus, selection and viewport; hint counts update; click and wheel navigate explicitly.');
} finally {await browser.close();}
