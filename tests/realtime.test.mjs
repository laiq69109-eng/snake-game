import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';
process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'snake-ws-'));delete process.env.PUBLIC_ORIGIN;
const {server,realtime}=await import('../app.mjs');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
async function api(action,data={}){const r=await fetch(origin+'/api/'+action,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(data)});assert.equal(r.status,200);return r.json();}
function connect(auth){
  const socket=new WebSocket(origin.replace('http:','ws:')+'/realtime',{origin}),messages=[];
  const ready=new Promise((resolve,reject)=>{socket.once('error',reject);socket.on('message',raw=>{const data=JSON.parse(raw);messages.push(data);if(data.type==='state')resolve(data);});socket.once('open',()=>socket.send(JSON.stringify({type:'hello',...auth})));});
  return {socket,messages,ready};
}
async function waitFor(fn,timeout=2500){const start=Date.now();while(!fn()){if(Date.now()-start>timeout)throw Error('Timed out waiting for real-time state');await new Promise(r=>setTimeout(r,15));}return fn();}
test.after(()=>{realtime.close();server.close();});
for(const count of [2,3,4])test(count+' real-time clients receive authoritative movement without HTTP polling',async()=>{
  const host=await api('create',{name:'host'}),auth=[{code:host.room.code,id:host.id,token:host.token}],connections=[];
  try{
    for(let i=1;i<count;i++){const p=await api('join',{code:host.room.code,name:'p'+i});auth.push({code:host.room.code,id:p.id,token:p.token});}
    for(const a of auth)connections.push(connect(a));await Promise.all(connections.map(c=>c.ready));
    const initial=await api('start',auth[0]);
    await waitFor(()=>connections.every(c=>c.messages.some(m=>m.room?.status==='playing')));
    connections[0].socket.send(JSON.stringify({type:'input',dir:0,seq:1}));
    await waitFor(()=>connections.every(c=>c.messages.some(m=>(m.room?.players[0].inputSeq===1||(m.type==='frame'&&m.p[0][9]===1)))));
    await waitFor(()=>connections.every(c=>c.messages.some(m=>(m.room?.tick||m.tick)>initial.room.started)),4500);
    const latest=connections.at(-1).messages.filter(m=>m.type==='frame').at(-1);
    assert.ok(latest);assert.equal(latest.tokens,undefined);assert.equal(latest.p.length,count);assert.equal(latest.p[0][1],0);assert.ok(Math.floor(latest.p[0][10][0]/30)<6);assert.ok(connections[0].socket.extensions.includes('permessage-deflate'));
    const full=connections.at(-1).messages.find(m=>m.type==='state'&&m.room.status==='playing');assert.ok(JSON.stringify(latest).length<JSON.stringify(full).length);
    connections[0].socket.send(JSON.stringify({type:'ping',at:123}));await waitFor(()=>connections[0].messages.some(m=>m.type==='pong'&&m.at===123));
  }finally{for(const c of connections)c.socket.close();await Promise.allSettled(auth.map(a=>api('leave',a)));}
});
test('forged WebSocket session is closed without returning room tokens',async()=>{
  const a=await api('create');const socket=new WebSocket(origin.replace('http:','ws:')+'/realtime',{origin});let messages=0;
  socket.on('message',()=>messages++);socket.on('open',()=>socket.send(JSON.stringify({type:'hello',code:a.room.code,id:a.id,token:'wrong'})));
  const code=await new Promise(resolve=>socket.once('close',resolve));assert.equal(code,4401);assert.equal(messages,0);
});
