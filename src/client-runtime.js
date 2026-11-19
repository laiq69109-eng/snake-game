const ownMotion=new MotionBuffer(STEP),remoteMotion=new MotionBuffer(STEP),visuals=new Map();
let prediction=null,pendingInputs=[],inputSequence=0,lastServerAt=0,clockReady=false,networkRtt=100;
let realtimeSocket=null,realtimeReady=false,realtimeRetry=null,realtimeHeartbeat=null,lastUIKey='';
let lastRealtimeReceived=0;
let lastStaticPaint=0;
let gridLayer=null,starSprite=null,lastFrameAt=0,lastUIAt=0,lastMetricAt=0,metricFrames=0,frameCount=0;
const stats={fps:0,renderMs:0,frames:0,transport:'local',rtt:0,head:null};
const clock=()=>typeof performance!=='undefined'?performance.now():Date.now();
function setText(id,value){const el=$(id);if(el.textContent!==value)el.textContent=value;}
function sampleClock(now,rtt){
  networkRtt=clockReady?networkRtt*.7+rtt*.3:rtt;
  const target=now+rtt/2-Date.now();offset=clockReady?offset+Math.max(-30,Math.min(30,target-offset))*.25:target;clockReady=true;
}
function seedSolo(){stopRealtime();pendingInputs=[];prediction=null;ownMotion.reset();ownMotion.push(room);visuals.clear();stats.transport='local';fitCanvas();}
function predictionBudget(){return Math.max(600,Math.min(2000,networkRtt*.9+STEP*2));}
function rebuildPrediction(){
  if(solo||!room||room.status!=='playing'){prediction=null;return;}
  prediction=JSON.parse(JSON.stringify(room));ownMotion.push(prediction,true);
  const now=Math.min(Date.now()+offset,room.now+predictionBudget()),record=()=>ownMotion.push(prediction);
  for(const input of pendingInputs){advance(prediction,Math.min(now,input.tick),record);const p=prediction.players.find(p=>p.id===session?.id);if(p)turn(p,input.dir);}
  advance(prediction,now,record);
}
function decodeFrame(msg){
  if(!room||room.code!==msg.code)return null;
  const players=[];
  for(const p of msg.p){const base=room.players.find(v=>v.slot===p[0]);if(!base)return null;players.push({...base,dir:p[1],next:p[2],turns:p[3],score:p[4],alive:!!p[5],respawn:msg.tick+p[6],shield:msg.tick+p[7],seen:msg.now-p[8],inputSeq:p[9],body:p[10].map(v=>({x:v%SIZE,y:Math.floor(v/SIZE)}))});}
  return {room:{...room,players,tick:msg.tick,now:msg.now}};
}
function flushInputs(){
  if(!realtimeReady||realtimeSocket?.readyState!==1)return;
  for(const input of pendingInputs)if(!input.sent){realtimeSocket.send(JSON.stringify({type:'input',dir:input.dir,seq:input.seq}));input.sent=true;}
}
function stopRealtime(){
  clearTimeout(realtimeRetry);clearInterval(realtimeHeartbeat);realtimeRetry=null;realtimeReady=false;
  const old=realtimeSocket;realtimeSocket=null;if(old){old.onclose=null;old.close();}
}
function ensureRealtime(){
  if(solo||!session?.token||typeof WebSocket==='undefined'||realtimeSocket||realtimeRetry)return;
  const g=generation,socket=new WebSocket(SERVICE_ORIGIN.replace(/^http/,'ws')+'/realtime');realtimeSocket=socket;
  const authTimeout=setTimeout(()=>{if(!realtimeReady&&realtimeSocket===socket)socket.close();},5000);
  socket.onopen=()=>{if(g!==generation)return socket.close();socket.send(JSON.stringify({type:'hello',...session}));};
  socket.onmessage=event=>{
    if(g!==generation||realtimeSocket!==socket)return;
    try{
      const msg=JSON.parse(event.data);lastRealtimeReceived=Date.now();
      if(msg.type==='pong'){sampleClock(msg.now,Math.max(0,Date.now()-msg.at));setText('connection','实时联机 · '+Math.round(networkRtt)+' ms');return;}
      if(msg.type==='state'||msg.type==='frame'){
        const first=!realtimeReady;realtimeReady=true;clearTimeout(authTimeout);clearTimeout(pollTimer);stats.transport='websocket';
        const data=msg.type==='frame'?decodeFrame(msg):msg;if(data)apply(data);flushInputs();
        if(first){socket.send(JSON.stringify({type:'ping',at:Date.now()}));realtimeHeartbeat=setInterval(()=>{if(Date.now()-lastRealtimeReceived>6500){socket.close();return;}if(socket.readyState===1)socket.send(JSON.stringify({type:'ping',at:Date.now()}));},2000);}
      }
    }catch{}
  };
  socket.onerror=()=>{};
  socket.onclose=()=>{
    clearTimeout(authTimeout);if(g!==generation||realtimeSocket!==socket)return;
    realtimeSocket=null;realtimeReady=false;clearInterval(realtimeHeartbeat);stats.transport='http';pendingInputs.forEach(input=>input.sent=false);
    if(session&&!solo&&!leaving){setText('connection','正在重连 · 保持对局');schedule();realtimeRetry=setTimeout(()=>{realtimeRetry=null;ensureRealtime();},2000);}
  };
}
function fitCanvas(){
  const rect=canvas.getBoundingClientRect?.();if(!rect?.width)return;
  const size=Math.round(Math.max(300,Math.min(900,rect.width*Math.min(window.devicePixelRatio||1,2))));
  if(canvas.width!==size){canvas.width=size;canvas.height=size;gridLayer=null;starSprite=null;}
}
window.addEventListener('resize',fitCanvas);
function makeLayer(w,h){if(typeof document.createElement!=='function')return null;const layer=document.createElement('canvas');layer.width=w;layer.height=h;return layer;}
function star(g,x,y,r,color){g.fillStyle=color;g.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4-Math.PI/2,k=i%2?r*.38:r;g.lineTo(x+Math.cos(a)*k,y+Math.sin(a)*k);}g.closePath();g.fill();}
function backdrop(w,c){
  if(!gridLayer){gridLayer=makeLayer(w,w);if(gridLayer){const g=gridLayer.getContext('2d');g.fillStyle='#151a11';g.fillRect(0,0,w,w);g.strokeStyle='#252d1d';g.lineWidth=1;g.beginPath();for(let i=1;i<SIZE;i++){g.moveTo(i*c,0);g.lineTo(i*c,w);g.moveTo(0,i*c);g.lineTo(w,i*c);}g.stroke();}}
  if(gridLayer)ctx.drawImage(gridLayer,0,0);else{ctx.fillStyle='#151a11';ctx.fillRect(0,0,w,w);}
  if(!starSprite){starSprite=makeLayer(64,64);if(starSprite){const g=starSprite.getContext('2d');g.shadowColor='#b9f35a';g.shadowBlur=10;star(g,32,32,12,'#d3ef99');}}
}
const previewFood=[{x:5,y:4},{x:22,y:7},{x:9,y:22},{x:24,y:24},{x:17,y:17},{x:3,y:15},{x:15,y:3},{x:26,y:15}];
const previewSnakes=[{id:'preview',dir:1,color:'#b9f35a',body:[{x:15,y:10},{x:14,y:10},{x:13,y:10},{x:12,y:10},{x:11,y:10},{x:11,y:11},{x:11,y:12},{x:11,y:13},{x:10,y:13},{x:9,y:13}]},{id:'preview2',dir:3,color:'#b69aff',body:[{x:17,y:22},{x:18,y:22},{x:19,y:22},{x:20,y:22},{x:20,y:21},{x:20,y:20},{x:20,y:19}]}];
function visualPose(p,now,dt){
  const mine=p.id===session?.id;
  const delay=solo||mine?STEP:STEP+Math.min(1000,networkRtt/2+50);
  const buffer=solo||mine?ownMotion:remoteMotion;
  const pose=buffer.sample(p.id,now-delay)||p;
  const old=visuals.get(p.id);
  if(!old||old.respawn!==pose.respawn||!pose.body.length||!old.body.length){visuals.set(p.id,pose);return pose;}
  const distance=Math.hypot(pose.body[0].x-old.body[0].x,pose.body[0].y-old.body[0].y);
  // Tiny corrections are spread across display frames; respawns never slide across the board.
  const blend=distance>10?1:1-Math.exp(-dt/(solo?12:Math.min(100,35+networkRtt*.03)));
  const result={...pose,body:pose.body.map((v,i)=>{const from=old.body[i]||v;return {x:from.x+(v.x-from.x)*blend,y:from.y+(v.y-from.y)*blend};})};
  visuals.set(p.id,result);return result;
}
function draw(dt){
  const w=canvas.width,c=w/SIZE,now=(pausedAt??Date.now())+offset;backdrop(w,c);
  for(const f of room?.food||previewFood){if(starSprite)ctx.drawImage(starSprite,(f.x+.5)*c-c*.8,(f.y+.5)*c-c*.8,c*1.6,c*1.6);else star(ctx,(f.x+.5)*c,(f.y+.5)*c,c*.29,'#d3ef99');}
  const ps=room?.players||previewSnakes;
  for(const original of ps){
    const p=room?visualPose(original,now,dt):original;ctx.globalAlpha=p.shield>now?.65:1;
    for(let i=p.body.length-1;i>=0;i--){const b=p.body[i],x=b.x*c+1.5,y=b.y*c+1.5;ctx.fillStyle=p.color;ctx.beginPath();ctx.roundRect(x,y,c-3,c-3,i===0?c*.28:c*.16);ctx.fill();
      if(i===0){const dx=[0,1,0,-1][p.dir],dy=[-1,0,1,0][p.dir];ctx.fillStyle='#17200f';for(const side of [-1,1]){ctx.beginPath();ctx.arc((b.x+.5)*c+dx*c*.2+(dy?side*c*.2:0),(b.y+.5)*c+dy*c*.2+(dx?side*c*.2:0),c*.1,0,Math.PI*2);ctx.fill();}}
    }ctx.globalAlpha=1;
    if(p.id===session?.id)stats.head=p.body[0]?{...p.body[0]}:null;
  }
  let html='<div class="pill">✦ 好友就位，快乐加倍</div>';
  if(room){if(room.status==='waiting')html='<div class="pill">等待好友加入 · '+room.players.length+'/4</div>';else if(pausedAt!==null)html='<h2>已暂停</h2><div class="pill">点击继续游戏，接着挑战</div>';else if(now<room.started)html='<h2>'+Math.ceil((room.started-now)/1000)+'</h2><div class="pill">准备好，开吃！</div>';else if(room.status==='finished')html=solo?'<h2>挑战完成</h2><div class="pill">本局 '+room.players[0].score+' 分 · 最高 '+bestScore+' 分</div>':'<h2>好 蛇 ！</h2><div class="pill">本局结束 · 看看谁最会吃</div>';else{const me=ps.find(p=>p.id===session?.id);html=me&&!me.alive?'<h2>碰头啦</h2><div class="pill">'+Math.max(1,Math.ceil((me.respawn-now)/1000))+' 秒后复活</div>':'';}}
  if($('overlay').innerHTML!==html)$('overlay').innerHTML=html;
  setText('timer',room?.status==='playing'?format(Math.ceil((room.ends-Math.max(now,room.started))/1000)):room?.status==='finished'?'00:00':'01:30');
  setText('arena-title',room?(solo?'单机游戏 · 个人挑战':'房间 '+room.code):'练习场预览');
}
function format(n){n=Math.max(0,n);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function frame(t){
  if((!room||pausedAt!==null||room.status!=='playing')&&t-lastStaticPaint<100){requestAnimationFrame(frame);return;}lastStaticPaint=t;
  const began=clock(),dt=Math.max(1,Math.min(50,lastFrameAt?t-lastFrameAt:16.67));lastFrameAt=t;
  if(solo&&pausedAt===null&&room?.status==='playing'){
    for(const p of room.players)p.seen=Date.now();advance(room,Date.now(),()=>ownMotion.push(room));
  }else if(!solo&&prediction&&room?.status==='playing')advance(prediction,Math.min(Date.now()+offset,room.now+predictionBudget()),()=>ownMotion.push(prediction));
  if(t-lastUIAt>200||room?.status==='finished'){updateUI();lastUIAt=t;}
  draw(pausedAt===null?dt:0);frameCount++;metricFrames++;
  stats.renderMs=stats.renderMs*.9+(clock()-began)*.1;stats.frames=frameCount;stats.rtt=Math.round(networkRtt);stats.serverAge=solo?0:Math.round(Date.now()+offset-(room?.now||Date.now()));
  if(t-lastMetricAt>=1000){stats.fps=Math.round(metricFrames*1000/(t-lastMetricAt));metricFrames=0;lastMetricAt=t;}
  requestAnimationFrame(frame);
}
window.__snakeStats=()=>({...stats});
requestAnimationFrame(()=>{fitCanvas();});requestAnimationFrame(frame);

