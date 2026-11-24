const cacheName='atlas-pages-'+"6fe046d6f521";
const base=new URL('./',self.location.href);
self.addEventListener('install',e=>e.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(["packages/maps/cn.json","packages/maps/art/cn-board.webp","packages/maps/art/cn-icon.svg","packages/maps/catalog.json","app.js?v=7b7b65f04cc8","audio.js?v=7b7b65f04cc8","net.js?v=7b7b65f04cc8","room-location.js?v=7b7b65f04cc8","save-check.js?v=7b7b65f04cc8","scores.js?v=7b7b65f04cc8","share.js?v=7b7b65f04cc8","storage.js?v=7b7b65f04cc8","packages/game-core/index.js?v=7b7b65f04cc8","packages/game-core/economy.js?v=7b7b65f04cc8","packages/protocol/index.js?v=7b7b65f04cc8","packages/ai/index.js?v=7b7b65f04cc8","packages/maps/validate.js?v=7b7b65f04cc8","style.css?v=7b7b65f04cc8","avatars.webp","mark.svg","index.html"])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('atlas-pages-')&&k!==cacheName).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!e.request.url.startsWith(base.href))return;
  e.respondWith((async()=>{const cache=await caches.open(cacheName);
    const key=e.request.mode==='navigate'?new URL('index.html',base).href:e.request;
    try{const r=await fetch(e.request,{cache:'no-cache'});if(r.ok)await cache.put(key,r.clone());return r}
    catch{return await cache.match(key)||Response.error()}
  })());
});