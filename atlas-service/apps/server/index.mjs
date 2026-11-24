import {randomBytes,randomInt,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import WS from './vendor/node_modules/faye-websocket/lib/faye/websocket.js';
import {openStore} from './store.mjs';
import {createHttp} from './http.mjs';
import {createGame,applyCommand,publicState,expire,migrateGame} from '../../packages/game-core/index.mjs';
import {decide} from '../../packages/ai/index.mjs';
import {validateCommand,DEFAULT_ROUND_LIMIT,isRoundLimit,migrateRoundLimit} from '../../packages/protocol/index.mjs';
import {validateMap} from '../../packages/maps/validate.mjs';

const mapIds=['cn','world','us','uk','fr','de','jp','it'];
const maps=new Map();
async function loadMap(id){
  if(!maps.has(id)){
    requireThat(mapIds.includes(id),'BAD_MAP','地图无效');
    const map=JSON.parse(await readFile(new URL('../../packages/maps/'+id+'.json',import.meta.url),'utf8'));
    maps.set(id,validateMap(map));
  }
  return maps.get(id);
}
const defaultSettings={mapId:'cn',mode:'classic',roundLimit:DEFAULT_ROUND_LIMIT,classicBuildingRules:false,aiFill:false,difficulty:'normal'};
const tokenHash=s=>createHash('sha256').update(s).digest('hex');
const random=()=>randomInt(0x100000000)/0x100000000;
function requireThat(ok,code,message){if(!ok)throw Object.assign(Error(message),{code});}
function fields(v,keys){
  requireThat(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k)),'BAD_SCHEMA','请求字段无效');
}
function settings(data,initial){
  fields(data,Object.keys(defaultSettings));const s={...initial,...data};
  requireThat(mapIds.includes(s.mapId)&&['classic','quick'].includes(s.mode)&&isRoundLimit(s.roundLimit)&&typeof s.aiFill==='boolean'&&typeof s.classicBuildingRules==='boolean'&&['easy','normal','hard'].includes(s.difficulty),'BAD_SETTINGS','房间设置无效');return s;
}
function makePlayer(input){
  requireThat(typeof input.name==='string'&&input.name.trim()&&[...input.name].length<=20&&!/[\x00-\x1f]/.test(input.name),'BAD_NAME','昵称应为 1 至 20 个字符');
  const avatar=input.avatar??0;
  requireThat((Number.isInteger(avatar)&&avatar>=0&&avatar<16)||(typeof avatar==='string'&&avatar.length<=32),'BAD_AVATAR','头像无效');
  const token=randomBytes(32).toString('hex');
  return {token,player:{id:randomBytes(8).toString('hex'),name:input.name.trim(),avatar,tokenHash:tokenHash(token),ready:false,online:true,offlineSince:null}};
}
// Human seats carry reconnect credentials. Lobby bots never get sessions or host privileges.
const bots = [
  {id:'ai-1',name:'阿澜',avatar:4,ai:true},
  {id:'ai-2',name:'白栎',avatar:5,ai:true},
  {id:'ai-3',name:'南星',avatar:6,ai:true}
];
function lobbyBots(room){
  if(room.game)return room.game.players.filter(p=>p.ai).map(({id,name,avatar,ai})=>({id,name,avatar,ai}));
  const chosen=room.settings.aiFill?bots:bots.filter(b=>(room.botIds||[]).includes(b.id));
  return chosen.slice(0,Math.max(0,4-room.players.length));
}
function editBot(room,removeId){
  const current=lobbyBots(room);
  if(removeId!==undefined){
    requireThat(current.some(b=>b.id===removeId),'NO_BOT','该人机席位已改变');
    room.botIds=current.filter(b=>b.id!==removeId).map(b=>b.id);
  }else{
    requireThat(room.players.length+current.length<4,'ROOM_FULL','所有席位已满');
    const next=bots.find(b=>!current.some(p=>p.id===b.id));
    room.botIds=[...current.map(b=>b.id),next.id];
  }
  room.settings.aiFill=false;
  for(const p of room.players)p.ready=false;
}
function view(r){
  const game=r.game?publicState(r.game):null;
  if(game)for(const p of game.players){
    const seat=r.players.find(seat=>seat.id===p.id);
    p.aiControlled=!!p.ai||!!seat?.proxy;
  }
  return {code:r.code,hostId:r.hostId,revision:r.revision,settings:r.settings,deadline:r.deadline,bots:lobbyBots(r),players:r.players.map(({tokenHash:_,...p})=>p),game};
}
function arm(r,old){
  if(!r.game)return;
  const g=r.game,prev=old?.game;
  if(g.phase==='finished'){r.deadline=null;return;}
  if(g.phase==='trade'){r.deadline=g.trade.deadline;return;}
  if(!prev||prev.phase!==g.phase||prev.current!==g.current||prev.debt?.from!==g.debt?.from||!r.deadline)r.deadline=Date.now()+45000;
}
function elect(r){if(!r.players.some(p=>p.id===r.hostId&&p.online))r.hostId=r.players.find(p=>p.online)?.id||r.hostId;}
export async function serve(port=Number(process.env.PORT||3000)){
  const rooms=new Map(),sockets=new Set(),nextAI=new Map();
  let store,ready=false,awaitingPredecessor=false;
  const {server,allowed,rate}=createHttp(rooms,port,()=>ready||awaitingPredecessor);
  let chain=Promise.resolve(),stopping=false,scheduled=false;
  function enqueue(fn){const p=chain.then(fn);chain=p.catch(e=>console.error('room operation:',e.code||e.name));return p;}
  function send(ws,obj){if(ws.readyState===1)ws.send(JSON.stringify(obj));}
  function broadcast(r){const room=view(r);for(const ws of sockets)if(ws.room===r.code)send(ws,{event:'snapshot',room});}
  async function commit(r,actor,id,action,payload={}){
    r.revision++;arm(r,rooms.get(r.code));await store.save(r,actor,id,action,payload);rooms.set(r.code,r);broadcast(r);
  }
  function bind(ws,r,p){
    for(const prior of sockets)if(prior!==ws&&prior.room===r.code&&prior.actor===p.id){prior.room=null;prior.close();}
    ws.room=r.code;ws.actor=p.id;
  }
  async function handle(ws,msg){
    fields(msg,['id','action','payload']);
    const {id,action,payload:d}=msg;
    requireThat(typeof id==='string'&&/^[\w-]{1,80}$/.test(id)&&typeof action==='string'&&action.length<40,'BAD_SCHEMA','请求编号无效');
    requireThat(d&&typeof d==='object'&&!Array.isArray(d),'BAD_SCHEMA','请求内容无效');
    const respond=v=>send(ws,{id,ok:true,...v});
    if(['room:create','room:join','room:resume'].includes(action)){
      if(ws.room && action==='room:resume' && ws.room===d.code){fields(d,['code','token']);return respond({room:view(rooms.get(ws.room)),playerId:ws.actor});}
      requireThat(!ws.room,'ALREADY_JOINED','请先离开当前房间');
      fields(d,action==='room:create'?['name','avatar','settings']:action==='room:join'?['code','name','avatar']:['code','token']);
      let r=structuredClone(rooms.get(d.code)),p,token;
      if(action==='room:create'){
        requireThat(rooms.size<10000,'CAPACITY','房间数量达到上限');
        let code;do{code=Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');}while(rooms.has(code));
        r={code,revision:0,hostId:null,settings:settings(d.settings||{},defaultSettings),players:[],game:null,deadline:null};
      } else requireThat(r,'ROOM_NOT_FOUND','房间不存在或已关闭');
      if(action==='room:resume'){
        requireThat(typeof d.token==='string'&&d.token.length===64,'BAD_TOKEN','房间身份已失效');
        p=r.players.find(v=>v.tokenHash===tokenHash(d.token));requireThat(p,'BAD_TOKEN','房间身份已失效');
        p.online=true;p.offlineSince=null;p.proxy=false;
      }else{
        requireThat(!r.game&&r.players.length<4,'ROOM_FULL','房间已满或已开局');
        const created=makePlayer(d);p=created.player;token=created.token;r.players.push(p);
        if(!r.settings.aiFill)r.botIds=lobbyBots(r).map(b=>b.id);
      }
      r.emptySince=null;elect(r);
      await commit(r,p.id,id,action);bind(ws,r,p);
      return respond({playerId:p.id,token,room:view(r)});
    }
    const old=rooms.get(ws.room);requireThat(old,'NO_SESSION','请先加入房间');
    if(action==='room:sync'){fields(d,[]);return respond({room:view(old)});}
    if(await store.seen(old.code,ws.actor,id))return respond({duplicate:true,revision:old.revision});
    const r=structuredClone(old),p=r.players.find(v=>v.id===ws.actor);
    requireThat(p?.online,'NO_SESSION','连接已失效');
    const owner=()=>requireThat(r.hostId===p.id,'HOST_ONLY','仅房主可执行');
    const lobby=()=>requireThat(!r.game,'ROOM_LOCKED','开局后已锁定设置');
    switch(action){
      case 'room:ready': fields(d,['ready']);lobby();requireThat(typeof d.ready==='boolean','BAD_SCHEMA','准备状态无效');p.ready=d.ready;break;
      case 'room:addBot':fields(d,[]);owner();lobby();editBot(r);break;
      case 'room:removeBot':
        fields(d,['id']);owner();lobby();requireThat(typeof d.id==='string','BAD_SCHEMA','请选择人机席位');
        editBot(r,d.id);break;
      case 'room:settings': {
        owner();lobby();const updated=settings(d,r.settings);
        if(updated.aiFill!==r.settings.aiFill)r.botIds=[];
        r.settings=updated;r.players.forEach(p=>p.ready=false);break;
      }
      case 'game:start': {
        fields(d,[]);owner();lobby();
        const seats=[...r.players.map(({id,name,avatar})=>({id,name,avatar,ai:false})),...lobbyBots(r)];
        requireThat(seats.length>=2&&seats.length<=4&&r.players.every(p=>p.ready&&p.online),
          'NOT_READY','至少需要两名参与者，且所有真人都要在线并准备');
        r.game=createGame(await loadMap(r.settings.mapId),seats,{...r.settings,limit:r.settings.roundLimit},{random});
        break;
      }
      case 'game:command': {
        fields(d,['revision','command']);requireThat(r.game,'NO_GAME','尚未开局');
        requireThat(d.revision===r.game.revision,'STALE_REVISION','状态已更新，请重试');
        requireThat(!r.deadline||Date.now()<r.deadline,'EXPIRED','操作阶段已超时');
        requireThat(d.command&&typeof d.command==='object'&&(!Object.hasOwn(d.command,'playerId')||d.command.playerId===p.id),'BAD_ACTOR','身份不匹配');
        const cmd={...d.command,playerId:p.id,commandId:id};validateCommand(cmd);
        r.game=applyCommand(r.game,cmd,await loadMap(r.settings.mapId),{now:Date.now(),random});break;
      }
      case 'room:leave': fields(d,[]);if(r.game){p.online=false;p.offlineSince=Date.now();}else r.players=r.players.filter(v=>v!==p);elect(r);if(!r.players.some(v=>v.online))r.emptySince=Date.now();break;
      default: requireThat(false,'UNKNOWN_ACTION','未知操作');
    }
    await commit(r,p.id,id,action,d);
    if(action==='room:leave'){ws.room=null;ws.actor=null;}
    respond({revision:r.revision});
  }
  server.on('upgrade',(req,socket,head)=>{
    if(!ready||stopping||req.url!=='/socket'||!allowed(req)||!rate(req,'upgrade',180)||!WS.isWebSocket(req)||req.headers['sec-websocket-version']!=='13'){socket.destroy();return;}
    const ws=new WS(req,socket,head,undefined,{maxLength:8192,ping:30});sockets.add(ws);
    let epoch=Date.now(),count=0,outstanding=0;
    ws.on('message',e=>{
      if(stopping)return;
      if(Date.now()-epoch>10000){epoch=Date.now();count=0;}
      if(typeof e.data!=='string'||++count>80||outstanding>=12){ws.close(4008,'rate limit');return;}
      outstanding++;
      enqueue(async()=>{let msg;try{msg=JSON.parse(e.data);await handle(ws,msg);}catch(err){send(ws,{id:msg?.id,ok:false,error:err.code||'INVALID_REQUEST',message:err.code?err.message:'请求未被接受'});}}).finally(()=>outstanding--);
    });
    ws.on('close',()=>{sockets.delete(ws);if(stopping||!ws.room)return;
      enqueue(async()=>{const r=structuredClone(rooms.get(ws.room));if(!r)return;
        if([...sockets].some(other=>other.room===ws.room&&other.actor===ws.actor))return;
        const p=r.players.find(p=>p.id===ws.actor);if(!p)return;p.online=false;p.offlineSince=Date.now();elect(r);
        if(!r.players.some(v=>v.online))r.emptySince=Date.now();
        await commit(r,p.id,null,'room:offline');
      });
    });
  });
  async function tick(){
    const now=Date.now();
    for(const old of rooms.values()){
      if(old.emptySince&&now-old.emptySince>=1800000){await store.remove(old.code);rooms.delete(old.code);nextAI.delete(old.code);continue;}
      if(!old.game){const stale=old.players.filter(p=>!p.online&&now-p.offlineSince>=120000);if(stale.length){const r=structuredClone(old);r.players=r.players.filter(p=>!stale.some(v=>v.id===p.id));elect(r);await commit(r,null,null,'room:release');}continue;}
      if(old.game.phase==='finished'||old.emptySince)continue;
      if(old.players.some(p=>!p.online&&!p.proxy&&now-p.offlineSince>=120000)){
        const r=structuredClone(old);
        for(const p of r.players)if(!p.online&&now-p.offlineSince>=120000)p.proxy=true;
        await commit(r,null,null,'room:proxy');continue;
      }
      const g=old.game,map=await loadMap(old.settings.mapId);
      let result=g,cmd;
      if(old.deadline&&now>=old.deadline){
        if(g.phase==='trade')result=expire(g,map,now);
        else if(['roll','jail','end','buy','build','commission'].includes(g.phase))cmd={playerId:g.current,type:{roll:'roll',jail:'roll',end:'end',buy:'decline',build:'skip',commission:'takeFee'}[g.phase]};
        else cmd=decide(publicState(g),map,g.debt?.from||g.current,old.settings.difficulty);
      }else if((nextAI.get(old.code)||0)<=now){
        for(const p of g.players){const seat=old.players.find(v=>v.id===p.id);
          if(!p.bankrupt&&(p.ai||seat?.proxy)){
            cmd=decide(publicState(g),map,p.id,old.settings.difficulty);if(cmd)break;
          }
        }
        nextAI.set(old.code,now+300+randomInt(501));
      }
      if(cmd)result=applyCommand(g,cmd,map,{now,random});
      if(result!==g){const r=structuredClone(old);r.game=result;r.deadline=null;await commit(r,cmd?.playerId||null,null,'game:auto',cmd||{phase:g.phase});}
    }
  }
  await new Promise((ok,no)=>{server.once('error',no);server.listen(port,process.env.HOST||'0.0.0.0',ok);});
  try {
    store=await openStore({
      onWaiting:process.env.RENDER==='true'?()=>{awaitingPredecessor=true}:undefined
    });
    awaitingPredecessor=false;
    for(const r of await store.load()){
      for(const p of r.players){if(p.online)p.offlineSince=Date.now();p.online=false;}
      r.emptySince??=Date.now();
      const oldLimit=r.settings.roundLimit;
      r.settings.roundLimit=migrateRoundLimit(oldLimit);
      const previousGame=r.game;
      if(previousGame){
        r.game=migrateGame(previousGame,previousGame.version===1?await loadMap(r.settings.mapId):null);
        if(r.game!==previousGame)r.game.revision++;
        if(previousGame.version===1){
          r.deadline=null;
          arm(r);
        }
      }
      if(oldLimit!==r.settings.roundLimit || r.game!==previousGame){
        r.revision++;
        await store.save(r,null,null,'game:migrate');
      }
      rooms.set(r.code,r);
    }
    ready=true;
  }catch(error){
    await new Promise(ok=>server.close(ok));
    await store?.close();
    throw error;
  }
  const timer=setInterval(()=>{if(stopping||scheduled)return;scheduled=true;enqueue(tick).finally(()=>{scheduled=false;}).catch(()=>{});},180);
  console.log('ATLAS_PORT='+server.address().port);
  return {server,async close(){stopping=true;clearInterval(timer);for(const ws of sockets)ws.close(4001,'restart');await chain;await new Promise(ok=>server.close(ok));await store.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const app=await serve();let closing=false;
  async function stop(code){if(closing)return;closing=true;const guard=setTimeout(()=>process.exit(1),8000);guard.unref();await app.close();process.exit(code);}
  process.on('SIGINT',()=>stop(0));process.on('SIGTERM',()=>stop(0));
  process.on('uncaughtException',e=>{console.error(e);stop(1);});process.on('unhandledRejection',e=>{console.error(e);stop(1);});
}

