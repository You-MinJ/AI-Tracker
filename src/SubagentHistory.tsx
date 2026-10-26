import React,{useEffect,useRef,useState} from 'react';
import type {Task,RelatedAgent} from './types';

export type ThreadAgents={threadId:string;checkedAt:string;agents:(RelatedAgent&{listed:boolean;evidence:{turnId:string;itemId:string;kind:string;status:string|null}[]})[];coverage:{complete:boolean;scannedTurns:number;turnPages:number;itemPages:number;agentsTruncated:boolean;unresolved:number;errors:string[]};summary:{observed:number;completed:number;usageAvailable:number;usageUnavailable:number;usageErrors:number}};

export default function SubagentHistory({tasks,onOpen}:{tasks:Task[];onOpen:(task:Task)=>void}){
 const [threadId,setThreadId]=useState(''),[result,setResult]=useState<ThreadAgents|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const sequence=useRef(0),request=useRef<AbortController|null>(null);
 const conversations=tasks.filter(task=>!task.parentId&&!task.internal);
 useEffect(()=>{if(!conversations.some(task=>task.id===threadId)){sequence.current++;request.current?.abort();setResult(null);setBusy(false);setThreadId(conversations[0]?.id??'');}},[tasks,threadId]);
 async function load(id:string,refresh=false){
  const ticket=++sequence.current;request.current?.abort();request.current=new AbortController();
  setBusy(true);setError('');setResult(null);
  try{
   const response=await fetch(`/api/threads/${id}/agents${refresh?'?refresh=1':''}`,{signal:request.current.signal});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Sub-agent 이력 조회 실패');
   if(data.threadId!==id)throw Error('선택한 대화와 응답이 다릅니다.');
   if(sequence.current===ticket)setResult(data);
  }catch(e){if(sequence.current===ticket&&(e as Error).name!=='AbortError')setError((e as Error).message);}
  finally{if(sequence.current===ticket)setBusy(false);}
 }
 useEffect(()=>{if(threadId)void load(threadId);return()=>{sequence.current++;request.current?.abort();};},[threadId]);
 return <section className="panel role-cases">
  <div className="panel-heading"><h2>대화 전체의 Sub-agent 이용 내역</h2><span className="badge unknown">전체 턴 · 실행 ID 중복 제거</span></div>
  <p>일반 스레드 목록에 없는 실행도 대화의 시작·상호작용·종료 기록에서 찾습니다. 특정 역할명으로 제한하지 않습니다.</p>
  <div className="turn-picker"><label>조회할 대화 <select aria-label="Sub-agent 이력 대화" value={threadId} onChange={e=>{sequence.current++;request.current?.abort();setResult(null);setThreadId(e.target.value);}}><option value="">대화를 선택하세요</option>{conversations.map(task=><option key={task.id} value={task.id}>{task.title}</option>)}</select></label><button disabled={!threadId||busy} onClick={()=>void load(threadId,true)}>{busy?'전체 이력 읽는 중…':'Sub-agent 이력 새로 읽기'}</button></div>
  {busy&&<div className="unavailable">대화의 턴과 항목 페이지를 읽고 있습니다. 조회 중인 개수는 미확인입니다.</div>}
  {error&&<div className="alert">{error} · 이용 내역과 개수는 미확인입니다.</div>}
  {!busy&&!error&&!result&&<p className="muted">대화를 선택하면 이용 내역을 조회합니다. 미조회 상태를 0회로 표시하지 않습니다.</p>}
  {result&&<>
   <div className="evidence-metrics">{[['확인된 고유 실행',result.summary.observed],['종료 기록 확인',result.summary.completed],['토큰 제공 실행',result.summary.usageAvailable],['토큰 API 미제공',result.summary.usageUnavailable]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong><small>{result.coverage.complete?'조회한 대화 전체 기준':'일부 조회 · 확인된 범위'}</small></div>)}</div>
   <p className="muted">{result.coverage.scannedTurns}개 턴 · {result.coverage.itemPages}개 항목 페이지 · 같은 ID의 여러 done 기록은 1개 실행으로 셉니다. 종료는 품질 통과나 토큰 제공을 뜻하지 않습니다.</p>
   {!result.coverage.complete&&<div className="alert">일부 범위만 확인했습니다. 실행 개수를 전체 개수로 단정하지 않습니다. 메타데이터 미확인 {result.coverage.unresolved}개{result.coverage.agentsTruncated?' · 실행 조회 한도 도달':''}{result.coverage.errors.map((message,index)=><p key={index}>{message}</p>)}</div>}
   {!result.agents.length&&<div className="unavailable">{result.coverage.complete?'이 대화의 조회 가능한 전체 기록에서 Sub-agent 참조가 발견되지 않았습니다.':'현재 확인한 일부 기록에서는 Sub-agent 참조가 발견되지 않았습니다.'}</div>}
   <div className="role-instance-grid">{result.agents.map((agent,index)=><article className="role-instance" key={agent.id}>
    <div className="card-top"><span className="project-chip">실행 {index+1} · {agent.thread?.role||'역할 미제공'}</span><span className={'badge '+(agent.observedStatus==='completed'?'ended':'unknown')}>{agent.observedStatus==='completed'?'종료 기록 확인':agent.observedStatus||'상태 미관측'}</span></div>
    <h3>{agent.thread?.nickname||agent.thread?.title||'메타데이터 미확인 실행'}</h3>
    <p><b>맡은 일 · 스레드 미리보기</b><br/>{agent.thread?.scope||'미제공 · 같은 턴의 지시는 상세에서 확인'}</p>
    <dl><dt>출처</dt><dd>대화의 활동·협업 기록</dd><dt>일반 목록</dt><dd>{agent.listed?'목록에서도 관측':'목록 미포함 · ID 직접 읽기'}</dd><dt>부모 관계</dt><dd>{agent.thread?.parentId===result.threadId?'선택한 대화의 직접 하위 실행':agent.thread?.parentId?'다른 부모 관계 · 관련 실행 참조':'관계 ID 미제공'}</dd><dt>실행 ID</dt><dd>{agent.id}</dd><dt>모델</dt><dd>{agent.thread?.model||'미제공'}</dd></dl>
    <h4>토큰 사용량</h4>
    {agent.usageStatus==='error'?<div className="alert">조회 오류 · {agent.usageReason}</div>:agent.tokens?.length?<>{agent.tokens.map((group,i)=><div className="token-group" key={i}><b>{group.model||'모델 미제공'}</b><dl>{[['입력',group.inputTokens],['출력',group.outputTokens],['캐시 입력',group.cachedInputTokens],['전체',group.totalTokens]].map(([label,value])=><React.Fragment key={String(label)}><dt>{label}</dt><dd>{typeof value==='number'?`${value.toLocaleString()} tokens`:'미제공'}</dd></React.Fragment>)}</dl></div>)}</>:<div className="unavailable"><b>API 미제공 · 0 tokens가 아닙니다</b><p>{agent.usageReason}</p></div>}
    <p className="muted">공식 스레드별 사용량만 표시합니다. 부모·자식 토큰과 종료 횟수는 합산하지 않습니다.</p>
    <details className="text-disclosure"><summary>대화 내 실행 근거 {agent.evidence.length}건</summary>{agent.evidence.map((row,i)=><p key={i}>턴 {row.turnId}<br/>{row.kind} · {row.status||'상태 미관측'}<br/>항목 {row.itemId}</p>)}</details>
    {agent.thread&&<button className="refresh" onClick={()=>onOpen(agent.thread!)}>이 실행의 지시·결과·검증 상세 ↗</button>}
   </article>)}</div>
   <p className="muted">마지막 확인 {new Date(result.checkedAt).toLocaleString('ko-KR')} · 공식 읽기 API · 평가·자동 실행 기능 없음</p>
  </>}
 </section>;
}
