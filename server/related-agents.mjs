import {normalize,isInternalThread} from './model.mjs';
import {clean} from './review.mjs';
import {collectAgentReferences} from './agent-usage.mjs';

export function filterAgentEntries(entries,relatedAgents,excludedIds){
 const verified=new Set(relatedAgents.filter(agent=>agent.thread).map(agent=>agent.id));
 return entries.filter(entry=>![...(entry.receivers??[]),...(entry.agentStates??[]).map(state=>state.threadId)].some(id=>excludedIds.has(id))).map(entry=>{
  if(entry.type!=='collabAgentToolCall')return entry;
  const ids=[...(entry.receivers??[]),...(entry.agentStates??[]).map(state=>state.threadId)];
  if(ids.length&&ids.every(id=>verified.has(id)))return entry;
  // Classification failed or exceeded the bounded metadata read; never expose its prompt.
  return {...entry,summary:'하위 실행 분류 미확인 · 지시 내용 숨김',scope:null,output:'',agentStates:(entry.agentStates??[]).map(state=>({...state,message:null}))};
 });
}

// Follow only IDs observed in the selected turn, even if absent from thread/list.
// Read metadata before usage so internal/system executions remain excluded.
export async function readRelatedAgents(reader,usageReader,entries,{excludedIds=new Set(),refresh=false,limit=20}={}){
 const references=collectAgentReferences(entries).filter(ref=>!excludedIds.has(ref.id));
 const chosen=references.slice(0,limit),results=[];
 for(let start=0;start<chosen.length;start+=4){
  const batch=await Promise.all(chosen.slice(start,start+4).map(async ref=>{
   try{
    const {thread}=await reader.call('thread/read',{threadId:ref.id,includeTurns:false});
    if(!thread||thread.id!==ref.id)throw Error('하위 실행 메타데이터 ID 불일치');
    if(isInternalThread(thread)){excludedIds.add(ref.id);return null;}
    return {...ref,thread:{...normalize(thread,null,new Date().toISOString()),review:null},...await usageReader.read(thread,{refresh})};
   }catch(error){
    return {...ref,thread:null,tokens:null,usageCheckedAt:new Date().toISOString(),usageStatus:'error',usageReason:clean(`하위 실행 메타데이터 조회 실패: ${error.message}`,500)};
   }
  }));
  results.push(...batch.filter(Boolean));
 }
 return {relatedAgents:results,relatedAgentsTruncated:references.length>chosen.length};
}
