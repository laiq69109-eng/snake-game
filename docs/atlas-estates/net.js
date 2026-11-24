import {socketLink} from './room-location.js?v=bb89845d1a9a';
const sessionKey=code=>'atlas:room:'+code;
const makeId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
export class RoomClient {
  constructor({onSnapshot=()=>{},onStatus=()=>{}}={}) {
    this.onSnapshot=onSnapshot; this.onStatus=onStatus; this.calls=new Map(); this.retry=500;
    this.foreground=()=>{if(document.visibilityState==='visible'&&this.code)this.resync().catch(()=>this.reconnect());};
    document.addEventListener('visibilitychange',this.foreground);
    window.addEventListener('online',this.foreground);
  }
  async connect() {
    if(this.ws?.readyState===1)return;
    if(this.connecting)return this.connecting;
    this.onStatus(this.code?'正在恢复连接':'正在连接房间服务，首次唤醒可能需要约一分钟');
    const ws=new WebSocket(socketLink());
    this.ws=ws;
    this.connecting=new Promise((resolve,reject)=>{
      const guard=setTimeout(()=>ws.close(),90000);
      ws.onopen=()=>{clearTimeout(guard);this.connecting=null;this.onStatus('在线');resolve();};
      ws.onmessage=e=>{
        let msg;try {msg=JSON.parse(e.data);} catch{return;}
        if(msg.event==='snapshot'){this.accept(msg.room);return;}
        const call=this.calls.get(msg.id);if(!call)return;
        this.calls.delete(msg.id);clearTimeout(call.timeout);
        msg.ok?call.resolve(msg):call.reject(Object.assign(Error(msg.message),{code:msg.error}));
      };
      ws.onclose=()=>{
        clearTimeout(guard); if(this.ws!==ws)return;
        this.ws=null;this.connecting=null;this.onStatus('离线');reject(Error('无法连接房间服务'));
        for(const call of this.calls.values()){clearTimeout(call.timeout);call.reject(Error('连接中断，正在恢复房间'));}
        this.calls.clear();this.reconnect();
      };
    });
    return this.connecting;
  }
  reconnect() {
    if(!this.code||this.timer)return;
    this.timer=setTimeout(async()=>{
      this.timer=0;
      try {await this.resume(this.code);this.retry=500;}
      catch(e) {if(['BAD_TOKEN','ROOM_NOT_FOUND'].includes(e.code)){this.code=null;return;} this.retry=Math.min(8000,this.retry*2);this.reconnect();}
    },this.retry);
  }
  async request(action,payload={},id=makeId()){
    await this.connect();
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{this.calls.delete(id);reject(Error('房间操作超时'));},12000);
      this.calls.set(id,{resolve,reject,timeout});
      this.ws.send(JSON.stringify({id,action,payload}));
    });
  }
  accept(room,full=false) {
    if(!this.code || room.code!==this.code)return;
    if(this.room?.code===room.code && (room.revision<this.room.revision || (room.revision===this.room.revision&&!full)))return;
    if(!full && this.room && room.revision!==this.room.revision+1){this.resync().catch(()=>{});return;}
    this.room=room;this.onSnapshot(room);
  }
  async identity(action,payload) {
    const result=await this.request(action,payload);
    this.playerId=result.playerId;this.code=result.room.code;
    if(result.token){try{localStorage.setItem(sessionKey(this.code),result.token);}catch{} this.token=result.token;}
    this.accept(result.room,true);return this.room;
  }
  create(options){return this.identity('room:create',options);}
  join(options){return this.identity('room:join',{...options,code:options.code.toUpperCase()});}
  resume(code){
    let token=this.token;try{token=localStorage.getItem(sessionKey(code))||token;}catch{}
    if(!token)return Promise.reject(Error('没有可恢复的房间身份'));
    return this.identity('room:resume',{code,token});
  }
  async resync(){if(!this.ws||this.ws.readyState!==1)return this.resume(this.code);const r=await this.request('room:sync');this.accept(r.room,true);return this.room;}
  ready(ready){return this.request('room:ready',{ready});}
  addBot(){return this.request('room:addBot',{});}
  removeBot(id){return this.request('room:removeBot',{id});}
  settings(settings){return this.request('room:settings',settings);}
  start(){return this.request('game:start');}
  command(cmd){return this.request('game:command',{command:cmd,revision:this.room.game.revision},cmd.commandId||makeId());}
  async leave(){
    if(this.code && this.ws?.readyState===1) await this.request('room:leave');
    try{localStorage.removeItem(sessionKey(this.code));}catch{}
    this.dispose();
  }
  dispose(){this.code=null;this.room=null;this.token=null;clearTimeout(this.timer);this.timer=0;this.ws?.close();document.removeEventListener('visibilitychange',this.foreground);window.removeEventListener('online',this.foreground);}
}

