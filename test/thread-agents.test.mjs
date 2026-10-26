import test from 'node:test';
import assert from 'node:assert/strict';
import {scanThreadAgents} from '../server/thread-agents.mjs';
import {createUsageReader} from '../server/agent-usage.mjs';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`,parent=id(90);
const activity=(turn,child,kind,suffix='')=>({turnId:turn,item:{id:`synthetic-${child}-${kind}${suffix}`,type:'subAgentActivity',agentThreadId:child,kind,agentPath:'SYNTHETIC_PRIVATE_PATH'}});
function readerFor({failure=false,internal=false}={}){
 const calls=[];
 return {calls,async call(method,params){calls.push([method,params]);
  if(method==='thread/turns/list')return params.cursor?{data:[{id:id(82)}],nextCursor:null}:{data:[{id:id(81)}],nextCursor:'synthetic-turn-page-2'};
  if(method==='thread/items/list'){
   if(failure)throw Error('SYNTHETIC_READ_FAILURE');
   const ids=[1,2,3,4,5,6].map(id);
   if(params.turnId===id(81))return params.cursor?{data:ids.slice(3).flatMap(child=>[activity(id(81),child,'started'),activity(id(81),child,'completed')]),nextCursor:null}:{data:ids.slice(0,3).flatMap(child=>[activity(id(81),child,'started'),activity(id(81),child,'completed')]),nextCursor:'synthetic-item-page-2'};
   return {data:[activity(id(82),id(1),'completed','repeat'),{turnId:'wrong-turn',item:{id:'bad',type:'subAgentActivity',agentThreadId:id(7),kind:'completed'}},{turnId:id(82),item:{id:'private-thought',type:'reasoning',content:['SYNTHETIC_PRIVATE_THOUGHT']}}],nextCursor:null};
  }
  if(method==='thread/read')return {thread:{id:params.threadId,parentThreadId:parent,source:internal&&params.threadId===id(1)?{subAgent:'review'}:'subAgentOther',agentRole:'synthetic-role'}};
  if(method==='account/usage/read')return {threadUsage:null};
  throw Error('Unexpected method');
 }};
}
test('scan every turn/item page and deduplicate repeated done records for six unlisted agents',async()=>{
 const reader=readerFor();const result=await scanThreadAgents(reader,createUsageReader(reader),parent);
 assert.deepEqual(result.summary,{observed:6,completed:6,usageAvailable:0,usageUnavailable:6,usageErrors:0});
 assert.equal(result.coverage.complete,true);assert.equal(result.coverage.scannedTurns,2);assert.equal(result.coverage.itemPages,3);assert.equal(result.agents[0].evidence.length,3);
 assert.ok(result.agents.every(agent=>agent.tokens===null&&agent.thread.parentId===parent));
 assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE'));
 assert.ok(reader.calls.filter(([method])=>method==='thread/turns/list').every(([,params])=>params.itemsView==='notLoaded'));
});
test('read failure reports incomplete instead of treating zero observed references as no usage',async()=>{
 const reader=readerFor({failure:true});const result=await scanThreadAgents(reader,createUsageReader(reader),parent);
 assert.equal(result.coverage.complete,false);assert.equal(result.summary.observed,0);assert.equal(result.coverage.errors.length,2);
});
test('page budget is visible and does not claim full coverage',async()=>{
 const reader=readerFor();const result=await scanThreadAgents(reader,createUsageReader(reader),parent,{maxItemPages:1});
 assert.equal(result.coverage.complete,false);assert.equal(result.summary.observed,3);
});
test('internal execution never contributes a public done count or a usage request',async()=>{
 const reader=readerFor({internal:true});const result=await scanThreadAgents(reader,createUsageReader(reader),parent);
 assert.equal(result.summary.observed,5);assert.equal(result.summary.completed,5);
 assert.ok(!reader.calls.some(([method,params])=>method==='account/usage/read'&&params.threadId===id(1)));
});
test('metadata errors remain unresolved and mark count as partial',async()=>{
 const reader=readerFor();const original=reader.call.bind(reader);reader.call=async(method,params)=>{if(method==='thread/read'&&params.threadId===id(1))throw Error('SYNTHETIC_NOT_FOUND');return original(method,params);};
 const result=await scanThreadAgents(reader,createUsageReader(reader),parent);
 assert.equal(result.coverage.complete,false);assert.equal(result.coverage.unresolved,1);assert.equal(result.summary.observed,5);assert.equal(result.agents.length,6);
});

test('a public main conversation referenced by wait is not reclassified as a subagent',async()=>{
 const reader=readerFor(),original=reader.call.bind(reader);
 reader.call=async(method,params)=>{if(method==='thread/read'&&params.threadId===id(1))return {thread:{id:id(1),source:'appServer',parentThreadId:null}};return original(method,params);};
 const result=await scanThreadAgents(reader,createUsageReader(reader),parent);
 assert.equal(result.summary.observed,5);assert.ok(!result.agents.some(agent=>agent.id===id(1)));
});
