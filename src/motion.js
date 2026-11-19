// Physics remains on the grid; rendering samples the path between physics ticks.
export class MotionBuffer {
  constructor(step=165){this.step=step;this.frames=[];this.round=null;}
  reset(){this.frames=[];this.round=null;}
  push(room,rebase=false){
    if(this.round!==room.started){this.reset();this.round=room.started;}
    if(!Number.isFinite(room.tick))return;
    if(rebase)this.frames=this.frames.filter(f=>f.tick<room.tick);
    const snapshot={tick:room.tick,players:room.players.map(p=>({...p,body:p.body.map(b=>({...b}))}))};
    const index=this.frames.findIndex(f=>f.tick===room.tick);
    if(index>=0)this.frames[index]=snapshot;else{this.frames.push(snapshot);this.frames.sort((a,b)=>a.tick-b.tick);}
    if(this.frames.length>24)this.frames.splice(0,this.frames.length-24);
  }
  sample(id,time){
    if(!this.frames.length)return null;
    let a=this.frames[0],b=null;
    for(const frame of this.frames){if(frame.tick<=time)a=frame;else{b=frame;break;}}
    const p=a.players.find(p=>p.id===id);if(!p)return null;
    if(time<=a.tick)return p;
    const q=b?.players.find(p=>p.id===id);
    if(q){
      if(!p.alive||!q.alive||p.respawn!==q.respawn||!p.body.length||!q.body.length)return p;
      const alpha=Math.max(0,Math.min(1,(time-a.tick)/(b.tick-a.tick)));
      return {...q,body:q.body.map((v,i)=>{const old=p.body[Math.min(i,p.body.length-1)];return {x:old.x+(v.x-old.x)*alpha,y:old.y+(v.y-old.y)*alpha};})};
    }
    if(!p.alive||!p.body.length)return p;
    // One bounded tick hides short gaps without making a disconnected snake run away.
    const alpha=Math.min(1,(time-a.tick)/this.step),dir=p.next??p.dir;
    return {...p,body:p.body.map((v,i)=>{const to=i?p.body[i-1]:{x:v.x+[0,1,0,-1][dir],y:v.y+[-1,0,1,0][dir]};return {x:v.x+(to.x-v.x)*alpha,y:v.y+(to.y-v.y)*alpha};})};
  }
}
