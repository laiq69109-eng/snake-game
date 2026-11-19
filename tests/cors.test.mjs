import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'snake-cors-'));
process.env.CORS_ORIGINS='https://laiq69109-eng.github.io';delete process.env.PUBLIC_ORIGIN;
const {server,realtime}=await import('../app.mjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,origin=process.env.CORS_ORIGINS;
test.after(()=>{realtime.close();server.close();});
test('only the configured static origin can preflight and create rooms',async()=>{
  const pre=await fetch(base+'/api/create',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type'}});assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),origin);
  const r=await fetch(base+'/api/create',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),origin);
  const wrong=await fetch(base+'/api/create',{method:'POST',headers:{origin:'https://other.example.com','content-type':'application/json'},body:'{}'});assert.equal(wrong.status,403);assert.equal(wrong.headers.get('access-control-allow-origin'),null);
  const badPre=await fetch(base+'/api/create',{method:'OPTIONS',headers:{origin:'https://other.example.com'}});assert.equal(badPre.status,403);
});
test('a configured static origin can authenticate over WebSocket',async()=>{
  const a=await (await fetch(base+'/api/create',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'})).json();
  const socket=new WebSocket(base.replace('http:','ws:')+'/realtime',{origin});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No state')),2000);socket.once('error',reject);socket.once('open',()=>socket.send(JSON.stringify({type:'hello',code:a.room.code,id:a.id,token:a.token})));socket.once('message',raw=>{const m=JSON.parse(raw);assert.equal(m.type,'state');assert.equal(m.room.code,a.room.code);assert.equal(m.room.tokens,undefined);clearTimeout(timer);socket.close();resolve();});});
});
test('a different WebSocket origin is rejected even with a valid service address',async()=>{
  const socket=new WebSocket(base.replace('http:','ws:')+'/realtime',{origin:'https://other.example.com'});
  const status=await new Promise(resolve=>{socket.on('error',()=>{});socket.once('unexpected-response',(_,r)=>{r.resume();socket.terminate();resolve(r.statusCode);});});assert.equal(status,403);
});
