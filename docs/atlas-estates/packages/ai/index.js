import {JAIL_BAIL_COST} from '../protocol/index.js?v=30617823abbb';
import {groupTiles,redemption,principal,refund,upgrade,buildable} from '../game-core/economy.js?v=30617823abbb';

function holdingValue(s,m,t,id){
  const held=t.type==='land'?groupTiles(m,t):m.tiles.filter(x=>x.type===t.type);
  const mine=held.filter(x=>s.properties[x.index].ownerId===id).length;
  return t.price*(1+mine/held.length)+(mine===held.length-1?t.price*0.6:0);
}
function liquidation(s,m,p){
  if(p.cash>=s.debt.amount)return {type:'settle'};
  const owned=m.tiles.filter(t=>s.properties[t.index]?.ownerId===p.id);
  const options=owned.flatMap(t=>{
    const a=s.properties[t.index];
    if(a.level){
      if(s.classicBuildingRules && groupTiles(m,t).some(x=>s.properties[x.index].level>a.level))return [];
      return [{type:'sell',tile:t.index,value:refund(t,a.level),loss:t.baseRent*a.level}];
    }
    return a.mortgaged?[]:[{type:'mortgage',tile:t.index,value:principal(t),loss:t.baseRent??25}];
  });
  options.sort((a,b)=>a.loss*b.value-b.loss*a.value);
  return options.length?{type:options[0].type,tile:options[0].tile}:{type:'bankrupt'};
}
export function decide(s,m,id,difficulty='normal',rng=Math.random){
  const p=s.players.find(x=>x.id===id);
  if(!p || p.bankrupt || s.phase==='finished')return null;
  const rivals=s.players.filter(x=>!x.bankrupt&&x.id!==id);
  const hard=difficulty==='hard',easy=difficulty==='easy';
  const exposure=m.tiles.reduce((max,t)=>{
    const a=s.properties[t.index];
    if(!a?.ownerId||a.ownerId===id||a.mortgaged)return max;
    const rent=[t.baseRent??30,t.oneHouseRent,t.twoHouseRent,t.hotelRent][a.level];
    return Math.max(max,rent);
  },0);
  const reserve=easy?40:hard?Math.min(430,110+exposure):150;
  const cmd=(type,data={})=>({playerId:id,type,...data});
  const a=s.properties[p.pos],t=m.tiles[p.pos];
  if(s.phase==='trade'){
    const tr=s.trade;if(![tr.from,tr.to].includes(id)||tr.confirmed.includes(id))return null;
    const outgoing=tr.from===id?tr.give:tr.take;
    const incoming=tr.from===id?tr.take:tr.give;
    const value=side=>side.cash+side.cards*45+side.tiles.reduce((sum,i)=>sum+holdingValue(s,m,m.tiles[i],id),0);
    return cmd(value(incoming)>=value(outgoing)?'confirm':'cancel');
  }
  if(s.phase==='debt')return s.debt.from===id?{...liquidation(s,m,p),playerId:id}:null;
  if(id!==s.current)return null;
  switch(s.phase){
    case 'commission':{
      const card=s.lastCard,site=m.tiles[card.target],holding=s.properties[card.target];
      const available=p.cash-card.fee;
      const canDevelop=buildable(s,m,card.target,id) && available>=reserve+upgrade(site,holding.level);
      const canAcquire=!holding.ownerId && available>=reserve+site.price;
      return cmd(available>=0 && (canDevelop||canAcquire) && (!easy||rng()>.3)?'visitSite':'takeFee');
    }
    case 'roll':{
      const lot=m.tiles.find(t=>s.properties[t.index]?.ownerId===id && s.properties[t.index].mortgaged && p.cash>=reserve+redemption(t));
      if(lot)return cmd('redeem',{tile:lot.index});
      if(!easy && s.lastTradeTurn!==s.turn && rng()<0.12){
        const wanted=m.tiles.find(t=>t.type==='land' && s.properties[t.index].ownerId && s.properties[t.index].ownerId!==id &&
          !s.properties[t.index].level && !s.properties[t.index].mortgaged && groupTiles(m,t).every(x=>x===t||s.properties[x.index].ownerId===id));
        if(wanted){const cash=Math.floor(wanted.price*1.4);
          if(p.cash>=cash+reserve)return cmd('offer',{to:s.properties[wanted.index].ownerId,give:{cash,tiles:[],cards:0},take:{cash:0,tiles:[wanted.index],cards:0}});
        }
      }
      return cmd('roll');
    }
    case 'jail':return cmd(p.cards.length?'useCard':p.cash>=reserve+JAIL_BAIL_COST&&s.round<12?'bail':'stayInJail');
    case 'end':return cmd('end');
    case 'buy':return cmd(p.cash>=t.price && (easy?rng()>0.18:p.cash-t.price>=reserve || holdingValue(s,m,t,id)>t.price*1.65)?'buy':'decline');
    case 'build':{
      const cost=upgrade(t,a.level),rents=[t.baseRent,t.oneHouseRent,t.twoHouseRent,t.hotelRent];
      const potential=hard?Math.min(...rivals.map(x=>x.cash+200),rents[a.level+1])-rents[a.level]:1;
      const worth=hard?potential*8>=cost:easy?rng()>0.3:true;
      return cmd(p.cash>=cost+(easy?0:reserve)&&worth?'build':'skip');
    }
    default:return null;
  }
}