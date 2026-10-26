import test from 'node:test';
import assert from 'node:assert/strict';
import {readRelatedAgents} from '../server/related-agents.mjs';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const entries=ids=>[{id:'synthetic-completion',type:'subAgentActivity',receivers:ids,agentStates:ids.map(threadId=>({threadId,status:'completed'}))}];
test('resolve observed completed agent absent from list and request its own usage',async()=>{
 const calls=[];
 const reader={async call(method,params){calls.push([method,params]);return {thread:{id:params.threadId,source:'subAgentOther',status:{type:'idle'}}};}};
 const usage={async read(thread){return {tokens:[{totalTokens:123}],usageStatus:'available',usageReason:null,usageCheckedAt:'SYNTHETIC'};}};
 const result=await readRelatedAgents(reader,usage,entries([id(2)]));
 assert.equal(result.relatedAgents[0].id,id(2));assert.equal(result.relatedAgents[0].observedStatus,'completed');assert.equal(result.relatedAgents[0].tokens[0].totalTokens,123);assert.equal(calls[0][1].includeTurns,false);assert.equal(result.relatedAgents[0].thread.parentId,null);
});
test('internal or mismatched metadata never triggers usage read',async()=>{
 let usageCalls=0;const excludedIds=new Set();
 const reader={async call(method,{threadId}){return {thread:threadId===id(2)?{id:threadId,source:{subAgent:'review'}}:{id:id(99)}};}};
 const result=await readRelatedAgents(reader,{async read(){usageCalls++;}},entries([id(2),id(3)]),{excludedIds});
 assert.equal(usageCalls,0);assert.equal(result.relatedAgents.length,1);assert.equal(result.relatedAgents[0].usageStatus,'error');assert.equal(result.relatedAgents[0].thread,null);assert.ok(excludedIds.has(id(2)));
});
test('references are deduplicated, bounded and do not depend on snapshot membership',async()=>{
 let count=0;
 const reader={async call(method,{threadId}){count++;return {thread:{id:threadId,source:'subAgentOther'}};}};
 const usage={async read(){return {tokens:null,usageStatus:'unavailable',usageReason:'SYNTHETIC',usageCheckedAt:'SYNTHETIC'};}};
 const result=await readRelatedAgents(reader,usage,entries([id(2),id(2),id(3),id(4)]),{limit:2});
 assert.equal(count,2);assert.equal(result.relatedAgents.length,2);assert.equal(result.relatedAgentsTruncated,true);
});
import {filterAgentEntries} from '../server/related-agents.mjs';
test('unclassified or bounded-out collaboration references never expose prompt contents',()=>{
 const row={id:'synthetic-collab',type:'collabAgentToolCall',receivers:[id(2)],summary:'SYNTHETIC_PRIVATE_PROMPT',scope:'SYNTHETIC_PRIVATE_PROMPT',output:'SYNTHETIC_PRIVATE_OUTPUT'};
 const hidden=filterAgentEntries([row],[],new Set());
 assert.ok(!JSON.stringify(hidden).includes('SYNTHETIC_PRIVATE'));assert.equal(hidden[0].scope,null);
 assert.equal(filterAgentEntries([row],[{id:id(2),thread:{id:id(2)}}],new Set())[0].scope,row.scope);
 assert.deepEqual(filterAgentEntries([row],[],new Set([id(2)])),[]);
});
