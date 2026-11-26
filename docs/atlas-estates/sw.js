const cacheName='atlas-pages-'+"249fadecb6dd";
const base=new URL('./',self.location.href);
self.addEventListener('install',e=>e.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(["packages/maps/cn.json","packages/maps/art/cn-board.webp","packages/maps/art/cn-icon.svg","packages/maps/catalog.json","app.js?v=56c198d0e35e","audio.js?v=56c198d0e35e","net.js?v=56c198d0e35e","room-location.js?v=56c198d0e35e","save-check.js?v=56c198d0e35e","scores.js?v=56c198d0e35e","share.js?v=56c198d0e35e","storage.js?v=56c198d0e35e","packages/game-core/index.js?v=56c198d0e35e","packages/game-core/economy.js?v=56c198d0e35e","packages/protocol/index.js?v=56c198d0e35e","packages/ai/index.js?v=56c198d0e35e","packages/maps/validate.js?v=56c198d0e35e","style.css?v=56c198d0e35e","avatars.webp","mark.svg","index.html"])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('atlas-pages-')&&k!==cacheName).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!e.request.url.startsWith(base.href))return;
  e.respondWith((async()=>{const cache=await caches.open(cacheName);
    const key=e.request.mode==='navigate'?new URL('index.html',base).href:e.request;
    try{const r=await fetch(e.request,{cache:'no-cache'});if(r.ok)await cache.put(key,r.clone());return r}
    catch{return await cache.match(key)||Response.error()}
  })());
});