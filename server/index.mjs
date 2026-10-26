import http from 'node:http';import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';
import {CodexReader} from './codex.mjs';
import {createUsageReader} from './agent-usage.mjs';
import {scanThreadAgents} from './thread-agents.mjs';
import {readRelatedAgents,filterAgentEntries} from './related-agents.mjs';
import {readHookTrials} from './hook-trials.mjs';import {sources,redact,normalize,safeLinks,isInternalThread,hydrateThreadMetadata} from './model.mjs';
import {clean,summaryOf,projectEntry,metricsOf,questionsFrom} from './review.mjs';
const port=Number(process.env.PORT||4310),origin=`http://127.0.0.1:${port}`,reader=new CodexReader(),root=fileURLToPath(new URL('../dist/',import.meta.url));let snapshot={connected:false,checkedAt:null,threads:[],events:[],truncated:false,error:null},refreshing=null;const privateIds=new Set();const turns=new Map(),metadata=new Map(),knownTurns=new Map();let limits=null,limitsAt=0;
const usageReader=createUsageReader(reader),discoveredThreads=new Map(),agentScans=new Map();
const record=(text)=>{snapshot.events=[{at:new Date().toISOString(),text},...snapshot.events].slice(0,25)};
async function latest(id){let r=await reader.call('thread/turns/list',{threadId:id,limit:1,itemsView:'summary',sortDirection:'desc'});return r.data?.[0]??null;}
async function refresh(){if(refreshing)return refreshing;refreshing=(async()=>{try{let all=[],cursor=null,truncated=false;for(let page=0;page<10;page++){let r=await reader.call('thread/list',{limit:100,cursor,useStateDbOnly:true,sortKey:'updated_at',sourceKinds:sources});all.push(...r.data);cursor=r.nextCursor;if(!cursor)break;if(page===9)truncated=true;}
 for(const t of all)if(isInternalThread(t))privateIds.add(t.id);all=all.filter(t=>!isInternalThread(t));
 for(let i=0;i<Math.min(all.length,100);i++){const t=all[i],c=metadata.get(t.id);if(!c||c.updatedAt!==t.updatedAt||Date.now()-c.at>300000){try{const r=await reader.call('thread/read',{threadId:t.id,includeTurns:false});metadata.set(t.id,{thread:r.thread,updatedAt:t.updatedAt,at:Date.now()});all[i]=hydrateThreadMetadata(t,r.thread);}catch{}}else all[i]=hydrateThreadMetadata(t,c.thread);}
 // 최근 24개만 최근 턴을 확인. 변경되지 않은 요약은 60초 캐시.
 for(const t of all.filter(t=>!normalize(t).internal).slice(0,24)){let c=turns.get(t.id);if(!c||c.updatedAt!==t.updatedAt||Date.now()-c.at>60000){try{turns.set(t.id,{turn:await latest(t.id),updatedAt:t.updatedAt,at:Date.now()})}catch{}}}
 let now=new Date().toISOString(),prior=new Map(snapshot.threads.map(t=>[t.id,t]));let data=all.filter(t=>!isInternalThread(t)).map(t=>{let c=turns.get(t.id);return {...normalize(t,c&&c.updatedAt===t.updatedAt&&Date.now()-c.at<90000?c.turn:null,now),review:c&&c.updatedAt===t.updatedAt&&Date.now()-c.at<90000?summaryOf(c.turn):null,turnCheckedAt:c?new Date(c.at).toISOString():null}});
 for(const t of data){let before=prior.get(t.id);if(before&&before.status!==t.status)record(`${t.title.slice(0,60)} · ${before.status} → ${t.status} (조회 차이)`);}
 if(!snapshot.connected)record('Codex 상태 DB 읽기 연결 성공');snapshot={...snapshot,connected:true,checkedAt:now,threads:data,truncated,error:null};
 if(Date.now()-limitsAt>300000){limitsAt=Date.now();try{let r=await reader.call('account/rateLimits/read',{});const groups=r.rateLimitsByLimitId??{codex:r.rateLimits};limits=Object.entries(groups).map(([id,l])=>({id,primary:l.primary,secondary:l.secondary}));}catch{limits=null;}}
 }catch(e){if(snapshot.connected)record('연결 끊김 · 마지막 확인 데이터 유지');snapshot={...snapshot,connected:false,error:redact(e.message).slice(0,300)};}finally{refreshing=null;}})();return refreshing;}
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
 if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'로컬 동일 출처만 허용'});if(req.method!=='GET')return json(res,405,{error:'읽기 요청만 허용'});
 const url=new URL(req.url,origin);try{if(url.pathname==='/api/hook-trials')return json(res,200,await readHookTrials(snapshot.threads));if(url.pathname==='/api/snapshot'){if(url.searchParams.has('refresh'))await refresh();return json(res,200,{...snapshot,limits,limitsCheckedAt:limitsAt?new Date(limitsAt).toISOString():null,version:reader.version});}
 const agentMatch=url.pathname.match(/^\/api\/threads\/([a-f0-9-]{36})\/agents$/);
 if(agentMatch){
  const id=agentMatch[1],listed=snapshot.threads.find(t=>t.id===id);
  if(!listed&&!discoveredThreads.has(id))return json(res,404,{error:'관측 목록에 없는 작업'});
  const metadataRead=await reader.call('thread/read',{threadId:id,includeTurns:false});
  if(isInternalThread(metadataRead.thread)){privateIds.add(id);return json(res,404,{error:'관측 대상 일반 업무가 아닙니다'});}
  const revision=metadataRead.thread.updatedAt,prior=agentScans.get(id),force=url.searchParams.get('refresh')==='1';
  let result;
  if(force)agentScans.delete(id);
  if(!force&&prior&&prior.revision===revision&&Date.now()-prior.at<15000)result=prior.result;
  else{result=await scanThreadAgents(reader,usageReader,id,{excludedIds:privateIds,refresh:force});
   if(result.coverage.complete){agentScans.delete(id);agentScans.set(id,{revision,at:Date.now(),result});if(agentScans.size>20)agentScans.delete(agentScans.keys().next().value);}
  }
  const listedIds=new Set(snapshot.threads.map(t=>t.id));
  result={...result,agents:result.agents.map(agent=>({...agent,listed:listedIds.has(agent.id)}))};
  for(const agent of result.agents)if(agent.thread)discoveredThreads.set(agent.id,agent.thread);
  while(discoveredThreads.size>2000)discoveredThreads.delete(discoveredThreads.keys().next().value);
  return json(res,200,result);
 }
 let m=url.pathname.match(/^\/api\/threads\/([a-f0-9-]{36})(\/turns)?$/);if(m){let id=m[1];if(!snapshot.threads.some(t=>t.id===id)&&!discoveredThreads.has(id))return json(res,404,{error:'관측 목록에 없는 작업'});
 const metadataRead=await reader.call('thread/read',{threadId:id,includeTurns:false});if(isInternalThread(metadataRead.thread)){privateIds.add(id);return json(res,404,{error:'관측 대상 일반 업무가 아닙니다'});}
 const turnPage=await reader.call('thread/turns/list',{threadId:id,limit:8,itemsView:'summary',sortDirection:'desc',cursor:m[2]?url.searchParams.get('cursor'):null});
 for(const t of turnPage.data??[])knownTurns.set(id+':'+t.id,t);
 const turnOptions=(turnPage.data??[]).map(t=>({id:t.id,status:t.status,startedAt:t.startedAt,completedAt:t.completedAt,durationMs:t.durationMs,preview:summaryOf(t)?.result.slice(0,200)}));
 if(m[2])return json(res,200,{turns:turnOptions,nextCursor:turnPage.nextCursor});
 const requested=url.searchParams.get('turn');if(requested&&!/^[a-f0-9-]{36}$/.test(requested))return json(res,400,{error:'유효하지 않은 턴 ID'});
 const turn=requested?knownTurns.get(id+':'+requested):turnPage.data?.[0];if(requested&&!turn)return json(res,404,{error:'턴 목록에서 먼저 선택해 주세요'});
 const r=metadataRead;let entries=[],nextCursor=null,itemError=null;
 if(turn)try{const page=await reader.call('thread/items/list',{threadId:id,turnId:turn.id,limit:40,sortDirection:'asc',cursor:url.searchParams.get('cursor')});entries=(page.data??[]).filter(e=>![...(e.item?.receiverThreadIds??[]),...Object.keys(e.item?.agentsStates??{}),e.item?.agentThreadId].some(id=>privateIds.has(id))).map(e=>projectEntry(e,turn.id)).filter(Boolean);nextCursor=page.nextCursor??null;}catch(e){itemError=clean(e.message,300)}
 const result=(turn?.items??[]).filter(i=>i.type==='agentMessage'&&i.phase==='final_answer').map(i=>clean(i.text)).join('\n\n').slice(0,24000);
 const usage=await usageReader.read(r.thread,{refresh:url.searchParams.get('refreshUsage')==='1'});
 const related=await readRelatedAgents(reader,usageReader,entries,{excludedIds:privateIds,refresh:url.searchParams.get('refreshUsage')==='1'});
 // Drop records newly identified as internal during related metadata reads.
 entries=filterAgentEntries(entries,related.relatedAgents,privateIds);

 return json(res,200,{thread:normalize(r.thread,turn,new Date().toISOString()),turn:turn?{id:turn.id,status:turn.status,startedAt:turn.startedAt,completedAt:turn.completedAt,durationMs:turn.durationMs,error:clean(turn.error?.message,1000)}:null,turns:turnOptions,turnsNextCursor:turnPage.nextCursor,entries,nextCursor,itemError,result,questions:questionsFrom(turn?.items??[]),links:safeLinks(result),metrics:metricsOf(entries),pendingRequests:null,pendingReason:'현재 연결에는 공식 pending request 목록/구독이 제공되지 않습니다. 원래 대화에서 현재 대기 여부를 확인하세요.',...usage,...related,checkedAt:new Date().toISOString()});}
 if(url.pathname.startsWith('/api/'))return json(res,404,{error:'지원하지 않는 읽기 경로'});
 let relative=url.pathname==='/'?'index.html':url.pathname.slice(1);if(relative.includes('..')||!/^([\w./-]+)$/.test(relative))return json(res,404,{error:'없음'});let file=path.resolve(root,relative);if(!file.startsWith(root))return json(res,403,{});let data=await readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');res.end(data);
 }catch(e){json(res,503,{error:redact(e.message).slice(0,300)});}});
server.listen(port,'127.0.0.1',()=>console.log(`대시보드 ${origin} · 관측 전용`));refresh();const timer=setInterval(refresh,15000);function stop(){clearInterval(timer);reader.close();server.close(()=>process.exit(0));}process.on('SIGTERM',stop);process.on('SIGINT',stop);
