import test from 'node:test';
import assert from 'node:assert/strict';
import { promptSourceOverrides, validatePromptSources, DEFAULT_PROMPT_SOURCES } from './prompt-sources.ts';
test('source switches filter actual context and skill resources without changing originals',()=>{
 const config=validatePromptSources({basePrompt:'My base',excludedContextFiles:['/project/AGENTS.md'],excludedSkills:['/global/wecom/SKILL.md']});
 const overrides=promptSourceOverrides(config);
 const files={agentsFiles:[{path:'/project/AGENTS.md',content:'Project'},{path:'/global/AGENTS.md',content:'Global'}]};
 const skills={skills:[{filePath:'/global/wecom/SKILL.md',name:'WeCom'},{filePath:'/global/code/SKILL.md',name:'Code'}],diagnostics:[]};
 assert.equal(overrides.systemPromptOverride('Default'),'My base');
 assert.deepEqual(overrides.agentsFilesOverride(files).agentsFiles,[files.agentsFiles[1]]);
 assert.deepEqual(overrides.skillsOverride(skills).skills,[skills.skills[1]]);
 assert.equal(files.agentsFiles.length,2);assert.equal(skills.skills.length,2);
 assert.equal(promptSourceOverrides(DEFAULT_PROMPT_SOURCES).systemPromptOverride('Default'),'Default');
 assert.throws(()=>validatePromptSources({basePrompt:1,excludedContextFiles:[],excludedSkills:[]}));
 assert.throws(()=>validatePromptSources({basePrompt:'',excludedContextFiles:[{}],excludedSkills:[]}));
});
