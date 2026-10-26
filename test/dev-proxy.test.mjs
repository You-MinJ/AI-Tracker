import test from 'node:test';
import assert from 'node:assert/strict';
import {devProxy} from '../scripts/dev-proxy.mjs';
test('dev proxy translates only its local frontend origin without clearing cross-site evidence',()=>{
 const config=devProxy(4312,5173);let handler;
 config.configure({on(event,fn){assert.equal(event,'proxyReq');handler=fn;}});
 assert.equal(config.changeOrigin,true);
 for(const origin of ['http://127.0.0.1:5173','https://foreign.invalid',undefined]){
  const headers={origin,'sec-fetch-site':'cross-site'};
  handler({setHeader(name,value){headers[name.toLowerCase()]=value;}},{headers});
  assert.equal(headers.origin,origin==='http://127.0.0.1:5173'?'http://127.0.0.1:4312':origin);
  assert.equal(headers['sec-fetch-site'],'cross-site');
 }
});
