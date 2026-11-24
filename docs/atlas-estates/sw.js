const cacheName='atlas-pages-'+"255605c0312e";
const base=new URL('./',self.location.href);
self.addEventListener('install',e=>e.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(["packages/maps/cn.json","packages/maps/art/cn-board.webp","packages/maps/art/cn-icon.svg","packages/maps/catalog.json","app.js?v=bb89845d1a9a","audio.js?v=bb89845d1a9a","net.js?v=bb89845d1a9a","room-location.js?v=bb89845d1a9a","save-check.js?v=bb89845d1a9a","scores.js?v=bb89845d1a9a","share.js?v=bb89845d1a9a","storage.js?v=bb89845d1a9a","packages/game-core/index.js?v=bb89845d1a9a","packages/game-core/economy.js?v=bb89845d1a9a","packages/protocol/index.js?v=bb89845d1a9a","packages/ai/index.js?v=bb89845d1a9a","packages/maps/validate.js?v=bb89845d1a9a","style.css?v=bb89845d1a9a","avatars.webp","mark.svg","index.html"])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('atlas-pages-')&&k!==cacheName).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!e.request.url.startsWith(base.href))return;
  e.respondWith((async()=>{const cache=await caches.open(cacheName);
    const key=e.request.mode==='navigate'?new URL('index.html',base).href:e.request;
    try{const r=await fetch(e.request,{cache:'no-cache'});if(r.ok)await cache.put(key,r.clone());return r}
    catch{return await cache.match(key)||Response.error()}
  })());
});