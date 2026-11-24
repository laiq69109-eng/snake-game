import {requireRule as check,validateCommand} from '../protocol/index.js?v=bb89845d1a9a';
import {validateMap} from '../maps/validate.js?v=bb89845d1a9a';
import {player,assets,rent,principal,redemption,upgrade,refund,buildable,groupTiles} from './economy.js?v=bb89845d1a9a';
export {assets,rent,principal,redemption,upgrade,refund,buildable} from './economy.js?v=bb89845d1a9a';

const alive = s=>s.players.filter(p=>!p.bankrupt);
const note = (s,msg)=>{s.log.push(msg);if(s.log.length>80)s.log.shift()};
const active = s=>player(s,s.current);
const environment = deps=>({random:deps?.random??Math.random,now:deps?.now??Date.now()});
function shuffle(list,rng) {
  const a=[...list];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}
export function createGame(map,seats,settings={},deps={}) {
  validateMap(map);
  check(seats.length>=2 && seats.length<=4 && seats.every(p=>typeof p.id==='string' && p.id.length>0) &&
    new Set(seats.map(p=>p.id)).size===seats.length,'INVALID_SEATS');
  const {random}=environment(deps);
  const players=shuffle(seats,random).map(p=>({id:p.id,name:p.name||p.id,avatar:p.avatar??0,ai:!!p.ai,
    cash:1500,pos:map.tiles.findIndex(t=>t.type==='start'),jailed:false,attempts:0,cards:[],bankrupt:false,rentReceived:0,paid:0}));
  const properties=Object.fromEntries(map.tiles.filter(t=>['land','rail','utility'].includes(t.type)).map(t=>[t.index,{ownerId:null,level:0,mortgaged:false}]));
  return {version:2,id:deps.id??Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''),mapId:map.id,mode:settings.mode==='quick'?'quick':'classic',
    limit:[20,30,40].includes(settings.limit)?settings.limit:30,classicBuildingRules:!!settings.classicBuildingRules,
    current:players[0].id,players,properties,round:1,turn:1,phase:'roll',dice:[1],lastRoll:null,
    revision:0,queue:[],debt:null,trade:null,ranking:[],decks:Object.fromEntries(['chance','fate'].map(k=>[k,shuffle(map.cards[k].map(c=>c.id),random)])),
    log:['出发顺序 · '+players.map(p=>p.name).join(' → ')],lastMove:null,lastCard:null,lastLanding:null};
}
export function publicState(s){const {decks,queue,...rest}=s;return structuredClone(rest)}
function finish(s,m) {
  s.phase='finished';s.queue=[];s.trade=s.debt=null;
  s.ranking=[...s.players].sort((a,b)=>Number(a.bankrupt)-Number(b.bankrupt)||assets(s,m,b.id)-assets(s,m,a.id)).map(p=>p.id);
  note(s,'旅程结束 · '+player(s,s.ranking[0]).name+' 位列第一');
}
function next(s,m) {
  if(alive(s).length<=1)return finish(s,m);
  let i=s.players.findIndex(p=>p.id===s.current);
  do {i=(i+1)%s.players.length;if(i===0){if(s.mode==='quick'&&s.round>=s.limit)return finish(s,m);s.round++}}
  while(s.players[i].bankrupt);
  s.current=s.players[i].id;s.turn++;s.lastTradeTurn=null;
  s.phase=active(s).jailed?'jail':'roll';
}
function pay(s,d) {
  const p=player(s,d.from),receiver=player(s,d.to);
  if(p.bankrupt||receiver?.bankrupt)return;
  if(p.cash<d.amount){s.phase='debt';s.debt=d;note(s,p.name+' 待清偿 '+d.amount+' · '+d.reason);return}
  p.cash-=d.amount;p.paid+=d.amount;
  if(receiver){receiver.cash+=d.amount;if(d.reason==='租金')receiver.rentReceived+=d.amount}
  if(d.cardRevision===s.lastCard?.revision && s.lastCard){
    if(s.lastCard.playerId===p.id)s.lastCard.spent+=d.amount;
    if(s.lastCard.playerId===receiver?.id)s.lastCard.received+=d.amount;
  }
  note(s,p.name+' 支付 '+d.amount+' · '+d.reason);
}
function jail(s,m) {
  const p=active(s);p.pos=m.tiles.findIndex(t=>t.type==='jail');p.jailed=true;p.attempts=0;
  s.lastLanding={index:p.pos,playerId:p.id,revision:s.revision,result:'进入监狱'};
  s.lastMove={id:s.revision,playerId:p.id,path:[p.pos]};note(s,p.name+' 进入监狱');next(s,m);
}
function walk(s,m,steps,salary,viaCard) {
  const p=active(s),path=[];
  for(let n=0;n<Math.abs(steps);n++){
    p.pos=(p.pos+Math.sign(steps)+m.tiles.length)%m.tiles.length;path.push(p.pos);
    if(steps>0 && salary && m.tiles[p.pos].type==='start'){p.cash+=200;note(s,p.name+' 经过起点 +200')}
  }
  if(viaCard && s.lastCard?.playerId===p.id){
    s.lastCard.destination=p.pos;
    s.lastCard.arrivalRevision=s.revision;
  }
  if(viaCard && s.lastMove?.id===s.revision)s.lastMove.path.push(...path);
  else s.lastMove={id:s.revision,playerId:p.id,path};
  s.queue.unshift({kind:'land',viaCard});
}
function rollDie(e){return 1+Math.floor(e.random()*6)}
function draw(s,m,kind,e) {
  const p=active(s),deck=s.decks[kind];
  if(!deck.length)deck.push(...shuffle(m.cards[kind].filter(c=>!s.players.some(x=>x.cards.includes(c.id))).map(c=>c.id),e.random));
  if(!deck.length)return;
  const id=deck.shift(),c=m.cards[kind].find(x=>x.id===id);
  s.lastCard={...c,kind,playerId:p.id,revision:s.revision,received:0,spent:0};note(s,c.name+' · '+c.text);
  if(c.effect==='pass'){p.cards.push(id);return}
  deck.push(id);
  const debt=(from,to,amount)=>({kind:'pay',from,to,amount,reason:c.name,cardRevision:s.lastCard.revision});
  switch(c.effect) {
    case 'commission':s.phase='commission';break;
    case 'cash':p.cash+=c.amount;s.lastCard.received+=c.amount;break;
    case 'pay':s.queue.unshift(debt(p.id,null,c.amount));break;
    case 'jail':jail(s,m);break;
    case 'payEach':case 'collectEach':
      s.queue.unshift(...alive(s).filter(x=>x!==p).map(x=>c.effect==='payEach'?debt(p.id,x.id,c.amount):debt(x.id,p.id,c.amount)));break;
    case 'repair':{
      let amount=0;for(const a of Object.values(s.properties))if(a.ownerId===p.id)amount+=a.level===3?c.hotelAmount:a.level*c.amount;
      if(amount)s.queue.unshift(debt(p.id,null,amount));break;
    }
    case 'steps':walk(s,m,c.amount,c.salary,true);break;
    case 'goto':walk(s,m,(c.target-p.pos+m.tiles.length)%m.tiles.length,c.salary,true);break;
    case 'rail':case 'utility':{
      let steps=1;while(m.tiles[(p.pos+steps)%m.tiles.length].type!==c.effect)steps++;
      walk(s,m,steps,c.salary,true);break;
    }
  }
}
function land(s,m,viaCard,e){
  const p=active(s),t=m.tiles[p.pos],a=s.properties[p.pos];
  s.lastLanding={index:t.index,playerId:p.id,revision:s.revision};
  const result=text=>{s.lastLanding.result=text;};
  note(s,p.name+' 抵达 '+t.name);
  if(a){
    if(!a.ownerId){s.phase='buy';result('可购买');return}
    if(a.ownerId===p.id){if(buildable(s,m,t.index,p.id))s.phase='build';result(s.phase==='build'?'可建设':'自有地产');return}
    if(a.mortgaged){result('已抵押，免租');return}
    const cardUtility=viaCard&&t.type==='utility';
    const point=cardUtility?rollDie(e):s.dice[0];
    if(cardUtility)note(s,'公用事业计租骰 '+point+' 点');
    const amount=rent(s,m,t.index,point);
    pay(s,{from:p.id,to:a.ownerId,amount,reason:'租金'});
    result((s.phase==='debt'?'待付租金 ₳':'支付租金 ₳')+amount);
  }else if(t.type==='tax'){
    pay(s,{from:p.id,to:null,amount:t.amount,reason:t.name});
    result((s.phase==='debt'?'待缴税 ₳':'缴税 ₳')+t.amount);
  }
  else if(t.type==='goJail')jail(s,m);
  else if(t.type==='chance'||t.type==='fate')draw(s,m,t.type,e);
}
function drain(s,m,e) {
  let count=0;
  while(s.phase==='resolve'){
    check(++count<100,'MAP_EFFECT_LOOP');
    const job=s.queue.shift();
    if(!job){if(active(s).bankrupt)next(s,m);else s.phase='end';break}
    switch(job.kind){
      case 'land':land(s,m,job.viaCard,e);break;
      case 'pay':pay(s,job);break;
      case 'move':if(!active(s).bankrupt)walk(s,m,job.steps,true,false);break;
    }
  }
}
export function migrateGame(state,m,now=Date.now()){
  if(state.version===2)return state;
  check(state.version===1,'UNSUPPORTED_SAVE','无法继续此版本的棋局');
  const s=structuredClone(state);
  s.version=2;
  s.dice=[Math.min(6,Math.max(1,s.dice?.[0]||1))];
  s.lastRoll=null;
  s.lastLanding=null;
  if(s.lastCard){
    const kind=['chance','fate'].find(key=>m.cards[key].some(card=>card.id===s.lastCard.id));
    s.lastCard={...s.lastCard,kind,playerId:s.current,received:0,spent:0};
  }
  s.queue=s.queue.filter(job=>job.kind!=='auction');
  if(s.phase==='auction'){
    if(s.properties[s.auction?.tile])s.properties[s.auction.tile]={ownerId:null,level:0,mortgaged:false};
    s.phase='resolve';
    drain(s,m,environment({now}));
  }else if(s.phase==='roll'&&s.doubles>0)s.phase='end';
  delete s.auction;
  delete s.doubles;
  delete s.extra;
  return s;
}
export function expire(state,m,now=Date.now()){
  if(state.phase==='trade' && now>=state.trade.deadline){
    const s=structuredClone(state);s.revision++;s.trade=null;s.phase='roll';note(s,'交易已超时');return s;
  }
  return state;
}
function returnCard(s,m,id){const k=['chance','fate'].find(k=>m.cards[k].some(c=>c.id===id));s.decks[k].push(id)}
function liquidate(s,m,p){
  const creditor=player(s,s.debt.to);
  let possible=p.cash;
  for(const t of m.tiles){const a=s.properties[t.index];if(a?.ownerId!==p.id)continue;
    for(let l=a.level;l>0;l--)possible+=refund(t,l);
    if(!a.mortgaged)possible+=principal(t);
  }
  check(possible<s.debt.amount,'CAN_RAISE_FUNDS','仍可出售建筑或抵押筹资');
  for(const t of m.tiles){const a=s.properties[t.index];if(a?.ownerId!==p.id)continue;
    while(a.level>0)p.cash+=refund(t,a.level--);
    a.ownerId=creditor?.id??null;if(!creditor)a.mortgaged=false;
  }
  if(creditor){creditor.cash+=p.cash;creditor.cards.push(...p.cards);if(s.debt.reason==='租金')creditor.rentReceived+=p.cash}
  else p.cards.forEach(id=>returnCard(s,m,id));
  p.paid+=p.cash;p.cash=0;p.cards=[];p.bankrupt=true;p.bankruptCause=s.debt.reason;s.debt=null;
  note(s,p.name+' 破产退出');
  if(alive(s).length===1)return finish(s,m);
  if(p.id===s.current)s.queue=[];
  s.phase='resolve';
}
function checkSide(s,id,side){
  const p=player(s,id);
  check(p&&!p.bankrupt && p.cash>=side.cash && p.cards.length>=side.cards,'TRADE_BALANCE');
  side.tiles.forEach(i=>{const a=s.properties[i];check(a?.ownerId===id&&!a.level&&!a.mortgaged,'TRADE_PROPERTY','交易前请出售建筑并赎回抵押')});
}
function validTrade(s,t){
  check(t.from!==t.to,'INVALID_PARTNER');checkSide(s,t.from,t.give);checkSide(s,t.to,t.take);
  check([t.give,t.take].some(side=>side.cash||side.cards||side.tiles.length),'EMPTY_TRADE');
}
function executeTrade(s,t){
  validTrade(s,t);const a=player(s,t.from),b=player(s,t.to);
  const ac=a.cards.splice(0,t.give.cards),bc=b.cards.splice(0,t.take.cards);
  a.cards.push(...bc);b.cards.push(...ac);a.cash+=t.take.cash-t.give.cash;b.cash+=t.give.cash-t.take.cash;a.paid+=t.give.cash;b.paid+=t.take.cash;
  t.give.tiles.forEach(i=>s.properties[i].ownerId=b.id);t.take.tiles.forEach(i=>s.properties[i].ownerId=a.id);
  note(s,a.name+' 与 '+b.name+' 完成交易');s.trade=null;s.phase='roll';
}
export function applyCommand(state,c,m,deps={}){
  validateCommand(c);
  const e=environment(deps),s=structuredClone(state),p=player(s,c.playerId);
  check(p&&!p.bankrupt,'INVALID_PLAYER');
  const ph=s.phase;
  check(ph!=='finished','GAME_OVER');
  if(ph==='trade')check(e.now<s.trade.deadline,'EXPIRED');
  if(ph==='trade')check([s.trade.from,s.trade.to].includes(p.id),'NOT_PARTICIPANT');
  else check(p.id===(ph==='debt'?s.debt.from:s.current),'NOT_YOUR_TURN');
  const phase=(...allowed)=>check(allowed.includes(ph),'WRONG_PHASE');
  const t=m.tiles[p.pos],a=s.properties[p.pos];
  s.revision++;
  switch(c.type){
    case 'takeFee':
    case 'visitSite': {
      phase('commission');
      const card=s.lastCard;
      check(card?.effect==='commission','NO_COMMISSION');
      s.phase='resolve';
      if(c.type==='takeFee'){
        p.cash+=card.reward;card.received+=card.reward;
        note(s,p.name+' 交付街区提案，收到稿费 '+card.reward);
      }else{
        check(p.cash>=card.fee,'INSUFFICIENT_FUNDS');
        pay(s,{from:p.id,to:null,amount:card.fee,reason:'委托路费',cardRevision:card.revision});
        walk(s,m,(card.target-p.pos+m.tiles.length)%m.tiles.length,false,true);
      }
      break;
    }
    case 'roll':{
      phase('roll','jail');
      const point=rollDie(e);
      s.dice=[point];
      s.lastRoll=s.revision;
      note(s,p.name+' 掷出 '+point+' 点');
      if(ph==='jail'){
        if(point!==6 && ++p.attempts<3){note(s,'尝试出狱失败');s.phase='end';break}
        p.jailed=false;p.attempts=0;
        if(point!==6)s.queue.push({kind:'pay',from:p.id,to:null,amount:50,reason:'出狱费'});
      }
      s.phase='resolve';s.queue.push({kind:'move',steps:point});break;
    }
    case 'useCard':case 'bail':
      phase('jail');if(c.type==='useCard'){check(p.cards.length,'NO_CARD');returnCard(s,m,p.cards.shift())}
      else {check(p.cash>=50,'INSUFFICIENT_FUNDS');p.cash-=50;p.paid+=50}
      p.jailed=false;p.attempts=0;s.phase='roll';break;
    case 'buy':
      phase('buy');check(a&&!a.ownerId&&p.cash>=t.price,'CANNOT_BUY');a.ownerId=p.id;p.cash-=t.price;p.paid+=t.price;
      note(s,p.name+' 购入 '+t.name+' · '+t.price);s.phase='resolve';break;
    case 'decline':phase('buy');note(s,p.name+' 放弃购买 '+t.name);s.phase='resolve';break;
    case 'build':{
      phase('build');check(buildable(s,m,p.pos,p.id),'CANNOT_BUILD');
      const cost=upgrade(t,a.level);check(p.cash>=cost,'INSUFFICIENT_FUNDS');p.cash-=cost;p.paid+=cost;a.level++;
      note(s,t.name+' 建成'+['','一栋房','两栋房','旅馆'][a.level]+' · '+cost);s.phase='resolve';break;
    }
    case 'skip':phase('build');s.phase='resolve';break;
    case 'end':phase('end');next(s,m);break;
    case 'sell':case 'mortgage':case 'redeem':{
      phase('roll','jail','debt');const prop=s.properties[c.tile],tile=m.tiles[c.tile];check(prop?.ownerId===p.id,'NOT_OWNER');
      if(c.type==='sell'){check(prop.level>0,'NO_BUILDINGS');
        if(s.classicBuildingRules)check(groupTiles(m,tile).every(x=>s.properties[x.index].level<=prop.level),'UNEVEN_SALE');
        p.cash+=refund(tile,prop.level--);
      }else if(c.type==='mortgage'){check(!prop.level&&!prop.mortgaged,'CANNOT_MORTGAGE');prop.mortgaged=true;p.cash+=principal(tile)}
      else{check(ph!=='debt'&&prop.mortgaged&&p.cash>=redemption(tile),'CANNOT_REDEEM');p.cash-=redemption(tile);p.paid+=redemption(tile);prop.mortgaged=false}
      note(s,p.name+({sell:' 出售建筑 · ',mortgage:' 抵押 · ',redeem:' 赎回 · '}[c.type])+tile.name);break;
    }
    case 'settle':phase('debt');check(p.cash>=s.debt.amount,'INSUFFICIENT_FUNDS');pay(s,s.debt);s.debt=null;s.phase='resolve';break;
    case 'bankrupt':phase('debt');liquidate(s,m,p);break;
    case 'offer':case 'edit':{
      if(c.type==='offer')phase('roll');else phase('trade');
      const tr={from:c.type==='offer'?p.id:s.trade.from,to:c.type==='offer'?c.to:s.trade.to,
        give:structuredClone(c.give),take:structuredClone(c.take),confirmed:[],deadline:e.now+45000};
      validTrade(s,tr);s.trade=tr;s.phase='trade';s.lastTradeTurn=s.turn;break;
    }
    case 'confirm':phase('trade');validTrade(s,s.trade);check(!s.trade.confirmed.includes(p.id),'ALREADY_CONFIRMED');
      s.trade.confirmed.push(p.id);if(s.trade.confirmed.length===2)executeTrade(s,s.trade);break;
    case 'cancel':phase('trade');s.trade=null;s.phase='roll';break;
  }
  drain(s,m,e);return s;
}