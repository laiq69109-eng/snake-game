import {isRoundLimit,JAIL_STAY_TURNS} from './packages/protocol/index.js?v=56c198d0e35e';

export function checkSave(record,map){
 const fail=()=>{throw Error('存档结构损坏，请尝试上一份备份')};
 const g=record.game,valid=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 const amount=v=>valid(v,0,Number.MAX_SAFE_INTEGER);
 if(![1,2].includes(record.version)||g.version!==2||!isRoundLimit(g.limit)||g.dice?.length!==1||!valid(g.dice[0],1,6)||g.mapId!==map.id||!valid(g.players?.length,2,4)||!Array.isArray(g.queue)||!Array.isArray(g.log)||!Array.isArray(g.ranking)||!valid(g.round,1,1e9)||!valid(g.revision,0,1e12))fail();
 const ids=new Set(g.players.map(p=>p.id)),cardIds=new Set([...map.cards.chance,...map.cards.fate].map(c=>c.id));
 if(ids.size!==g.players.length||!ids.has('human')||!ids.has(g.current))fail();
 for(const p of g.players){if(!valid(p.jailTurnsRemaining,0,JAIL_STAY_TURNS)||(!p.jailed&&p.jailTurnsRemaining>0)||!amount(p.cash)||!valid(p.pos,0,map.tiles.length-1)||typeof p.name!=='string'||!Array.isArray(p.cards)||p.cards.some(id=>!cardIds.has(id)))fail()}
 for(const t of map.tiles.filter(t=>t.price)){const a=g.properties?.[t.index];if(!a||(a.ownerId!==null&&!ids.has(a.ownerId))||!valid(a.level,0,t.type==='land'?3:0)||typeof a.mortgaged!=='boolean')fail()}
 for(const k of ['chance','fate']){if(!Array.isArray(g.decks?.[k])||g.decks[k].some(id=>!map.cards[k].some(c=>c.id===id)))fail()}
 if(g.phase==='commission'){
   const card=[...map.cards.chance,...map.cards.fate].find(c=>c.id===g.lastCard?.id&&c.effect==='commission');
   if(!card||['target','fee','reward','effect'].some(k=>g.lastCard[k]!==card[k]))fail();
 }
 if(g.phase==='trade'&&(!g.trade||!ids.has(g.trade.from)||!ids.has(g.trade.to)||!Array.isArray(g.trade.confirmed)||!amount(g.trade.deadline)))fail();
 if(g.phase==='debt'&&(!g.debt||!ids.has(g.debt.from)||!amount(g.debt.amount)))fail();
 if(g.phase==='finished'&&g.ranking.length!==ids.size)fail();
}

