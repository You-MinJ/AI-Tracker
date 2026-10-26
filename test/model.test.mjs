import test from 'node:test';import assert from 'node:assert/strict';import{normalize,statusOf,redact,safeLinks,sources}from'../server/model.mjs';
test('idle / notLoaded do not imply completion',()=>{for(const type of ['idle','notLoaded'])assert.equal(statusOf({status:{type}}),'unknown');assert.equal(statusOf({status:{type:'notLoaded'}},{status:'completed'}),'ended');});
test('active flags and failures take precedence over historical completion',()=>{assert.equal(statusOf({status:{type:'active',activeFlags:['waitingOnUserInput']}},{status:'completed'}),'attention');assert.equal(statusOf({status:{type:'systemError'}},{status:'completed'}),'failed');});
test('parent relation comes from supported metadata',()=>{let t=normalize({id:'a',cwd:'/projects/example',status:{type:'idle'},source:{subAgent:{thread_spawn:{parent_thread_id:'p',agent_role:'ys_reviewer'}}}});assert.equal(t.parentId,'p');assert.equal(t.role,'ys_reviewer');assert.equal(t.verification,'미제공');assert.equal(t.project,'example');assert.ok(sources.includes('subAgentOther'));});
test('credentials and unsafe result links are suppressed',()=>{assert.equal(redact('key sk-12345678901234567890123'),'key [토큰 숨김]');assert.equal(redact('password=abcdef'),'password=[숨김]');let links=safeLinks('[bad](javascript:alert) [token](https://a.test/?token=foo) [ok](https://a.test/doc) [local](/tmp/result.md)');assert.equal(links.length,2);assert.equal(links[0].url,'https://a.test/doc');});

// Fully synthetic public work metadata; no installation or session data.
test('metadata cache preserves all public agent roles and source relationships',async()=>{
 const {hydrateThreadMetadata}=await import('../server/model.mjs');
 for(const role of ['default','explorer','worker','synthetic_custom',null]){
  const listed={id:'synthetic-child',source:'appServer',status:{type:'active'},updatedAt:22};
  const detail={id:'synthetic-child',source:{subAgent:{thread_spawn:{parent_thread_id:'synthetic-parent',agent_role:role}}},model:'SYNTHETIC-MODEL',status:{type:'idle'},updatedAt:11};
  const merged=hydrateThreadMetadata(listed,detail),task=normalize(merged);
  assert.equal(task.parentId,'synthetic-parent');assert.equal(task.role,role);assert.equal(task.model,'SYNTHETIC-MODEL');assert.equal(task.runtime,'active');assert.equal(task.updatedAt,22);assert.equal(task.internal,false);
 }
});
test('metadata cache retains internal exclusion evidence without using role names',async()=>{
 const {hydrateThreadMetadata}=await import('../server/model.mjs');
 for(const detail of [{source:{subAgent:'review'}},{threadSource:'guardian_review'},{model:'codex-auto-review'},{internal:true}])assert.equal(normalize(hydrateThreadMetadata({id:'synthetic-internal',source:'appServer'},detail)).internal,true);
 assert.equal(normalize(hydrateThreadMetadata({id:'synthetic-public',source:'appServer'},{agentRole:'reviewer'})).internal,false);
});
