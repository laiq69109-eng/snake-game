export const player = (s,id) => s.players.find(p=>p.id===id);
export const groupTiles = (m,t) => m.tiles.filter(x=>x.type==='land' && x.group===t.group);
export const complete = (s,m,t,id) => groupTiles(m,t).every(x=>s.properties[x.index].ownerId===id);
export const principal = t => Math.floor(t.price/2);
export const redemption = t => Math.floor((principal(t)*110+99)/100);
export const upgrade = (t,level) => level===2?t.hotelCost:t.houseCost;
export const invested = (t,level) => level ? Math.min(2,level)*t.houseCost+(level===3?t.hotelCost:0) : 0;
export const refund = (t,level) => Math.floor(upgrade(t,level-1)/2);
export function rent(s,m,i,dicePoint = s.dice[0]) {
  const a=s.properties[i],t=m.tiles[i];
  if(!a?.ownerId || a.mortgaged) return 0;
  if(t.type==='land') return [t.baseRent*(complete(s,m,t,a.ownerId)?2:1),t.oneHouseRent,t.twoHouseRent,t.hotelRent][a.level];
  const n=m.tiles.filter(x=>x.type===t.type && s.properties[x.index].ownerId===a.ownerId).length;
  return t.type==='rail'?[25,50,100,200][n-1]:dicePoint*(n===2?10:4);
}
export function assets(s,m,id) {
  return m.tiles.reduce((sum,t)=>{
    const a=s.properties[t.index];
    return sum+(a?.ownerId===id?t.price+invested(t,a.level)-(a.mortgaged?principal(t):0):0);
  },player(s,id).cash);
}
export function buildable(s,m,i,id) {
  const a=s.properties[i],t=m.tiles[i];
  if(t.type!=='land'||a.ownerId!==id||a.mortgaged||a.level>=3) return false;
  return !s.classicBuildingRules || (complete(s,m,t,id) &&
    groupTiles(m,t).every(x=>!s.properties[x.index].mortgaged && s.properties[x.index].level>=a.level));
}