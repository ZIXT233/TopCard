import test from 'node:test';
import assert from 'node:assert/strict';
import { tagRulesPrompt, parseTurnTags, hideTurnTags } from './turn-tag-protocol.ts';
import { DEFAULT_TURN_TAGS } from './turn-priority.ts';
test('weight edits preserve injected prompt; semantic edits append a new rule',()=>{
 const base=tagRulesPrompt(DEFAULT_TURN_TAGS);
 assert.equal(tagRulesPrompt(DEFAULT_TURN_TAGS.map(t=>({...t,weight:t.weight+10}))),base);
 assert.notEqual(tagRulesPrompt(DEFAULT_TURN_TAGS.map(t=>({...t,description:t.description+' changed'}))),base);
});
test('same-turn metadata is parsed strictly and hidden for display only',()=>{
 const text='Reply\n<turn_tags>{"tags":["🧩 Easy"]}</turn_tags>';
 assert.deepEqual(parseTurnTags(text,DEFAULT_TURN_TAGS),['🧩 Easy']);
 assert.equal(hideTurnTags(text),'Reply');
 assert.throws(()=>parseTurnTags('Reply',DEFAULT_TURN_TAGS));
 assert.throws(()=>parseTurnTags('<turn_tags>{"tags":["Unknown"]}</turn_tags>',DEFAULT_TURN_TAGS));
});
test('inline, indented, CRLF and multiline metadata are parsed and hidden',()=>{
 for(const separator of ['', ' ', '\n  ', '\r\n\t']) {
  const text = `你好！${separator}<turn_tags >\n{\n "tags": ["🧩 Easy"]\n}\n</turn_tags > \r\n`;
  assert.deepEqual(parseTurnTags(text,DEFAULT_TURN_TAGS),['🧩 Easy']);
  assert.equal(hideTurnTags(text),'你好！');
 }
});
test('streaming metadata never exposes its opening marker or payload',()=>{
 const metadata='<turn_tags>\n{"tags":["🧩 Easy"]}</turn_tags>';
 for(let i=1;i<=metadata.length;i++) assert.equal(hideTurnTags('你好！ '+metadata.slice(0,i)),'你好！');
 assert.equal(hideTurnTags('Hello <table>world</table>'),'Hello <table>world</table>');
});
test('format tolerance preserves strict metadata validation',()=>{
 for(const payload of ['{"tags":["Unknown"]}','{"tags":["🧩 Easy","🧩 Easy"]}','{"tags":[],"weight":99}','{"tags":["🚨 Urgent Call"]}','{"tags":[],"urgentCall":{}}','{"tags":[],}']) {
  assert.throws(()=>parseTurnTags(`Reply <turn_tags>${payload}</turn_tags>`,DEFAULT_TURN_TAGS));
 }
 const metadata='<turn_tags>{"tags":[]}</turn_tags>';
 assert.throws(()=>parseTurnTags(metadata+metadata,DEFAULT_TURN_TAGS));
 assert.throws(()=>parseTurnTags(metadata+' trailing prose',DEFAULT_TURN_TAGS));
 assert.throws(()=>parseTurnTags('<turn_tags>{"tags":[]}',DEFAULT_TURN_TAGS));
 const urgent={tags:['🚨 Urgent Call'],urgentCall:{incident:'Production outage',evidence:'Monitoring confirms outage',urgency:'Loss continues now',action:'User must restore access'}};
 assert.deepEqual(parseTurnTags(`Reply <turn_tags>${JSON.stringify(urgent,null,2)}</turn_tags>`,DEFAULT_TURN_TAGS),['🚨 Urgent Call']);
});
test('compact prompts preserve custom Easy descriptions and omit weights',()=>{
 const prompt=tagRulesPrompt(DEFAULT_TURN_TAGS);
 assert.ok(prompt.length < 1600);
 assert.ok(!prompt.includes('"weight"'));
 const custom=DEFAULT_TURN_TAGS.map(tag=>tag.name==='🧩 Easy'?{...tag,description:'My custom definition'}:tag);
 assert.ok(tagRulesPrompt(custom).includes('My custom definition'));
});
