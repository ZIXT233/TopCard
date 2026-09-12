import test from "node:test";
import assert from "node:assert/strict";
import { scoreCard, sortedQueue, resolveQueueFocus, validateTags, validateTagResult, DEFAULT_TURN_TAGS } from "./turn-priority.ts";
const card = (id, extra={}) => ({id,session:{id},phase:"attention",createdAt:0,readyAt:0,...extra});
test("deterministic scores, minute boundaries, cap, and waiting reset", () => {
 const c=card("a",{priorityWeight:60,turnTags:["🧩 Easy"]});
 assert.equal(scoreCard(c,DEFAULT_TURN_TAGS,7*60000).total,97);
 assert.equal(scoreCard(c,DEFAULT_TURN_TAGS,59999).waiting,0);
 assert.equal(scoreCard(c,DEFAULT_TURN_TAGS,999*60000).waiting,99);
 assert.equal(scoreCard({...c,waitingSince:7*60000},DEFAULT_TURN_TAGS,7*60000).total,90);
 assert.equal(scoreCard(c,[],0).total,60);
});
test("score ordering, FIFO tie, drafts excluded, focus independent of order", () => {
 const cards=[card("a"),card("b",{priorityWeight:60}),card("c",{priorityWeight:60,readyAt:1})];
 const state={cards,order:["a","b","c"],sortMode:"score"};
 assert.deepEqual(sortedQueue(state,0).map(c=>c.id),["b","c","a"]);
 assert.equal(resolveQueueFocus(sortedQueue(state,0),"a",0),2);
 assert.deepEqual(sortedQueue({...state,sortMode:"fifo"},0).map(c=>c.id),["a","b","c"]);
 const draft=card("draft",{session:null});
 assert.deepEqual(sortedQueue({...state,cards:[...cards,draft],order:[...state.order,"draft"]},0).map(c=>c.id),["b","c","a"]);
});
test("reject unknown tags, weights in model output, duplicates and malformed definitions", () => {
 assert.deepEqual(validateTagResult({tags:[]},DEFAULT_TURN_TAGS),[]);
 assert.throws(()=>validateTagResult({tags:["Unknown"]},DEFAULT_TURN_TAGS));
 assert.throws(()=>validateTagResult({tags:["Quick"],score:30},DEFAULT_TURN_TAGS));
 assert.throws(()=>validateTagResult({tags:["Quick","Quick"]},DEFAULT_TURN_TAGS));
 assert.throws(()=>validateTags([{name:"a",weight:NaN,description:"a"}]));
 assert.throws(()=>validateTags([DEFAULT_TURN_TAGS[0],DEFAULT_TURN_TAGS[0]]));
});

test("soft preemption keeps A focused while higher scores move ahead", () => {
 const cards = [card("a",{priorityWeight:45}),card("b",{priorityWeight:31}),card("c",{priorityWeight:18}),card("d",{priorityWeight:82})];
 const state = {cards,order:["a","b","c","d"],sortMode:"score"};
 const ordered = sortedQueue(state,0);
 assert.deepEqual(ordered.map(c=>c.id),["d","a","b","c"]);
 assert.equal(resolveQueueFocus(ordered,"a"),1);
 cards[1].priorityWeight=151;
 const updated=sortedQueue(state,60000);
 assert.deepEqual(updated.map(c=>c.id),["b","d","a","c"]);
 assert.equal(resolveQueueFocus(updated,"a",1),2);
 assert.equal(resolveQueueFocus(updated,updated[0].id,2),0);
 assert.equal(resolveQueueFocus(updated.filter(c=>c.id!=="a"),"a",2),2);
 assert.equal(resolveQueueFocus([],"a",2),0);
});

test('old tag names do not match current definitions', () => {
 const result = scoreCard(card('old', { turnTags: ['Quick', '⚡ Quick', '⚡ Easy'] }), DEFAULT_TURN_TAGS);
 assert.deepEqual(result.tags, []);
});
