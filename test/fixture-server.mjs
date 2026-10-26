// Explicit test-only server. No Codex process, auth, or production data.
import {createUsageReader} from '../server/agent-usage.mjs';
import {readRelatedAgents} from '../server/related-agents.mjs';
import http from'node:http';import{readFile}from'node:fs/promises';import{normalize}from'../server/model.mjs';import{projectEntry,summaryOf,questionsFrom}from'../server/review.mjs';
const root=new URL('../dist/',import.meta.url),id='00000000-0000-0000-0000-000000000001',turnId='00000000-0000-0000-0000-000000000011';let mode='empty';
const server=http.createServer(async(req,res)=>{try{mode=(await readFile('/tmp/agent-dashboard-ui-mode.txt','utf8')).trim()}catch{}const now=new Date().toISOString(),long=mode==='long',text=mode==='question'?'외부 배포에는 사용자 승인이 필요합니다. 확인해 주세요.':long?('긴 결과 검증입니다.\n'.repeat(1000))+'<img src=x onerror=alert(1)> [unsafe](javascript:alert(1))':'[TEST FIXTURE] 완료 응답. 품질 검증 완료로 추정하지 않습니다.';
let raw={id,name:'[TEST FIXTURE] 업무 검토',preview:'테스트 데이터 · 실제 업무 아님',cwd:'/TEST_FIXTURE/project',source:'appServer',model:'TEST-MODEL',status:{type:mode==='active'?'active':'notLoaded',activeFlags:[]},updatedAt:Math.floor(Date.now()/1000)};let turn={id:turnId,status:mode==='active'?'inProgress':mode==='failed'?'failed':'completed',startedAt:Math.floor(Date.now()/1000)-25,completedAt:mode==='active'?null:Math.floor(Date.now()/1000),durationMs:mode==='active'?null:25000,items:mode==='active'||mode==='failed'?[]:[{type:'agentMessage',phase:'final_answer',id:'final',text}]};let task={...normalize(raw,turn,now),review:summaryOf(turn)},tasks=mode==='empty'?[]:[task];let entries=[projectEntry({turnId,item:{id:'user',type:'userMessage',content:[{type:'text',text:long?'긴 사용자 지시입니다.\n'.repeat(1000):'[TEST FIXTURE] 테스트를 실행하고 결과를 알려 주세요.'}]}},turnId),projectEntry({turnId,item:{id:'tool',type:'commandExecution',command:'npm test',status:mode==='active'?'inProgress':mode==='failed'?'failed':'completed',exitCode:mode==='failed'?1:mode==='active'?null:0,aggregatedOutput:mode==='failed'?'TEST: failure':'TEST: 3 passed',durationMs:2300}},turnId)];
let url=new URL(req.url,'http://127.0.0.1:4311');
if(mode==='subagents'){
 const fixtureCases=[
  {name:'부모 업무',source:'appServer',agentRole:null},
  {name:'자료 조사',source:{subAgent:{thread_spawn:{parent_thread_id:id,agent_role:'explorer'}}}},
  {name:'구현 수행',source:{subAgent:{thread_spawn:{parent_thread_id:id,agent_role:'worker'}}}},
  {name:'사용자 정의 검토',source:{subAgent:{thread_spawn:{parent_thread_id:id,agent_role:'synthetic_custom'}}}},
  {name:'역할 없는 공개 실행',source:'subAgentOther',parentThreadId:id}
 ];
 const fixtureTurns=new Map();
 tasks=fixtureCases.map((example,index)=>{
  const threadId=`00000000-0000-0000-0000-${String(index+1).padStart(12,'0')}`;
  const caseTurn={...turn,id:`00000000-0000-0000-0000-${String(index+101).padStart(12,'0')}`,items:[{type:'agentMessage',phase:'final_answer',id:'synthetic-final',text:`[TEST FIXTURE] ${example.name} 공개 결과. 사람 검토 전.`}]};
  fixtureTurns.set(threadId,caseTurn);
  return {...normalize({...raw,...example,id:threadId,name:`[TEST FIXTURE] ${example.name}`},caseTurn,now),review:summaryOf(caseTurn)};
 });
 const requested=url.pathname.match(/^\/api\/threads\/([^/]+)/)?.[1];
 if(requested){
  task=tasks.find(item=>item.id===requested);
  if(!task){res.writeHead(404,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'TEST: 없는 실행'}));}
  turn=fixtureTurns.get(requested);
  entries=[projectEntry({turnId:turn.id,item:{id:'synthetic-user',type:'userMessage',content:[{type:'text',text:`[TEST FIXTURE] ${task.title}에 해당하는 지시. 실제 업무 아님.`}]}},turn.id)];
 }
}
let usageProjection={tokens:null,usageCheckedAt:now},relatedProjection={relatedAgents:[],relatedAgentsTruncated:false};
if(mode==='agent-usage'){
 const childIds=[2,3,4].map(n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`);
 // Children intentionally absent from thread/list, but observed in the parent's selected turn.
 entries=[entries[0],...childIds.map((agentThreadId,index)=>projectEntry({turnId:turn.id,item:{id:`synthetic-activity-${index}`,type:'subAgentActivity',kind:'completed',agentThreadId,agentPath:'SYNTHETIC_PATH_NOT_PROJECTED'}},turn.id))];
 const fakeReader={async call(method,params){
  if(method==='thread/read')return {thread:{...raw,id:params.threadId,name:'[TEST FIXTURE] '+({[childIds[0]]:'사용량 제공',[childIds[1]]:'사용량 미제공',[childIds[2]]:'사용량 조회 오류'}[params.threadId]||'부모'),source:'subAgentOther',agentRole:'worker'}};
  if(params.threadId===childIds[2])throw Error('SYNTHETIC: 사용량 조회 실패');
  return {threadUsage:params.threadId===childIds[0]?{threadId:params.threadId,groups:[{model:'SYNTHETIC-MODEL',inputTokens:120,outputTokens:30,cachedInputTokens:20,netNewInputTokens:100,totalTokens:150}]}:null};
 }};
 const testUsage=createUsageReader(fakeReader);
 usageProjection=await testUsage.read(raw);
 relatedProjection=await readRelatedAgents(fakeReader,testUsage,entries,{refresh:url.searchParams.has('refreshUsage')});
}
res.setHeader('Cache-Control','no-store');if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');if(url.pathname==='/api/snapshot')return res.end(JSON.stringify({fixture:true,version:'TEST',connected:true,checkedAt:now,threads:tasks,events:[],limits:null,truncated:false}));if(url.pathname.endsWith('/turns'))return res.end(JSON.stringify({turns:[turn],nextCursor:null}));return res.end(JSON.stringify({thread:task,turn,turns:[turn],turnsNextCursor:null,entries,nextCursor:null,itemError:null,result:turn.items[0]?.text??'',questions:questionsFrom(turn.items),links:[],pendingRequests:null,pendingReason:'TEST: 실제 pending 목록 미연결',...usageProjection,...relatedProjection,checkedAt:now}));}try{let p=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!/^[\w./-]+$/.test(p)||p.includes('..'))throw Error();let b=await readFile(new URL(p,root));res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(b)}catch{res.writeHead(404);res.end()}});server.listen(4311,'127.0.0.1',()=>console.log('TEST UI pid='+process.pid));
