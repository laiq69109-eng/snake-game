import {roomLink,homeLink,invitedRoom} from './room-location.mjs';
import {createGame,applyCommand,publicState,expire,migrateGame,assets,rent,buildable} from '/packages/game-core/index.mjs';
import {decide} from '/packages/ai/index.mjs';
import {validateMap} from '/packages/maps/validate.mjs';
import {checkSave} from './save-check.mjs';
import {save,read,pref,setPref} from './storage.mjs';
import {unlock,sound,configure,tracks} from './audio.mjs';
import {configureShare,copy} from './share.mjs';
import {RoomClient} from './net.mjs';

const app=document.querySelector('#app'),overlay=document.querySelector('#overlay'),viewport=document.querySelector('.game-viewport');
const palette=['#b64d34','#2c6e69','#855484','#866021'];
const avatars=['✦','☾','♜','✿','☀','♞','♧','⚓'];
const kinds={land:'街区地产',rail:'交通地产',utility:'公用事业',chance:'机会',fate:'命运',start:'起点',jail:'监狱探访',goJail:'前往监狱',park:'免费停车场',tax:'税收'};
const patterns={circle:'●',stripe:'╱',triangle:'▲',wave:'≈',diamond:'◆',cross:'+',leaf:'❧',grid:'#'};
const icons={land:'⌂',rail:'⇄',utility:'ϟ',chance:'✦',fate:'☾',start:'⚑',jail:'▥',goJail:'⇥',park:'♧',tax:'§'};
const levels=['空地','一栋房','两栋房','旅馆'],buildText=['盖一栋房','盖第二栋房','升级旅馆'];
const titles={commission:'街区委托',roll:'掷骰启程',jail:'选择出狱方式',buy:'购入这处地产？',build:'开发你的地产',debt:'筹集偿债资金',trade:'协商交易',end:'落点结算完成',finished:'本次旅程结束'};
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v||0).toLocaleString('zh-CN');
const btn=(act,label,cl='',disabled=false)=>'<button data-do="'+safe(act)+'" class="'+cl+'" '+(disabled?'disabled':'')+'>'+safe(label)+'</button>';
const cmd=(type,label,disabled=false)=>btn('cmd:'+type,label,'primary',disabled);
const svg=(paths)=>'<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6">'+paths+'</svg>';
const newRoomIcon=svg('<path d="M3 15L16 5l13 10M7 14v13h18V14M13 27v-9h6v9"/>');
const joinIcon=svg('<path d="M16 5h11v22H16M3 16h17m-7-7 7 7-7 7"/>');
let catalog=[],map=null,s=null,room=null,net=null,source='solo',screen='home',profile=pref('profile',{name:'旅行家',avatar:0}),selection='cn',setup='solo',prefs=pref('prefs',{music:true,sfx:true,fast:false}),config=pref('config',{mode:'quick',limit:30,difficulty:'normal',count:2,classicBuildingRules:false,aiFill:false}),saved=null;
let pauseStarted=0;
let actionTimer,busy=false,paused=false,netStatus='',toastTimer,scene=0,modal=null,lastStamp=0,animation=null,storeChain=Promise.resolve();
const maps=new Map();
const me=()=>source==='online'?net?.playerId:'human';
const player=id=>s?.players.find(p=>p.id===id);
const pName=id=>player(id)?.name||'银行';
const pColor=id=>palette[Math.max(0,s?.players.findIndex(p=>p.id===id)??0)%4];
const acting=()=>s.phase==='debt'?s.debt.from:s.current;
const own=(idx)=>s.properties[idx]||{ownerId:null,level:0,mortgaged:false};
const portraitNames=['街区摄影师','节拍收藏家','单车旅人','建筑新秀','轮滑少年','唱片店主','绘本画手','街头设计师'];
function portrait(p){
  const i=Number.isInteger(+p.avatar)?Math.abs(+p.avatar)%8:0;
  return '<span class="portrait" aria-label="'+portraitNames[i]+'" style="background-position:'+((i%4)*100/3)+'% '+(i>=4?100:0)+'%"></span>';
}
function audioSettings(){
  configure(prefs.music,prefs.sfx,map?.music,prefs.track||'cafe',prefs.volume??.45);
}
const tileName=i=>map.tiles[i]?.name||'未知地块';
const money=v=>'₳ '+n(v);
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500)}
function modalBox(title,body){const had=!!overlay.firstChild;overlay.innerHTML='<div class="veil"><section role="dialog" aria-modal="true" aria-label="'+safe(title)+'" class="sheet"><div class="sheet-head"><h2>'+safe(title)+'</h2>'+btn('close','×','close')+'</div>'+body+'</section></div>';if(!had)overlay.querySelector('button')?.focus()}
function close(){modal=null;overlay.replaceChildren()}
function detail(title,body){modal=()=>modalBox(title,body());modal()}
function home(){viewport.scrollTop=0;app.dataset.screen='home';screen='home';notice.hidden=true;close();clearTimeout(actionTimer);const first=catalog.find(m=>m.id===selection)||catalog[0];app.innerHTML='<section class="poster"><img class="poster-art" src="'+safe(first.art)+'" alt="'+safe(first.name)+'主题插画"><div><div class="folio">ATLAS ESTATES</div><h1>环球置业之旅</h1><p>掷骰前进，沿途置业。下一站，由你经营。</p><div class="actions">'+btn('solo','开始单机旅行')+(saved?btn('continue','继续上次棋局','quiet'):'')+'</div></div></section><div class="section-head"><h2>与好友同行</h2></div><div class="home-grid"><button class="entry" data-do="create">'+newRoomIcon+'<span>创建房间<small>邀请好友加入棋局</small></span></button><button class="entry" data-do="join">'+joinIcon+'<span>加入房间<small>输入六位房间码</small></span></button></div><div class="section-head"><h2>旅行目的地</h2>'+btn('solo','全部地图','quiet')+'</div><div class="preview-strip">'+catalog.slice(0,4).map(mapCard).join('')+'</div>'}
function mapCard(m){return '<button class="map-card '+(screen==='maps'&&selection===m.id?'active':'')+'" data-do="map:'+m.id+'"><img loading="lazy" src="'+safe(m.art)+'" alt=""><span class="map-desc"><strong>'+safe(m.name)+'</strong><small>'+safe(m.theme||m.difficulty)+'</small></span></button>'}
function mapsPage(kind){viewport.scrollTop=0;app.dataset.screen='maps';screen='maps';setup=kind;close();app.innerHTML='<div class="topline"><div><div class="folio">DESTINATIONS</div><h1>选择旅行地图</h1></div>'+btn('home','返回')+'</div><div class="maps-grid">'+catalog.map(mapCard).join('')+'</div>'}
const opt=(value,label,current)=>'<option value="'+value+'" '+(String(value)===String(current)?'selected':'')+'>'+safe(label)+'</option>';
function gameForm(){
 return '<div class="field-pair"><label>模式<select id="mode">'+opt('quick','快速模式',config.mode)+opt('classic','经典模式',config.mode)+'</select></label><label>快速回合数<select id="limit">'+[20,30,40].map(v=>opt(v,v+' 轮',config.limit)).join('')+'</select></label></div><div class="field-pair"><label>AI 难度<select id="difficulty">'+[['easy','简单'],['normal','普通'],['hard','困难']].map(([v,t])=>opt(v,t,config.difficulty)).join('')+'</select></label>'+(setup==='solo'?'<label>AI 对手<select id="count">'+[1,2,3].map(v=>opt(v,v+' 位',config.count)).join('')+'</select></label>':'<label class="check"><input type="checkbox" id="aiFill" '+(config.aiFill?'checked':'')+'>自动用人机补满空位</label>')+'</div><label class="check"><input type="checkbox" id="classic" '+(config.classicBuildingRules?'checked':'')+'>集齐同组并均衡建设</label>'
}
function profileForm(){return '<div class="field-pair"><label>旅行昵称<input id="nickname" maxlength="16" value="'+safe(profile.name)+'" autocomplete="nickname"></label><label>棋子图案<select id="avatar">'+avatars.map((v,i)=>opt(i,v+' '+portraitNames[i],profile.avatar)).join('')+'</select></label></div>'}
function setupView(){const m=catalog.find(m=>m.id===selection);modalBox(m.name,'<div class="form"><img class="map-preview" src="'+safe(m.art)+'" alt=""><p>'+safe(m.description)+'</p><span class="muted">'+safe([m.difficulty,m.duration,m.players].join(' · '))+'<br>'+safe(m.landmarks.join(' / '))+'</span>'+profileForm()+gameForm()+btn('startSetup',setup==='solo'?'开始旅行':'创建房间','go')+'<small class="room-progress" role="status"></small></div>')}
const value=id=>document.getElementById(id)?.value;
function capture(){if(document.getElementById('nickname')){profile={name:(value('nickname')||'旅行家').trim()||'旅行家',avatar:+value('avatar')};setPref('profile',profile)}if(document.getElementById('mode')){config={mode:value('mode'),limit:+value('limit'),difficulty:value('difficulty'),count:+value('count')||config.count,classicBuildingRules:document.querySelector('#classic').checked,aiFill:!!document.querySelector('#aiFill')?.checked};setPref('config',config)}}
async function getMap(id){if(!catalog.some(m=>m.id===id))throw Error('地图版本不兼容');if(!maps.has(id)){const r=await fetch('/packages/maps/'+id+'.json');if(!r.ok)throw Error('地图读取失败，请重新打开');const packed=r.clone(),m=await r.json();validateMap(m);maps.set(id,m);if(window.isSecureContext&&'caches'in window){caches.open('atlas-offline-v3').then(async c=>{await c.put('/packages/maps/'+id+'.json',packed);await Promise.all([m.art,m.icon].map(async url=>{if(!await c.match(url))await c.add(url)}))}).catch(()=>{})}}return maps.get(id)}
function storeGame(){const game=s,options={...config};saved={game,settings:options,version:2};storeChain=storeChain.then(()=>save(game,options)).catch(()=>toast('浏览器未能保存进度，请检查存储空间'))}
async function startSolo(){clearTimeout(actionTimer);source='solo';map=await getMap(selection);const names=['棠舟','杉野','望舒'];const players=[{id:'human',name:profile.name,avatar:profile.avatar,ai:false},...names.slice(0,config.count).map((name,i)=>({id:'ai'+i,name,avatar:(profile.avatar+i+1)%8,ai:true}))];s=createGame(map,players,config);pauseStarted=0;aiError=null;paused=false;close();screen='game';audioSettings();storeGame();paint();schedule()}
async function restore(previous=false){
  const r=await read(previous);
  if(!r?.game || ![1,2].includes(r.version))throw Error('无法继续此版本的棋局');
  map=await getMap(r.game.mapId);
  const migrated=migrateGame(r.game,map);
  checkSave({...r,game:migrated},map);
  if(!titles[migrated.phase])throw Error('存档阶段无效');
  source='solo';
  s=migrated;
  if(s.trade&&r.time)s.trade.deadline=Date.now()+Math.max(0,s.trade.deadline-r.time);
  pauseStarted=0;aiError=null;config={...config,...r.settings};selection=map.id;paused=false;
  close();screen='game';audioSettings();paint();
  if(migrated!==r.game){storeGame();toast('旧棋局已更新为单骰规则')}
  schedule();
}

function joinView(code=''){modalBox('加入好友房间','<div class="form">'+profileForm()+'<label>六位房间码<input id="joinCode" maxlength="6" autocapitalize="characters" value="'+safe(code)+'"></label>'+btn('submitJoin','加入房间','primary')+'<small class="room-progress" role="status"></small></div>')}
function getNet(){if(!net)net=new RoomClient({onStatus:status=>{netStatus=status;document.querySelectorAll('.network,.room-progress').forEach(el=>el.textContent=status)},onSnapshot:async next=>{try{await snapshot(next)}catch(e){toast(e.message)}}});return net}
async function snapshot(next){if(!next)return;if(room&&room.code===next.code&&next.revision<room.revision)return;const ticket=++scene;room=next;source='online';if(!next.game){s=null;screen='lobby';notice.hidden=true;lobby();return}const loaded=await getMap(next.game.mapId);if(ticket!==scene)return;map=loaded;screen='game';audioSettings();transition(next.game)}
async function opened(next){close();history.replaceState(null,'',roomLink(next.code));configureShare(location.href,'加入「'+next.code+'」的环球置业之旅');await snapshot(next)}
let lobbyLayout;
function lobby(){
  if(app.dataset.screen!=='lobby')viewport.scrollTop=0;
  app.dataset.screen='lobby';
  const settings=room.settings, mapInfo=catalog.find(m=>m.id===settings.mapId)||catalog[0];
  const host=net.playerId===room.hostId, mine=room.players.find(p=>p.id===net.playerId);
  const bots=room.bots||[], count=room.players.length+bots.length;
  const difficulty={easy:'简单',normal:'普通',hard:'困难'}[settings.difficulty];
  const humansReady=room.players.every(p=>p.online&&p.ready);
  // Preserve touch targets while another player's ready or connection status changes.
  const layout=JSON.stringify([room.code,room.hostId,net.playerId,settings,room.players.map(p=>p.id),bots.map(p=>p.id)]);
  const readyButton=app.querySelector('[data-do="ready"]');
  if(layout===lobbyLayout && readyButton){
    const rows=app.querySelectorAll('.lobby-roster .player:not(.bot-seat)');
    room.players.forEach((p,i)=>{
      rows[i].querySelector('small').textContent=(p.id===room.hostId?'房主':'玩家')+' · '+(p.online?'在线':'离线');
      rows[i].querySelector('b').textContent=p.ready?'已准备':'未准备';
    });
    readyButton.textContent=mine?.ready?'取消准备':'准备就绪';
    const launch=app.querySelector('[data-do="launch"]');
    if(launch)launch.disabled=count<2||!humansReady;
    return;
  }
  lobbyLayout=layout;
  const people=room.players.map((p,i)=>'<div class="player"><span class="avatar" style="--pin:'+palette[i]+'">'+portrait(p)+'</span><span>'+safe(p.name)+'<small>'+[p.id===room.hostId?'房主':'玩家',p.online?'在线':'离线'].join(' · ')+'</small></span><b>'+(p.ready?'已准备':'未准备')+'</b></div>');
  const opponents=bots.map((p,i)=>'<div class="player bot-seat"><span class="avatar" style="--pin:'+palette[room.players.length+i]+'">'+portrait(p)+'</span><span>'+safe(p.name)+'<small>人机 · '+safe(difficulty)+'</small></span>'+(host?btn('removeBot:'+p.id,'移除人机'):'<b>已就绪</b>')+'</div>');
  const seatInfo=room.players.length+' 位真人 · '+bots.length+' 位人机 · '+(4-count)+' 个空位';
  app.innerHTML='<div class="topline"><div><div class="folio">DEPARTURE LOUNGE</div><h1>出发大厅</h1></div>'+btn('leave','离开房间')+'</div>'+
    '<div class="arena"><div class="panel stack lobby-party"><div><h2>房间席位</h2><p>'+seatInfo+'</p></div><div class="lobby-roster">'+people.join('')+opponents.join('')+'</div>'+
    (host?'<div class="actions">'+btn('addBot','添加一位人机','',count>=4)+btn('roomSettings','房间设置')+'</div>':'')+
    (bots.length?'<small>开局前，好友可接替满员房中的人机。</small>':'')+
    '<div class="actions">'+btn('ready',mine?.ready?'取消准备':'准备就绪','primary')+(host?btn('launch','开始联机游戏','go',count<2||!humansReady):'')+'</div></div>'+
    '<aside class="panel stack lobby-invite"><img class="map-preview" src="'+safe(mapInfo.art)+'" alt=""><div><h3>'+safe(mapInfo.name)+'</h3><small>'+safe(settings.mode==='classic'?'经典对局':'快速 '+settings.roundLimit+' 轮')+'</small></div><div class="lobby-code"><span>邀请房间码</span><strong class="code">'+safe(room.code)+'</strong></div><span class="network">'+safe(netStatus)+'</span><p class="roomlink">'+safe(roomLink(room.code))+'</p><div class="actions">'+btn('copyCode','复制房间码')+btn('copyLink','复制链接')+btn('share','分享')+'</div></aside></div>';
}
function roomSettings(){config={...config,...room.settings,limit:room.settings.roundLimit};setup='create';modalBox('房间设置','<div class="form"><label>地图<select id="mapId">'+catalog.map(m=>opt(m.id,m.name,room.settings.mapId)).join('')+'</select></label>'+gameForm()+btn('saveRoomSettings','保存设置','primary')+'</div>')}
function settingsPayload(){return {mapId:selection,mode:config.mode,roundLimit:config.limit,classicBuildingRules:config.classicBuildingRules,aiFill:config.aiFill,difficulty:config.difficulty}}


function position(i){if(i<10)return [11,11-i];if(i<20)return [21-i,1];if(i<30)return [1,i-19];return [i-29,11]}
function building(level){
  const cottage='<path fill="#ffe3aa" d="M3 13l10-6 11 6v11l-11 5-10-5z"/><path fill="#f59957" d="M2 14l6-10 12 2 7 9-13 5-6-9z"/><path fill="#8b513f" d="M16 20l4-2v7l-4 2z"/>';
  const inn='<path fill="#fff1cd" d="M5 8l12-5 12 6v20l-13 4-11-5z"/><path fill="#785dce" d="M4 8l13-6 13 6-14 5z"/><path fill="none" stroke="#475790" stroke-width="3" stroke-dasharray="3 2" d="M8 14l7 3m-7 2l7 3m4-6l8-3m-8 8l8-3"/><path fill="#ed8051" d="M13 26l6-2v7l-6 1z"/>';
  const shape=level===3?inn:level===2?'<g transform="translate(15 0)">'+cottage+'</g><g transform="translate(0 7)">'+cottage+'</g>':cottage;
  return '<svg class="building-piece" role="img" aria-label="'+levels[level]+'" viewBox="0 0 '+(level===2?'44 37':'34 35')+'" stroke="#35434c" stroke-width="1.5" stroke-linejoin="round">'+shape+'</svg>';
}
function foregroundColor(color){
  const rgb=color.slice(1).match(/../g).map(hex=>parseInt(hex,16)/255);
  const linear=rgb.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  const luminance=.2126*linear[0]+.7152*linear[1]+.0722*linear[2];
  return luminance>.179?'#111':'#fff';
}
function tileCell(t){
  const i=t.index,[row,col]=position(i),a=own(i),group=map.groups?.[t.group];
  const color=a.ownerId?pColor(a.ownerId):null;
  const classes=['cell',i%10===0?'corner':'',player(s.current)?.pos===i?'landed':'',color?'owned':'',a.mortgaged?'mortgaged':''];
  const label=[t.name,kinds[t.type],a.ownerId?pName(a.ownerId):'',t.price?money(t.price):'',a.level?levels[a.level]:'',a.mortgaged?'已抵押':''].filter(Boolean).join('，');
  const colors=color?';--owner:'+color+';--owner-ink:'+foregroundColor(color):'';
  return '<button class="'+classes.join(' ')+'" id="tile-'+i+'" data-do="tile:'+i+'" aria-label="'+safe(label)+'" style="grid-area:'+row+'/'+col+';--band:'+safe(group?.color||'#c4b17f')+colors+'">'+
    '<span class="band pattern-'+safe(group?.pattern||'none')+'"></span><span class="tile-name">'+safe(t.name)+'</span>'+
    '<small class="mini">'+(group?patterns[group.pattern]+' ':'')+(t.price?money(t.price):icons[t.type])+'</small>'+
    (a.level?'<span class="level">'+building(a.level)+'</span>':'')+(a.mortgaged?'<span class="mortgage-tag">已抵押</span>':'')+'</button>';
}
function pieces(){
  const positions=new Map();
  for(const p of s.players.filter(p=>!p.bankrupt)){
    const i=animation?.playerId===p.id?animation.pos:p.pos;
    if(!positions.has(i))positions.set(i,[]);
    positions.get(i).push(p);
  }
  return [...positions].map(([i,group])=>{
    const [row,col]=position(i);
    const dx=col===1?'45%':col===11?'-45%':'0%';
    const dy=row===1?'62%':row===11?'-62%':'0%';
    return '<div class="piece-group '+(group.length>1?'shared':'')+'" style="grid-area:'+row+'/'+col+';--dx:'+dx+';--dy:'+dy+'">'+
      group.map(p=>'<span class="pawn '+(p.id===s.current?'acting':'')+'" role="img" aria-label="'+safe(p.name)+'" style="--pin:'+pColor(p.id)+'">'+portrait(p)+'</span>').join('')+'</div>';
  }).join('');
}
function board(){return '<div class="board-scroll"><div class="board"><div class="center-art"><img alt="'+safe(map.name)+'中心插画" src="'+safe(map.art)+'"><span class="board-tag">'+safe(map.name)+'</span></div>'+map.tiles.map(tileCell).join('')+'<div class="pieces">'+pieces()+'</div></div></div>'}
function playerCard(p){return '<div class="player '+(s.current===p.id?'active':'')+'"><span class="avatar" style="--pin:'+pColor(p.id)+'">'+portrait(p)+'</span><span>'+safe(p.name)+'<small>'+[p.id===me()?'你':p.ai?'AI':'玩家',p.bankrupt?'已破产':p.jailed?'入狱 · 已试 '+p.attempts+' 次':tileName(p.pos),p.cards.length?'出狱卡 ×'+p.cards.length:''].filter(Boolean).map(safe).join(' · ')+'</small></span><b data-cash="'+safe(p.id)+'">'+money(p.cash)+'</b></div>'}
function purchasePreview(tile,id){
  const prop=s.properties[tile.index];
  const state={...s,properties:{...s.properties,[tile.index]:{...prop,ownerId:id}}};
  if(tile.type==='utility')return '计租骰点 × '+rent(state,map,tile.index,1);
  return '取得后租金 '+money(rent(state,map,tile.index));
}
function decisionPreview(){
  const p=player(acting()),tile=map.tiles[p.pos];
  if(s.phase==='buy'){
    const balance=p.cash-tile.price;
    return '<p class="decision-note">'+safe(tile.name)+' · '+purchasePreview(tile,p.id)+'<br>'+
      (balance>=0?'买入后余款 '+money(balance):'还差 '+money(-balance))+'</p>';
  }
  if(s.phase==='build'){
    const level=own(p.pos).level,cost=level===2?tile.hotelCost:tile.houseCost;
    const next=[tile.oneHouseRent,tile.twoHouseRent,tile.hotelRent][level];
    return '<p class="decision-note">'+safe(tile.name)+' · 租金 '+money(rent(s,map,p.pos))+' → '+money(next)+
      (p.cash>=cost?' · 建成后余款 '+money(p.cash-cost):'')+'</p>';
  }
  if(s.phase==='debt')return '<p class="decision-note">当前现金 '+money(p.cash)+' · 还需筹集 '+money(Math.max(0,s.debt.amount-p.cash))+'</p>';
  if(s.phase==='commission'){
    const c=s.lastCard,a=own(c.target);
    const arrival=!a.ownerId?'可购买，标价 '+money(map.tiles[c.target].price):a.ownerId===p.id?
      (buildable(s,map,c.target,p.id)?'可选择建设':'自有地产，本次无法建设'):
      (a.mortgaged?'已抵押，免租':'需付租金 '+money(rent(s,map,c.target)));
    return '<p class="decision-note"><b>'+safe(c.name)+'</b><br>'+safe(c.text)+'<br>现场情况 · '+arrival+'</p>';
  }
  return '';
}
function turnActions(){const p=player(acting()),myTurn=p.id===me(),t=map.tiles[p.pos],a=own(p.pos);
 if(s.phase==='trade'){const tr=s.trade,side=[tr.from,tr.to].includes(me());return '<p>'+safe(pName(tr.from))+' ⇄ '+safe(pName(tr.to))+'</p><div class="actions">'+btn('inspectTrade','查看交易')+(side?cmd('confirm','确认',tr.confirmed.includes(me()))+cmd('cancel','取消'):'')+'</div>'}
 if(!myTurn)return '<p>等待 '+safe(p.name)+' 操作…</p>';
 let controls='';
 switch(s.phase){
 case 'commission':controls=cmd('takeFee','交稿 +'+money(s.lastCard.reward))+cmd('visitSite','去现场 −'+money(s.lastCard.fee),p.cash<s.lastCard.fee);break;
 case 'roll':controls=cmd('roll','掷骰子')+btn('trade','发起交易');break;
 case 'jail':controls=cmd('roll','掷出 6 点出狱')+cmd('bail','支付 ₳ 50',p.cash<50)+cmd('useCard','使用出狱卡',!p.cards.length);break;
 case 'buy':controls=cmd('buy','购买 '+money(t.price),p.cash<t.price)+btn('cmd:decline','不买');break;
 case 'build':{const cost=a.level===2?t.hotelCost:t.houseCost;controls=cmd('build',buildText[a.level]+' '+money(cost),p.cash<cost)+cmd('skip','放弃建设')+(p.cash<cost?'<small>还差 '+money(cost-p.cash)+'</small>':'');break}
 case 'debt':controls='<p>应付 '+safe(pName(s.debt.to))+' '+money(s.debt.amount)+' · '+safe(s.debt.reason)+'</p>'+btn('manage','筹集资金')+cmd('settle','清偿',p.cash<s.debt.amount)+btn('bankruptcy','宣布破产');break;
 case 'end':controls=cmd('end','结束回合');break;
 }
 return '<div class="actions">'+controls+'</div>'
}
function controls(){const p=player(acting()),deadline=s.phase==='trade'?s.trade?.deadline:room?.deadline;return '<section class="turn-box"><div class="row between"><div><div class="folio">ROUND '+s.round+(s.mode==='quick'?' / '+s.limit:'')+'</div><h2>'+safe(p.name)+' · '+safe(titles[s.phase])+'</h2></div><div class="dice">'+[s.dice[0]].map(d=>'<span class="die" aria-label="'+d+' 点">'+('⚀⚁⚂⚃⚄⚅'[d-1]||'·')+'</span>').join('')+'</div></div>'+decisionPreview()+turnActions()+(deadline?'<small data-deadline="'+deadline+'"></small>':'')+'</section>'}
function gameTools(){return btn('manage','地产管理')+btn('logs','行程日志')+btn('tileList','全图索引')+btn('zoomBoard','放大棋盘')+btn('rules','规则说明')}
function paint(){if(app.dataset.screen!=='game')viewport.scrollTop=0;app.dataset.screen='game';if(screen!=='game'||!s)return;if(s.phase==='finished'){results();updateCard();return}app.innerHTML='<div class="topline"><div><div class="folio">'+(source==='solo'?'SOLO VOYAGE':'ROOM '+safe(room.code))+'</div><h1>'+safe(map.name)+'</h1></div><div class="actions">'+(source==='online'?'<span class="network">'+safe(netStatus)+'</span>':'')+btn('menu','对局菜单')+'</div></div><div class="arena"><div>'+board()+'<div class="actions board-tools">'+gameTools()+'</div></div><aside class="control-strip">'+controls()+(aiError?'<div class="ticket ai-error" role="alert">'+safe(aiError)+btn('retryAI','重试 AI','primary')+'</div>':'')+'<div class="stack">'+s.players.map(playerCard).join('')+'</div><div class="mobile-tiles"><div class="actions">'+gameTools()+'</div></div><div class="ticket"><h3>最新行程</h3><p>'+safe(s.log.at(-1))+'</p></div></aside></div>';if(modal)modal();clock();updateCard()}
function results(){viewport.scrollTop=0;app.dataset.screen='results';const propCount=id=>Object.values(s.properties).filter(a=>a.ownerId===id);close();app.innerHTML='<div class="topline"><div><div class="folio">ARRIVALS</div><h1>旅程结算</h1></div></div><div class="summary-grid">'+s.ranking.map((id,i)=>{const p=player(id),props=propCount(id);return '<article class="ticket stack"><div class="folio">RANK '+(i+1)+'</div><h2>'+safe(p.name)+'</h2><strong>总资产 '+money(assets(s,map,id))+'</strong>'+grid([['现金',money(p.cash)],['地产',props.length+' 处'],['建筑',props.filter(a=>a.level===3).length+' 间旅馆，'+props.reduce((v,a)=>v+(a.level===3?0:a.level),0)+' 栋房'],['累计收租',money(p.rentReceived)],['累计支付',money(p.paid)],['状态',p.bankrupt?'破产':'完成旅行']])+'</article>'}).join('')+'</div><div class="actions section-head">'+btn('again','再来一局','primary')+btn('returnHome','返回首页')+'</div>'}
const grid=items=>'<div class="details">'+items.map(([k,v])=>'<div><small>'+safe(k)+'</small><b>'+safe(v)+'</b></div>').join('')+'</div>';
function tileInfo(i){const t=map.tiles[i],a=own(i),bank=Math.floor((t.price||0)/2),manage=a.ownerId===me()&&((s.phase==='roll'||s.phase==='jail')&&s.current===me()||s.phase==='debt'&&s.debt.from===me());return '<div class="stack"><div class="row"><img width="42" height="42" src="'+safe(map.icon)+'" alt=""><strong>'+safe(kinds[t.type])+'</strong>'+(a.level?building(a.level)+'<b>'+levels[a.level]+'</b>':'')+'</div>'+grid([['位置',i+' / 39'],['地块组',map.groups?.[t.group]?.name||kinds[t.type]],...(t.price?[['标价',money(t.price)],['所有者',a.ownerId?pName(a.ownerId):'银行 · 可购'],['抵押',a.mortgaged?'已抵押':'未抵押'],['抵押 / 赎回',money(bank)+' / '+money(Math.ceil(bank*110/100))]]:[]),...(t.type==='land'?[['当前开发',levels[a.level]],['盖房 / 旅馆',money(t.houseCost)+' / '+money(t.hotelCost)],...['baseRent','oneHouseRent','twoHouseRent','hotelRent'].map((k,j)=>[levels[j]+'租金',money(t[k])])]:[]),...(a.ownerId?[['本次骰点计租',money(rent(s,map,i,s.dice[0]))]]:[])])+(manage?'<div class="actions">'+(a.level?btn('asset:sell:'+i,'出售一级建筑'):(a.mortgaged?btn('asset:redeem:'+i,'赎回', '',s.phase==='debt'||player(me()).cash<Math.ceil(bank*110/100)):btn('asset:mortgage:'+i,'抵押')))+'</div>':'')+'</div>'}
function manage(){detail('地产管理',()=>{const ownTiles=map.tiles.filter(t=>own(t.index).ownerId===me());return '<p>现金 '+money(player(me()).cash)+'</p><div class="manage-list">'+(ownTiles.length?ownTiles.map(t=>btn('tile:'+t.index,t.name+' · '+(own(t.index).mortgaged?'已抵押':levels[own(t.index).level]))).join(''):'尚未持有地产。')+'</div>'})}
function tradeSide(label,id,key,v={cash:0,cards:0,tiles:[]}){const p=player(id);return '<fieldset><legend>'+label+' · '+safe(p.name)+'</legend><div class="field-pair"><label>现金<input type="number" min="0" max="'+p.cash+'" id="'+key+'Cash" value="'+v.cash+'"></label><label>出狱卡<input type="number" min="0" max="'+p.cards.length+'" id="'+key+'Cards" value="'+v.cards+'"></label></div>'+map.tiles.filter(t=>own(t.index).ownerId===id&&!own(t.index).level&&!own(t.index).mortgaged).map(t=>'<label class="check"><input type="checkbox" name="'+key+'Tiles" value="'+t.index+'" '+(v.tiles.includes(t.index)?'checked':'')+'>'+safe(t.name)+(own(t.index).mortgaged?'（抵押）':'')+'</label>').join('')+'</fieldset>'}
function tradeForm(to,editing=false){const from=editing?s.trade.from:me();to=editing?s.trade.to:to;const others=s.players.filter(p=>p.id!==from&&!p.bankrupt);to||=others[0]?.id;if(!to)return;modal=null;modalBox(editing?'修改交易':'发起交易','<div class="form">'+(!editing?'<label>交易对象<select id="tradeTo">'+others.map(p=>opt(p.id,p.name,to)).join('')+'</select></label>':'')+tradeSide('转出',from,'give',editing?s.trade.give:undefined)+tradeSide('换取',to,'take',editing?s.trade.take:undefined)+btn(editing?'sendEdit':'sendOffer','提交条款','primary')+'</div>')}
const readSide=k=>({cash:Number(value(k+'Cash')),cards:Number(value(k+'Cards')),tiles:[...document.querySelectorAll('input[name="'+k+'Tiles"]:checked')].map(e=>+e.value)});
function inspectTrade(){detail('交易条款',()=>{if(s.phase!=='trade')return '<p>交易已结束</p>';const tr=s.trade;const side=[tr.from,tr.to].includes(me());return '<div class="stack">'+[tr.from,tr.to].map((id,i)=>{const terms=i?tr.take:tr.give;return '<div class="ticket"><h3>'+safe(pName(id))+' 转出</h3><p>'+money(terms.cash)+' · 出狱卡 '+terms.cards+' 张<br>'+safe(terms.tiles.map(tileName).join('、')||'无地产')+'</p><strong>'+(tr.confirmed.includes(id)?'已确认':'待确认')+'</strong></div>'}).join('')+(side?'<div class="actions">'+btn('editTrade','修改')+cmd('confirm','确认',tr.confirmed.includes(me()))+cmd('cancel','取消交易')+'</div>':'')+'</div>'})}
const notice=document.getElementById('card-notice');
let cardKey,cardUntil,cardTimer,cardSignature;
function updateCard(){
  const card=s?.lastCard;
  if(!card?.kind||screen!=='game'){notice.hidden=true;return}
  const key=s.id+':'+card.revision+':'+card.id;
  const pending=s.phase==='commission'||s.debt?.cardRevision===card.revision;
  const landing=s.lastLanding;
  const arrived=card.destination!==undefined&&landing?.playerId===card.playerId&&landing.revision===card.arrivalRevision;
  const signature=JSON.stringify([key,pending,card.received,card.spent,arrived?landing:null]);
  if(key!==cardKey || signature!==cardSignature){
    cardKey=key;cardSignature=signature;cardUntil=performance.now()+4400;
    const kind=card.kind==='chance'?'机会':'命运';
    const who=card.playerId===me()?'你':pName(card.playerId);
    notice.className=card.kind;
    notice.innerHTML='<div class="card-kind"><span aria-hidden="true">'+icons[card.kind]+'</span> '+safe(who)+'踩到了'+kind+'</div>'+
      '<strong>'+safe(card.name)+'</strong><p>'+safe(card.text)+'</p>'+
      (card.received?'<b class="card-income">收入 +'+money(card.received)+'</b>':'')+
      (card.spent?'<b class="card-expense">支出 −'+money(card.spent)+'</b>':'')+
      (arrived?'<p class="card-arrival">抵达 '+safe(tileName(landing.index))+(landing.result?' · '+safe(landing.result):'')+'</p>':'');
  }
  clearTimeout(cardTimer);
  const remaining=cardUntil-performance.now();
  notice.hidden=!pending&&remaining<=0;
  if(!pending&&remaining>0)cardTimer=setTimeout(()=>{notice.hidden=true},remaining);
}
function transition(next){const old=s;s=next;const tag=++lastStamp;const move=next.lastMove,changed=old&&move&&old.lastMove?.id!==move.id&&move.path?.length;
 if(changed&&!prefs.fast&&!document.hidden){animation={playerId:move.playerId,pos:old.players.find(p=>p.id===move.playerId)?.pos??move.path[0]}}else animation=null;
 paint();if(!old||s.phase==='finished')return;
 if(next.lastRoll!==old.lastRoll)document.querySelectorAll('.die').forEach(el=>el.classList.add('toss'));
 for(const p of s.players){const prev=old.players.find(x=>x.id===p.id),node=[...document.querySelectorAll('[data-cash]')].find(el=>el.dataset.cash===p.id);if(!prev||!node||p.cash===prev.cash||prefs.fast)continue;const delta=p.cash-prev.cash,span=document.createElement('i');span.className='float-money';span.textContent=(delta>0?'+':'')+delta;node.after(span);const start=performance.now();function tick(now){const f=Math.min(1,(now-start)/350);node.textContent=money(Math.round(prev.cash+delta*f));if(f<1&&node.isConnected)requestAnimationFrame(tick)}requestAnimationFrame(tick);setTimeout(()=>span.remove(),1000)}
 for(const [idx,a] of Object.entries(s.properties)){if(a.level>old.properties[idx]?.level)document.querySelector('#tile-'+idx+' .level')?.classList.add('built')}
 if(animation){const step=(index)=>{if(tag!==lastStamp||!animation)return;animation.pos=move.path[index];document.querySelectorAll('.pieces').forEach(layer=>{layer.innerHTML=pieces()});if(index+1<move.path.length)setTimeout(()=>step(index+1),55);else animation=null};step(0)}
}
function clock(){for(const e of document.querySelectorAll('[data-deadline]')){const when=+e.dataset.deadline;e.textContent='剩余 '+Math.max(0,Math.ceil((when-Date.now())/1000))+' 秒'}}
setInterval(clock,500);
let aiError=null;
function schedule(){
  clearTimeout(actionTimer);
  if(source!=='solo'||paused||screen!=='game'||!s||s.phase==='finished')return;
  const state=s;
  const gameMap=map;
  actionTimer=setTimeout(()=>{
    if(paused||screen!=='game'||s!==state||source!=='solo')return;
    try{
      let next=expire(state,gameMap);
      if(next===state){
        const visible=publicState(state);
        for(const p of state.players){
          if(p.bankrupt||!p.ai)continue;
          const action=decide(visible,gameMap,p.id,config.difficulty);
          if(action){next=applyCommand(state,action,gameMap);break}
        }
        const actor=state.players.find(p=>p.id===acting());
        if(next===state&&actor?.ai&&state.phase!=='trade')throw Error('AI 无法处理当前阶段：'+state.phase);
      }
      if(next!==state){transition(next);storeGame()}
      schedule();
    }catch(error){
      console.error('单机 AI 执行失败',error);
      aiError='AI 执行失败：'+(error.message||'未知错误');
      paused=true;
      toast(aiError);
      paint();
    }
  },prefs.fast?80:Math.max(animation?360:0,300+Math.random()*500));
}

async function send(type,payload={}){if(busy||paused||!s||s.phase==='finished')return;busy=true;const revision=s.revision;try{if(source==='online')await net.command({type,...payload});else if(revision===s.revision){transition(applyCommand(s,{playerId:me(),type,...payload},map));storeGame();schedule()}sound()}finally{busy=false}}


function rules(){modal=null;modalBox('旅行规则','<ol class="rule-list"><li>每人从起点携带 ₳ 1,500 出发。掷一枚骰子，按 1～6 点移动，经过起点领 ₳ 200。</li><li>落在无主地产时可购买或选择不买。余额不足时仍可选择不买，地产继续由银行持有。</li><li>最终停在自己未抵押的普通地产，才能建设一次。空地 → 一栋房 → 两栋房 → 一间旅馆。持有完整同色组的空地租金翻倍。</li><li>交通按持有数量计租，公用事业按单枚骰子点数乘以持有倍率计租。抵押地产免租，建筑可按升级费用的一半逐级出售。</li><li>掷骰前可交易现金、无建筑地产和出狱卡。双方确认后成交。欠款时可先出售建筑或抵押地产。因银行债务破产的地产清空产权、建筑和抵押后归还银行。</li><li>入狱可支付 ₳ 50 或使用出狱卡后正常掷骰。也可尝试掷出 6 点免费出狱并移动。前两次失败留在监狱，第三次失败支付 ₳ 50 后按本次点数移动。</li><li>街区委托可原地交稿收款，或支付路费前往指定地产。去现场途中不领起点奖励，到达后正常购地、付租或建设。</li><li>经典模式最后一名未破产玩家胜出。快速模式以轮数为限，按现金、地产、建筑投入减抵押本金排名。</li></ol>')}
function settings(){
  modal=null;
  const toggles=[['music','背景音乐'],['sfx','操作音效'],['fast','加速或跳过动画']].map(([k,t])=>
    '<label class="check"><input type="checkbox" data-pref="'+k+'" '+(prefs[k]?'checked':'')+'>'+t+'</label>');
  const choices=Object.entries(tracks).map(([id,t])=>opt(id,t.name,prefs.track||'cafe')).join('');
  modalBox('旅行设置','<div class="form">'+toggles[0]+'<label>休闲曲目<select id="music-track">'+choices+'</select></label><label>音乐音量<input id="music-volume" type="range" min="0" max="100" step="1" value="'+Math.round((prefs.volume??.45)*100)+'"></label>'+toggles.slice(1).join('')+'</div>');
}
document.addEventListener('change',e=>{
  if(e.target.id!=='music-track'&&e.target.id!=='music-volume')return;
  if(e.target.id==='music-track')prefs.track=e.target.value;
  else prefs.volume=Number(e.target.value)/100;
  setPref('prefs',prefs);unlock();audioSettings();
});
async function goHome(){if(source==='online'&&room){await net.leave();net=null;room=null;s=null;history.replaceState(null,'',homeLink())}paused=true;home()}
function menu(){if(source==='solo'){pauseStarted=Date.now();paused=true;clearTimeout(actionTimer)}modal=null;modalBox('对局菜单','<div class="stack">'+(source==='solo'?'<p>已暂停，当前进度自动保存。</p>'+btn('resume','继续游戏','primary')+btn('manualSave','保存进度')+btn('restart','重新开始'):btn('close','继续查看','primary'))+btn('settings','音乐与设置')+btn('returnHome','返回首页')+'</div>')}
function soloUnpause(){if(paused&&screen==='game'&&source==='solo'){const timed=s.trade;if(timed&&pauseStarted)timed.deadline+=Date.now()-pauseStarted;pauseStarted=0;paused=false;paint();schedule()}}
const knownErrors={EXPIRED:'操作已超时，正在更新棋局',WRONG_PHASE:'当前阶段已改变，请查看最新操作',INSUFFICIENT_FUNDS:'可用资金不足',TRADE_BALANCE:'现金或出狱卡数量不足，请调整条款',INVALID_TERMS:'交易数量须为非负整数',EMPTY_TRADE:'请至少选择一项交易内容',ALREADY_CONFIRMED:'你已确认这笔交易',CAN_RAISE_FUNDS:'仍可筹款，请先出售建筑或抵押地产',UNEVEN_SALE:'请先出售同色组中等级最高的建筑',CANNOT_REDEEM:'当前无法赎回，请检查资金与抵押状态',NOT_OWNER:'这处地产属于其他玩家',INVALID_PLAYER:'该玩家已退出棋局',NOT_YOUR_TURN:'请等待自己的回合',INSUFFICIENT_CASH:'可用现金不足',ROOM_FULL:'房间席位已满',NOT_FOUND:'找不到该房间',STALE:'棋局已经更新，请按最新状态操作'};
async function dispatch(act){
 const [verb,arg,arg2]=act.split(':');
 switch(verb){
 case 'home':home();break;
 case 'returnHome':await goHome();break;
 case 'rules':rules();break;
 case 'settings':settings();break;
 case 'close':case 'resume':close();soloUnpause();break;
 case 'solo':case 'create':mapsPage(verb==='solo'?'solo':'create');break;
 case 'map':if(screen==='home')setup='solo';selection=arg;setupView();break;
 case 'startSetup':capture();if(setup==='solo')await startSolo();else{const next=await getNet().create({...profile,settings:settingsPayload()});await opened(next)}break;
 case 'join':joinView();break;
 case 'submitJoin':{capture();const code=value('joinCode').trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(code))throw Error('请输入六位字母或数字房间码');await opened(await getNet().join({...profile,code}));break}
 case 'continue':try{await restore()}catch(error){modalBox('存档读取失败','<p>'+safe(error.message)+'</p><div class="actions">'+btn('recover','读取备份','primary')+btn('solo','开始新棋局')+'</div>')}break;
 case 'recover':await restore(true);break;
 case 'addBot':await net.addBot();break;
 case 'removeBot':await net.removeBot(arg);break;
 case 'ready':await net.ready(!room.players.find(p=>p.id===me()).ready);break;
 case 'roomSettings':roomSettings();break;
 case 'saveRoomSettings':capture();selection=value('mapId');await net.settings(settingsPayload());close();break;
 case 'launch':await net.start();break;
 case 'leave':await goHome();break;
 case 'copyCode':await copy(room.code);toast('已复制房间码');break;
 case 'copyLink':await copy(roomLink(room.code));toast('已复制邀请链接');break;
 case 'share':{const url=roomLink(room.code);if(navigator.share){try{await navigator.share({title:'环球置业之旅',text:'加入我的旅行棋局',url});break}catch(e){if(e.name==='AbortError')break}}await copy(url);toast('邀请链接已复制，可发送给微信好友');break}
 case 'menu':menu();break;
 case 'retryAI':aiError=null;paused=false;paint();schedule();break;
 case 'manualSave':storeGame();await storeChain;toast('进度已保存');break;
 case 'restart':modalBox('重新开始这趟旅行？','<p>新棋局将替换当前自动存档。</p><div class="actions">'+btn('resume','保留进度')+btn('restartYes','重新开始','go')+'</div>');break;
 case 'restartYes':await startSolo();break;
 case 'again':if(source==='online'){const previous={...room.settings};await goHome();source='solo';selection=previous.mapId;setup='create';setupView()}else{selection=map.id;setup='solo';setupView()}break;
 case 'cmd':await send(arg);if(['confirm','cancel','bankrupt'].includes(arg))close();break;
 case 'bankruptcy':modal=null;modalBox('确认宣布破产？','<p>资产将按债务规则清算。</p><div class="actions">'+btn('close','继续筹款')+cmd('bankrupt','确认破产')+'</div>');break;
 case 'trade':tradeForm();break;
 case 'editTrade':tradeForm(null,true);break;
 case 'sendOffer':case 'sendEdit':{const data={give:readSide('give'),take:readSide('take')};if(verb==='sendOffer')data.to=value('tradeTo');await send(verb==='sendOffer'?'offer':'edit',data);close();break}
 case 'inspectTrade':inspectTrade();break;
 case 'asset':await send(arg,{tile:+arg2});break;
 case 'tile':detail(tileName(+arg),()=>tileInfo(+arg));break;
 case 'manage':manage();break;
 case 'zoomBoard':detail('放大棋盘',()=>'<div class="magnify">'+board()+'</div>');break;
 case 'tileList':detail('全图索引',()=>'<div class="manage-list tile-index">'+map.tiles.map(t=>btn('tile:'+t.index,t.index+' · '+t.name)).join('')+'</div>');break;
 case 'logs':detail('行程日志',()=>'<ul class="log">'+[...s.log].reverse().map(l=>'<li>'+safe(l)+'</li>').join('')+'</ul>');break;
 }
}
let navigationBusy=false;let previousAction='',previousActionTime=0,previousActionRevision=-1;
document.addEventListener('click',async e=>{if(e.target.classList?.contains('veil')){close();soloUnpause();return}const b=e.target.closest('[data-do]');if(!b||b.disabled||navigationBusy)return;unlock();const action=b.dataset.do;const now=Date.now();if(/^(cmd:|asset:|sendOffer|sendEdit)/.test(action)&&action===previousAction&&now-previousActionTime<300 && previousActionRevision===(s?.revision??-1))return;previousAction=action;previousActionTime=now;previousActionRevision=s?.revision??-1;navigationBusy=true;try{await dispatch(action)}catch(err){toast(knownErrors[err.code]||knownErrors[err.message]||err.message||'操作失败，请重试')}finally{navigationBusy=false}});
document.addEventListener('change',e=>{if(e.target.id==='tradeTo')tradeForm(e.target.value);if(e.target.dataset.pref){prefs[e.target.dataset.pref]=e.target.checked;setPref('prefs',prefs);audioSettings()}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.firstChild){close();soloUnpause()}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(source==='online'&&room)net.resync().catch(()=>{});else schedule()});
async function boot(){const r=await fetch('/packages/maps/catalog.json');if(!r.ok)throw Error('地图目录加载失败');catalog=await r.json();try{saved=await read()}catch{toast('浏览器存储不可用，本次进度可能无法保留')}configure(false,prefs.sfx);const code=invitedRoom();home();if(code){try{const restored=await getNet().resume(code);if(restored)await opened(restored);else joinView(code)}catch{joinView(code)}}if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('/sw.js').catch(e=>console.info('离线缓存暂不可用',e.message))}
const portraitViewport=matchMedia('(orientation:portrait)');
function orient(){
  const shell=document.getElementById('game-shell');
  shell.classList.toggle('sideways',portraitViewport.matches);
}
portraitViewport.addEventListener?.('change',orient);
window.addEventListener('resize',orient);
orient();
boot().catch(err=>{app.innerHTML='<section class="panel"><h2>无法展开地图</h2><p>'+safe(err.message)+'</p><button id="retry">重新载入</button></section>';document.querySelector('#retry').onclick=()=>location.reload()});

