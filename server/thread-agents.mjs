import {readRelatedAgents} from './related-agents.mjs';
import {clean} from './review.mjs';
import {isPublicSubagent} from '../src/agent-cases.mjs';

// Scan public relationship fields only. Never retain prompts, reasoning or raw items.
export async function scanThreadAgents(reader,usageReader,threadId,{excludedIds=new Set(),refresh=false,maxTurnPages=20,maxItemPages=200,maxAgents=100}={}){
 const records=[],evidence=new Map(),errors=[];
 let turnCursor=null,turnPages=0,itemPages=0,scannedTurns=0,complete=true,stop=false;
 const turnCursors=new Set();
 do{
  if(turnPages>=maxTurnPages||turnCursors.has(turnCursor)){complete=false;break;}
  turnCursors.add(turnCursor);
  let page;
  try{page=await reader.call('thread/turns/list',{threadId,limit:50,itemsView:'notLoaded',sortDirection:'asc',cursor:turnCursor});turnPages++;}
  catch(error){complete=false;errors.push(clean(`턴 목록 읽기 실패: ${error.message}`,300));break;}
  for(const turn of page.data??[]){
   let itemCursor=null;const itemCursors=new Set();
   do{
    if(itemPages>=maxItemPages||itemCursors.has(itemCursor)){complete=false;stop=true;break;}
    itemCursors.add(itemCursor);
    let items;
    try{items=await reader.call('thread/items/list',{threadId,turnId:turn.id,limit:100,sortDirection:'asc',cursor:itemCursor});itemPages++;}
    catch(error){complete=false;errors.push(clean(`턴 항목 읽기 실패: ${error.message}`,300));break;}
    for(const entry of items.data??[]){
     if(entry.turnId!==turn.id)continue;
     const item=entry.item;
     if(!['subAgentActivity','collabAgentToolCall'].includes(item?.type))continue;
     const states=item.type==='subAgentActivity'?[{threadId:item.agentThreadId,status:({started:'running',completed:'completed',interrupted:'interrupted'})[item.kind]??null}]:Object.entries(item.agentsStates??{}).map(([threadId,state])=>({threadId,status:state?.status??null}));
     const receivers=item.type==='subAgentActivity'?[item.agentThreadId]:(item.receiverThreadIds??[]);
     records.push({id:item.id,turnId:turn.id,type:item.type,receivers,agentStates:states});
     for(const id of new Set([...receivers,...states.map(state=>state.threadId)])){
      if(!id||id===threadId)continue;
      const rows=evidence.get(id)??[];
      if(!rows.some(row=>row.itemId===item.id&&row.turnId===turn.id))rows.push({turnId:turn.id,itemId:item.id,kind:item.type==='subAgentActivity'?clean(item.kind,80):'collaboration',status:states.find(state=>state.threadId===id)?.status??null});
      evidence.set(id,rows);
     }
    }
    itemCursor=items.nextCursor??null;
   }while(itemCursor);
   scannedTurns++;
   if(stop)break;
  }
  if(stop)break;
  turnCursor=page.nextCursor??null;
 }while(turnCursor);
 const filteredRecords=records.map(record=>({...record,receivers:record.receivers.filter(id=>id!==threadId),agentStates:record.agentStates.filter(state=>state.threadId!==threadId)}));
 const related=await readRelatedAgents(reader,usageReader,filteredRecords,{excludedIds,refresh,limit:maxAgents});
 const agents=related.relatedAgents.filter(agent=>!agent.thread||isPublicSubagent(agent.thread)).map(agent=>({...agent,evidence:evidence.get(agent.id)??[],listed:false}));
 const classified=agents.filter(agent=>agent.thread);
 const unresolved=agents.length-classified.length;
 if(related.relatedAgentsTruncated||unresolved)complete=false;
 return {threadId,agents,checkedAt:new Date().toISOString(),coverage:{complete,scannedTurns,turnPages,itemPages,agentsTruncated:related.relatedAgentsTruncated,unresolved,errors},summary:{observed:classified.length,completed:classified.filter(agent=>agent.observedStatus==='completed').length,usageAvailable:classified.filter(agent=>agent.usageStatus==='available'&&agent.tokens?.some(group=>Object.values(group).some(value=>typeof value==='number'))).length,usageUnavailable:classified.filter(agent=>agent.usageStatus==='unavailable').length,usageErrors:classified.filter(agent=>agent.usageStatus==='error').length}};
}
