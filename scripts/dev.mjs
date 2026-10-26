import {spawn} from 'node:child_process';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {devProxy} from './dev-proxy.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const apiPort=Number(process.env.DEV_API_PORT||4312);
const uiPort=Number(process.env.DEV_PORT||5173);
for(const port of [apiPort,uiPort]){
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('개발 포트는 1024~65535 정수여야 합니다.');
}
if(apiPort===uiPort)throw Error('개발 화면과 API 포트는 달라야 합니다.');
async function checkPort(port){
 await new Promise((resolve,reject)=>{
  const probe=net.createServer();
  probe.once('error',()=>reject(Error(`127.0.0.1:${port} 포트가 사용 중이거나 열 수 없습니다. 기존 서버를 확인하거나 개발 포트를 변경하세요.`)));
  probe.listen(port,'127.0.0.1',()=>probe.close(resolve));
 });
}
let api,vite,stopping=false;
async function stop(code=0){
 if(stopping)return;
 stopping=true;
 await vite?.close();
 if(api&&api.exitCode===null&&api.signalCode===null){
  await new Promise(resolve=>{api.once('exit',resolve);api.kill('SIGTERM');});
 }
 process.exitCode=code;
}
try{
 await checkPort(apiPort);
 await checkPort(uiPort);
 vite=await createServer({root,server:{host:'127.0.0.1',port:uiPort,strictPort:true,proxy:{'/api':devProxy(apiPort,uiPort)}}});
 api=spawn(process.execPath,['--watch','server/index.mjs'],{cwd:root,env:{...process.env,PORT:String(apiPort)},stdio:'inherit'});
 api.once('error',error=>{console.error(error.message);void stop(1);});
 api.once('exit',()=>{if(!stopping){console.error('개발 API 감시 프로세스가 종료됐습니다.');void stop(1);}});
 process.once('SIGINT',()=>void stop());
 process.once('SIGTERM',()=>void stop());
 await vite.listen();
 console.log(`개발 화면 http://127.0.0.1:${uiPort} · API http://127.0.0.1:${apiPort}`);
 console.log('화면 변경은 자동 반영, server 코드 변경은 API 자동 재시작 · 종료 Ctrl+C');
}catch(error){
 console.error(error.message);
 await stop(1);
}
