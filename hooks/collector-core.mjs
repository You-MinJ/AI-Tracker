import path from 'node:path';
import {redactSecrets} from '../server/secrets.mjs';
export const OWNER='orbit-project-hooks-trial/v1';
export const TRIAL_MARKER='DASHBOARD_HOOK_TRIAL_V1';
export const EVENTS=['UserPromptSubmit','SubagentStart','SubagentStop','Stop'];
export const ROLES=new Set(['ys_researcher','ys_reviewer']);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)?v:null;
const internal=v=>/guardian|auto.?review|safety.?review|memory_consolidation|compact/i.test(String(v??''));
export function safeText(v,max=4000){if(typeof v!=='string')return null;if(/"risk_level"[\s\S]*"user_authorization"|<analysis>|<think>|guardian review/i.test(v))return null;return redactSecrets(v).slice(0,max);}
export function projectHook(input,{projectRoot,registeredSessions=new Set(),now=new Date().toISOString()}){
 if(!input||typeof input!=='object'||!EVENTS.includes(input.hook_event_name))return {skip:'unsupported-event'};
 const cwd=typeof input.cwd==='string'?path.resolve(input.cwd):null,root=path.resolve(projectRoot);
 if(!cwd||(cwd!==root&&!cwd.startsWith(root+path.sep)))return {skip:'outside-project'};
 const sessionId=id(input.session_id),turnId=id(input.turn_id);if(!sessionId||!turnId)return {skip:'missing-identifiers'};
 if(internal(input.agent_type)||internal(input.model))return {skip:'internal-event'};
 const kind=input.hook_event_name;
 const optedIn=kind==='UserPromptSubmit'&&typeof input.prompt==='string'&&input.prompt.includes(TRIAL_MARKER);
 if(!optedIn&&!registeredSessions.has(sessionId))return {skip:'unregistered-session'};
 if((kind==='SubagentStart'||kind==='SubagentStop')&&(!ROLES.has(input.agent_type)||!id(input.agent_id)))return {skip:'non-trial-agent'};
 const event={owner:OWNER,schemaVersion:1,trial:true,source:'project-hook',event:kind,sessionId,turnId,receivedAt:now,timeBasis:'collector-receipt',project:root,model:safeText(input.model,160)};
 if(kind==='UserPromptSubmit'){const prompt=safeText(input.prompt);if(!prompt)return {skip:'non-public-content'};event.prompt=prompt;}
 if(kind==='SubagentStart'||kind==='SubagentStop'){event.agentId=id(input.agent_id);event.agentType=input.agent_type;}
 if(kind==='SubagentStop'||kind==='Stop'){const result=safeText(input.last_assistant_message);if(input.last_assistant_message&&!result)return {skip:'non-public-content'};event.publicResult=result;}
 return {event,registerSession:optedIn?sessionId:null};
}
