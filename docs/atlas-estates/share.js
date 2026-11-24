import {roomOrigin} from './room-location.js?v=7b7b65f04cc8';
const once=new Map();
export async function configureShare(link,title='环球置业之旅'){
 if(!/MicroMessenger/i.test(navigator.userAgent))return;
 const page=location.href.split('#')[0];
 try{
   if(!once.has(page))once.set(page,(async()=>{
    const res=await fetch(roomOrigin+'/api/wechat/sign?url='+encodeURIComponent(page));
    if(!res.ok)return false;
    const cfg=await res.json();if(!cfg.appId)return false;
    if(!window.wx)await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://res.wx.qq.com/open/js/jweixin-1.6.0.js';s.onload=ok;s.onerror=no;document.head.append(s)});
    return await new Promise((ok,no)=>{wx.ready(()=>ok(true));wx.error(no);wx.config({...cfg,debug:false,jsApiList:['updateAppMessageShareData','updateTimelineShareData']})});
   })());
   if(await once.get(page)){const data={title,desc:'加入我的地产棋局，一起出发。',link,imgUrl:roomOrigin+'/share-icon.png'};wx.updateAppMessageShareData(data);wx.updateTimelineShareData(data)}
 }catch(err){console.info('微信分享配置未就绪',err?.errMsg||err?.message)}
}
export async function copy(text){
 if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);return}catch{}}
 const input=document.createElement('textarea');input.value=text;input.style.cssText='position:fixed;left:0;top:0;opacity:.01';document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();if(!ok)throw Error('请长按房间链接复制');
}
