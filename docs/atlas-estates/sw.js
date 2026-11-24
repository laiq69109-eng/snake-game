const cacheName='atlas-pages-'+"9267e8eee3e3";
const base=new URL('./',self.location.href);
self.addEventListener('install',e=>e.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(["packages/maps/cn.json","packages/maps/art/cn-board.webp","packages/maps/art/cn-icon.svg","packages/maps/catalog.json","app.js","audio.js","net.js","room-location.js","save-check.js","scores.js","share.js","storage.js","packages/game-core/index.js","packages/game-core/economy.js","packages/protocol/index.js","packages/ai/index.js","packages/maps/validate.js","style.css","avatars.webp","mark.svg","index.html"])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('atlas-pages-')&&k!==cacheName).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!e.request.url.startsWith(base.href))return;
  e.respondWith((async()=>{const cache=await caches.open(cacheName);
    const key=e.request.mode==='navigate'?new URL('index.html',base).href:e.request;
    try{const r=await fetch(e.request);if(r.ok)await cache.put(key,r.clone());return r}
    catch{return await cache.match(key)||Response.error()}
  })());
});