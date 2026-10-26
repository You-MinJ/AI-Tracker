export function devProxy(apiPort,uiPort){
 const apiOrigin=`http://127.0.0.1:${apiPort}`;
 const uiOrigin=`http://127.0.0.1:${uiPort}`;
 return {target:apiOrigin,changeOrigin:true,configure(proxy){
  proxy.on('proxyReq',(outgoing,incoming)=>{
   // Translate only the exact local dev origin. Foreign origins remain rejected.
   if(incoming.headers.origin===uiOrigin)outgoing.setHeader('Origin',apiOrigin);
  });
 }};
}
