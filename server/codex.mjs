import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {existsSync} from 'node:fs';
const bundled='/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
const binary=()=>process.env.CODEX_BIN||(existsSync(bundled)?bundled:'codex');
const allowed=new Set(['initialize','thread/list','thread/read','thread/turns/list','thread/items/list','account/rateLimits/read','account/usage/read']);
export class CodexReader {
 constructor(){this.pending=new Map();this.id=0;this.proc=null;this.ready=null;this.version='설치 CLI 버전 미제공';}
 async connect(){if(this.ready)return this.ready;this.ready=this.open().catch(e=>{this.ready=null;throw e});return this.ready;}
 async open(){const proc=spawn(binary(),['app-server','--stdio','-c','analytics.enabled=false'],{stdio:['pipe','pipe','ignore'],env:{...process.env,RUST_LOG:'error'}});this.proc=proc;
 const end=()=>{if(this.proc!==proc)return;this.proc=null;this.ready=null;for(let p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Codex 읽기 연결 종료'));}this.pending.clear();};proc.on('error',end);proc.on('exit',end);
 readline.createInterface({input:proc.stdout}).on('line',line=>{try{let msg=JSON.parse(line);if(msg.id!=null&&this.pending.has(msg.id)){let p=this.pending.get(msg.id);clearTimeout(p.timer);this.pending.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);} // 서버 요청에는 승인·실행 응답을 보내지 않습니다.
 }catch{}});
 await this.request('initialize',{clientInfo:{name:'local_agent_observatory',version:'1.0.0'}});proc.stdin.write(JSON.stringify({method:'initialized'})+'\n');}
 request(method,params){if(!allowed.has(method))throw new Error('읽기 허용 목록 외 API');if(!this.proc)return Promise.reject(new Error('Codex 연결 없음'));return new Promise((resolve,reject)=>{let id=++this.id;let timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Codex 응답 시간 초과'));},12000);this.pending.set(id,{resolve,reject,timer});this.proc.stdin.write(JSON.stringify({id,method,params})+'\n');});}
 async call(method,params){await this.connect();return this.request(method,params);}
 close(){this.proc?.kill();}
}
