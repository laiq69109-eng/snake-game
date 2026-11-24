import {createHash,randomBytes} from 'node:crypto';

let cache, loading;
async function json(url) {
  const resp=await fetch(url,{signal:AbortSignal.timeout(6000)});
  const data=await resp.json();
  if(!resp.ok||data.errcode) throw Error('WECHAT_'+(data.errcode||resp.status));
  return data;
}
async function ticket() {
  if(cache && Date.now()<cache.validUntil) return cache.ticket;
  if(!loading) loading=(async()=>{
    const params=new URLSearchParams({grant_type:'client_credential',appid:process.env.WECHAT_APP_ID,secret:process.env.WECHAT_APP_SECRET});
    const token=await json('https://api.weixin.qq.com/cgi-bin/token?'+params);
    const info=await json('https://api.weixin.qq.com/cgi-bin/ticket/getticket?'+new URLSearchParams({access_token:token.access_token,type:'jsapi'}));
    if(!info.ticket) throw Error('WECHAT_TICKET');
    cache={ticket:info.ticket,validUntil:Date.now()+Math.max(1,info.expires_in-300)*1000};
    return cache.ticket;
  })().finally(()=>{loading=null});
  return loading;
}
export async function sign(url,origins) {
  if(!process.env.WECHAT_APP_ID||!process.env.WECHAT_APP_SECRET) return {};
  if(url.length>2048 || !origins.has(new URL(url).origin) || url.includes('#')) throw Error('INVALID_SHARE_URL');
  const nonceStr=randomBytes(16).toString('hex'), timestamp=Math.floor(Date.now()/1000);
  const signature=createHash('sha1').update('jsapi_ticket='+await ticket()+'&noncestr='+nonceStr+'&timestamp='+timestamp+'&url='+url).digest('hex');
  return {appId:process.env.WECHAT_APP_ID,nonceStr,timestamp,signature};
}
