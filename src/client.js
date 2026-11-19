import {SIZE,STEP,createSolo,resumeSolo,start,advance,turn} from '/engine.js';
import {MotionBuffer} from '/motion.js';
const SERVICE_ORIGIN=globalThis.SNAKE_API_ORIGIN||location.origin;
const $=id=>document.getElementById(id), canvas=$('board'),ctx=canvas.getContext('2d');let room=null,session=null,solo=false,offset=0,busy=false,polling=false,nextDir=null,pollTimer,toastTimer,lastStatus='',leaving=false,pausedAt=null,bestScore=0,mode='solo',generation=0;
if(!ctx.roundRect)ctx.roundRect=function(x,y,w,h){this.rect(x,y,w,h);};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(t){$('toast').textContent=t;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3500);}
try{$('name').value=localStorage.getItem('snake-name')||'';}catch{}
try{bestScore=Math.max(0,Number(localStorage.getItem('snake-best'))||0);}catch{}$('best-score').textContent=bestScore+' 分';
function selectMode(value){mode=value;const single=value==='solo';$('solo-tab').setAttribute('aria-selected',String(single));$('multi-tab').setAttribute('aria-selected',String(!single));$('solo-panel').classList.toggle('hidden',!single);$('multi-panel').classList.toggle('hidden',single);$('home-title').textContent=single?'一个人，也能吃个痛快。':'快乐，差你一个。';$('home-caption').textContent=single?'独自挑战 90 秒，刷新你自己的最高分。':'创建房间，2 人起随时开局，不必等满员。';}
$('solo-tab').onclick=()=>selectMode('solo');$('multi-tab').onclick=()=>selectMode('multi');
const invited=new URLSearchParams(location.search).get('room');if(/^\d{6}$/.test(invited||'')){selectMode('multi');$('code').value=invited;$('join').textContent='加入 →';}
function name(){const n=$('name').value.trim()||'小蛇'+Math.floor(Math.random()*1000);try{localStorage.setItem('snake-name',n);}catch{}return n;}
async function api(action,body={}){const sent=Date.now(),controller=new AbortController(),t=setTimeout(()=>controller.abort(),8000);try{const res=await fetch(SERVICE_ORIGIN+'/api/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...session,...body}),signal:controller.signal});const data=await res.json();if(!res.ok)throw Object.assign(new Error(data.error||'连接失败'),{status:res.status});data._rtt=Date.now()-sent;return data;}finally{clearTimeout(t);}}
function apply(data){
  if(leaving||!data.room)return;
  if(room?.code===data.room.code&&data.room.now<lastServerAt)return;
  const changedRound=room?.started!==data.room.started;
  room=data.room;lastServerAt=room.now;
  if(data._rtt!==undefined)sampleClock(room.now,data._rtt);else if(!clockReady)offset=room.now-Date.now();
  if(data.token&&session?.token!==data.token){session={code:room.code,id:data.id,token:data.token};try{sessionStorage.setItem('snake-session',JSON.stringify(session));}catch{}}
  const me=room.players.find(p=>p.id===session?.id);
  if(changedRound){pendingInputs=[];ownMotion.reset();remoteMotion.reset();visuals.clear();}
  inputSequence=Math.max(inputSequence,me?.inputSeq||0);
  pendingInputs=pendingInputs.filter(input=>input.seq>(me?.inputSeq||0));
  if(!realtimeReady)stats.transport='http';remoteMotion.push(room);rebuildPrediction();updateUI();ensureRealtime();
}
async function task(fn){if(busy)return;busy=true;for(const id of ['create','join','start','again'])$(id).disabled=true;try{await fn();}catch(e){toast(e.name==='AbortError'?'连接超时，请检查网络后再试':e.message);}finally{busy=false;for(const id of ['create','join','start','again'])$(id).disabled=false;updateUI();}}
$('create').onclick=()=>task(async()=>{leaving=false;solo=false;apply(await api('create',{name:name()}));schedule();});
$('join').onclick=()=>task(async()=>{const code=$('code').value.trim();if(!/^\d{6}$/.test(code))return toast('请输入 6 位数字房间码');leaving=false;solo=false;apply(await api('join',{code,name:name()}));schedule();});
$('code').onkeydown=e=>{if(e.key==='Enter')$('join').click();};
function schedule(){clearTimeout(pollTimer);if(!realtimeReady)pollTimer=setTimeout(sync,room?.status==='playing'?75:850);}
async function sync(){if(!session||solo||polling||leaving||realtimeReady)return;polling=true;const g=generation,input=pendingInputs[0],dir=input?.dir??nextDir;nextDir=null;try{const result=await api('sync',{dir,seq:input?.seq});if(g!==generation)return;apply(result);setText('connection','联机在线 · '+Math.round(networkRtt)+' ms');}catch(e){if(g!==generation)return;$('connection').textContent='连接中断 · 正在重连';if(e.status===401||e.status===404){toast(e.message);reset();}}finally{polling=false;if(session&&!solo&&!leaving)schedule();}}
async function begin(){if(solo){room=createSolo(room.players[0].name,Date.now());seedSolo();pausedAt=null;lastStatus='';updateUI();}else await task(async()=>apply(await api('start')));}
$('start').onclick=begin;$('again').onclick=begin;
function reset(){generation++;stopRealtime();pendingInputs=[];prediction=null;remoteMotion.reset();ownMotion.reset();visuals.clear();lastServerAt=0;clockReady=false;lastUIKey='';pausedAt=null;clearTimeout(pollTimer);session=null;room=null;solo=false;offset=0;lastStatus='';nextDir=null;try{sessionStorage.removeItem('snake-session');}catch{}$('connection').textContent='即点即玩 · 无需下载';updateUI();}
async function leave(){if(!solo&&room?.status==='playing'&&!confirm('离开后将退出本局，确定离开吗？'))return;leaving=true;const old=session;reset();if(old?.token)try{await api('leave',old);}catch{}leaving=false;}
for(const id of ['leave','exit'])$(id).onclick=leave;
async function invite(){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('room',room.code);const text=url.href;try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{const a=document.createElement('textarea');a.value=text;document.body.append(a);a.select();const ok=document.execCommand('copy');a.remove();if(!ok)throw Error();}toast('邀请链接已复制，发给好友就好啦');}catch{prompt('长按复制链接，发送给微信好友',text);}}
for(const id of ['invite','match-invite'])$(id).onclick=invite;
$('solo').onclick=()=>{if(busy)return;generation++;clearTimeout(pollTimer);document.activeElement?.blur();solo=true;leaving=false;pausedAt=null;session={id:'me'};room=createSolo(name(),Date.now());seedSolo();try{sessionStorage.removeItem('snake-session');}catch{}offset=0;lastStatus='';$('connection').textContent='单机游戏 · 本地运行';updateUI();};
function pauseSolo(){if(!solo||room?.status!=='playing')return;if(pausedAt===null){pausedAt=Date.now();}else{resumeSolo(room,pausedAt,Date.now());pausedAt=null;ownMotion.reset();ownMotion.push(room);visuals.clear();}updateUI();}
$('pause').onclick=pauseSolo;
function direction(d){
  if(!room||pausedAt!==null||room.status!=='playing'||Date.now()+offset<room.started)return;
  const p=(solo?room:prediction||room).players.find(p=>p.id===session?.id);
  if(!p||!p.alive)return;
  if(solo){turn(p,d);return;}
  if(pendingInputs.length>=8||!turn(p,d))return;
  const input={seq:++inputSequence,dir:d,tick:prediction?.tick||room.tick,sent:false};pendingInputs.push(input);
  if(realtimeReady)flushInputs();else if(!polling){clearTimeout(pollTimer);sync();}
}
window.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA/.test(document.activeElement.tagName))return;const d={ArrowUp:0,w:0,W:0,ArrowRight:1,d:1,D:1,ArrowDown:2,s:2,S:2,ArrowLeft:3,a:3,A:3}[e.key];if(d!==undefined&&room){e.preventDefault();direction(d);}});
document.querySelectorAll('[data-dir]').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();direction(Number(b.dataset.dir));}));let touch=null;canvas.addEventListener('touchstart',e=>{touch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});canvas.addEventListener('touchmove',e=>{if(!touch)return;e.preventDefault();const x=e.touches[0].clientX,y=e.touches[0].clientY,dx=x-touch.x,dy=y-touch.y;if(Math.max(Math.abs(dx),Math.abs(dy))>15){direction(Math.abs(dx)>Math.abs(dy)?dx>0?1:3:dy>0?2:0);touch={x,y};}},{passive:false});canvas.addEventListener('touchend',()=>touch=null);
function updateUI(){const key=JSON.stringify([solo,pausedAt,busy,session?.id,room?.status,room?.started,room?.host,room?.players.map(p=>[p.id,p.name,p.score,p.alive,p.color])]);if(key===lastUIKey)return;lastUIKey=key;const state=room?.status||'home',me=room?.players.find(p=>p.id===session?.id),host=room?.host===session?.id;document.body.classList.toggle('in-game',state==='playing'||state==='finished');$('home').classList.toggle('hidden',!!room);$('lobby').classList.toggle('hidden',state!=='waiting');$('match').classList.toggle('hidden',!['playing','finished'].includes(state));$('match-invite').classList.toggle('hidden',solo);$('pause').classList.toggle('hidden',!solo||state!=='playing');$('pause').textContent=pausedAt===null?'暂停游戏':'继续游戏';if(state==='waiting'){$('room-code').textContent=room.code;$('members').innerHTML=room.players.map(p=>'<div class="member"><span><i class="avatar" style="background:'+p.color+'"></i>'+esc(p.name)+(p.id===session?.id?' <span class="small">你</span>':'')+'</span><span class="small">'+(p.id===room.host?'房主':'已加入')+'</span></div>').join('');$('start').disabled=busy||!host||room.players.length<2;$('start').textContent=host?(room.players.length>=2?'按当前 '+room.players.length+' 人开局 →':'等待好友加入'):'等待房主开始…';$('lobby-status').textContent='当前 '+room.players.length+' 人 / 最多 4 人'+(room.players.length<2?' · 还差一位好友':' · 可以立即开局，无需满员');}if(state==='playing'||state==='finished'){const sorted=[...room.players].sort((a,b)=>b.score-a.score);$('scores').innerHTML=sorted.map((p,i)=>'<div class="score"><span><i class="avatar" style="background:'+p.color+'"></i>'+esc(p.name)+(p.id===session?.id?' · 你':'')+'</span><b>'+p.score+' <span class="small">分</span></b></div>').join('');$('again').classList.toggle('hidden',state!=='finished'||!host);$('again').disabled=busy;if(solo&&me&&me.score>bestScore){bestScore=me.score;$('best-score').textContent=bestScore+' 分';try{localStorage.setItem('snake-best',String(bestScore));}catch{}}const winners=sorted.filter(p=>p.score===sorted[0].score);$('match-label').textContent=state==='finished'?'GOOD GAME, GOOD FRIENDS':solo?'SOLO · YOUR OWN HIGH SCORE':'LET’S GET GROWING';$('match-title').textContent=solo?(state==='finished'?'单机挑战完成 · '+(me?.score||0)+' 分':'单机挑战，冲击自己的最高分。'):state==='finished'?(winners.length>1?'旗鼓相当，下局再战！':winners[0].name+'，这局你最会吃！'):'星星归你，快乐归大家。';$('match-status').textContent=solo?(pausedAt!==null?'已暂停，点击「继续游戏」接着玩。':state==='finished'?'本机最高分 '+bestScore+' 分 · 再挑战一次！':me&&!me.alive?'碰头啦！马上复活，继续加油。':'只有你一条蛇 · 本机最高分 '+bestScore+' 分'):state==='finished'?(host?'再来一局，把快乐续上。':'等待房主再来一局。'):me&&!me.alive?'碰头啦！马上复活，继续加油。':'你的颜色 '+(me?.slot===0?'青柠绿':me?.slot===1?'香芋紫':me?.slot===2?'蜜桃橙':'天空蓝')+' · 复活后短暂无敌';}if(lastStatus!==state){lastStatus=state;if(state==='playing')requestAnimationFrame(()=>$('board').scrollIntoView({block:'start',behavior:'smooth'}));}}
/* RUNTIME */
document.addEventListener('visibilitychange',()=>{if(document.hidden&&solo&&pausedAt===null&&room?.status==='playing')pauseSolo();if(!document.hidden&&session&&!solo&&!polling)sync();});
// Restore online session
try{const saved=JSON.parse(sessionStorage.getItem('snake-session')),g=generation;if(saved?.token){session=saved;api('sync').then(d=>{if(g!==generation)return;apply(d);schedule();}).catch(()=>{if(g===generation)reset();});}}catch{}
