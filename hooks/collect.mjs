// Project-scoped observational hook. Never executes a tool, model, approval, or network request.
import {mkdir,open,realpath} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath}from'node:url';import{randomUUID,createHash}from'node:crypto';
import{OWNER,projectHook}from'./collector-core.mjs';
import{loadSessionsAndPrune}from'./storage.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(root,'data/events');
async function writeOwned(name,data){const f=await open(path.join(dir,name),'wx',0o600);try{await f.writeFile(JSON.stringify(data)+'\n')}finally{await f.close()}}
async function run(){
 let bytes=0,text='';const timer=setTimeout(()=>process.stdin.destroy(),1000);for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>262144)throw Error('INPUT_LIMIT');text+=chunk;}clearTimeout(timer);const payload=JSON.parse(text);
 const actualRoot=await realpath(root),actualCwd=await realpath(payload.cwd??'');if(actualCwd!==actualRoot&&!actualCwd.startsWith(actualRoot+path.sep))return;
 await mkdir(dir,{recursive:true,mode:0o700});const sessions=await loadSessionsAndPrune(dir);
 const projected=projectHook(payload,{projectRoot:actualRoot,registeredSessions:sessions});
 if(projected.issue){await writeOwned(`orbit-hook-v1-${Date.now()}-${randomUUID()}.json`,{owner:OWNER,schemaVersion:1,trial:true,source:'collector-health',receivedAt:new Date().toISOString(),issue:projected.issue});return;}
 if(!projected.event)return;
 if(projected.registerSession){const name=`orbit-hook-session-v1-${createHash('sha256').update(projected.registerSession).digest('hex')}.json`;try{await writeOwned(name,{owner:OWNER,kind:'trial-session',sessionId:projected.registerSession,createdAt:new Date().toISOString()})}catch(e){if(e.code!=='EEXIST')throw e;}}
 await writeOwned(`orbit-hook-v1-${Date.now()}-${randomUUID()}.json`,projected.event);
}
try{await run()}catch{
 // Fail open: no hook decision/context, raw error or input is emitted or stored.
 // An unsuccessful collector process is observable by the human-led trial, not retried here.
 process.stderr.write('Orbit hook collector could not record this event. Pause the trial for review.\n');
}finally{process.stdout.write('{}\n');}
