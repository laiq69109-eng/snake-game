import {WebSocketServer,WebSocket} from 'ws';
import {advance,turn} from './src/engine.js';

export function attachRealtime(server,db,publicOrigin,allowedOrigins=()=>[]){
  const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:{threshold:128,concurrencyLimit:4,serverNoContextTakeover:true,clientNoContextTakeover:true,zlibDeflateOptions:{level:3}}});
  const clients=new Map();
  const lastSent=new Map();
  const lastMeta=new Map();
  const select=db.prepare('SELECT data,rev FROM rooms WHERE code=? AND updated>?');
  const update=db.prepare('UPDATE rooms SET data=?,rev=rev+1,updated=? WHERE code=? AND rev=?');
  function load(code){const row=select.get(code,Date.now()-7200000);return row?{...row,room:JSON.parse(row.data)}:null;}
  function save(row){return Number(update.run(JSON.stringify(row.room),Date.now(),row.room.code,row.rev).changes)>0;}
  function send(ws,msg){if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<65536)ws.send(JSON.stringify(msg));}
  function broadcast(room,forceFull=false){
    const now=Date.now(),meta=JSON.stringify([room.status,room.started,room.host,room.players.map(p=>[p.id,p.name,p.color,p.slot])]);
    const {tokens,...safe}=room;
    const payload=forceFull||lastMeta.get(room.code)!==meta?{type:'state',room:{...safe,now}}:{type:'frame',code:room.code,now,tick:room.tick,p:room.players.map(p=>[p.slot,p.dir,p.next,p.turns||[],p.score,p.alive?1:0,p.respawn-room.tick,p.shield-room.tick,now-p.seen,p.inputSeq||0,p.body.map(b=>b.y*30+b.x)])};
    for(const [ws,c] of clients)if(c.code===room.code)send(ws,payload);
    lastMeta.set(room.code,meta);lastSent.set(room.code,room.status+':'+room.started+':'+room.tick);
  }
  server.on('upgrade',(req,socket,head)=>{
    let origin;try{origin=publicOrigin(req);}catch{socket.destroy();return;}
    if(req.url!=='/realtime'||(req.headers.origin&&req.headers.origin!==origin&&!allowedOrigins().includes(req.headers.origin))){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  wss.on('connection',ws=>{
    let count=0,windowAt=Date.now();
    const authTimeout=setTimeout(()=>{if(!clients.has(ws))ws.close(4401,'Authentication required');},5000);authTimeout.unref();
    ws.on('error',()=>{});
    ws.on('close',()=>{clearTimeout(authTimeout);clients.delete(ws);});
    ws.on('message',raw=>{
      try{
        const now=Date.now();if(now-windowAt>1000){count=0;windowAt=now;}if(++count>100){ws.close(1008,'Too many inputs');return;}
        const msg=JSON.parse(raw.toString());
        if(msg.type==='hello'){
          if(!/^\d{6}$/.test(msg.code||'')){ws.close(4401,'Invalid session');return;}
          const row=load(msg.code),p=row?.room.players.find(p=>p.id===msg.id);
          if(!p||row.room.tokens[msg.id]!==msg.token){ws.close(4401,'Invalid session');return;}
          clients.set(ws,{code:msg.code,id:msg.id});clearTimeout(authTimeout);p.seen=now;save(row);broadcast(row.room,true);return;
        }
        const c=clients.get(ws);if(!c){ws.close(4401,'Authentication required');return;}
        if(msg.type==='ping'){send(ws,{type:'pong',at:msg.at,now});return;}
        if(msg.type==='input'){
          const row=load(c.code),p=row?.room.players.find(p=>p.id===c.id);
          if(!p){ws.close(4401,'Session ended');return;}
          advance(row.room,now);p.seen=now;
          if(Number.isSafeInteger(msg.seq)&&msg.seq>0&&msg.seq>(p.inputSeq||0)){
            if(row.room.status==='playing'&&p.alive)turn(p,msg.dir);
            p.inputSeq=msg.seq;
          }
          if(save(row))broadcast(row.room);
        }
      }catch{send(ws,{type:'error',error:'消息无效'});}
    });
  });
  let lastLobby=0;
  const timer=setInterval(()=>{
    const now=Date.now(),codes=new Set([...clients.values()].map(c=>c.code));
    for(const code of codes){
      try{
        const row=load(code);if(!row){for(const [ws,c] of clients)if(c.code===code)ws.close(4401,'Room expired');continue;}
        const r=row.room;for(const [ws,c] of clients)if(c.code===code){const p=r.players.find(p=>p.id===c.id);if(p)p.seen=now;else ws.close(4401,'Session ended');}
        advance(r,now);save(row);
        const stamp=r.status+':'+r.started+':'+r.tick;
        if((r.status==='playing'&&lastSent.get(code)!==stamp)||(r.status!=='playing'&&now-lastLobby>=500))broadcast(r);
      }catch{console.error('Realtime room update failed');}
    }
    if(now-lastLobby>=500)lastLobby=now;
  },50);timer.unref();
  function close(){clearInterval(timer);for(const ws of wss.clients)ws.terminate();wss.close();}
  server.on('close',close);
  return {close,connections:()=>clients.size};
}
