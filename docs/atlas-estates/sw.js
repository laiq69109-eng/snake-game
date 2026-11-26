const cacheName='atlas-pages-'+"fb0d59e478f6";
const base=new URL('./',self.location.href);
self.addEventListener('install',e=>e.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(["packages/maps/cn.json","packages/maps/art/cn-board.webp","packages/maps/art/cn-icon.svg","packages/maps/catalog.json","app.js?v=203f0a2d42db","audio.js?v=203f0a2d42db","net.js?v=203f0a2d42db","room-location.js?v=203f0a2d42db","save-check.js?v=203f0a2d42db","scores.js?v=203f0a2d42db","share.js?v=203f0a2d42db","storage.js?v=203f0a2d42db","packages/game-core/index.js?v=203f0a2d42db","packages/game-core/economy.js?v=203f0a2d42db","packages/protocol/index.js?v=203f0a2d42db","packages/ai/index.js?v=203f0a2d42db","packages/maps/validate.js?v=203f0a2d42db","style.css?v=203f0a2d42db","avatars.webp","mark.svg","index.html"])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('atlas-pages-')&&k!==cacheName).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!e.request.url.startsWith(base.href))return;
  e.respondWith((async()=>{const cache=await caches.open(cacheName);
    const key=e.request.mode==='navigate'?new URL('index.html',base).href:e.request;
    try{const r=await fetch(e.request,{cache:'no-cache'});if(r.ok)await cache.put(key,r.clone());return r}
    catch{return await cache.match(key)||Response.error()}
  })());
});