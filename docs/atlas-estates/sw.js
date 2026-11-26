const cacheName='atlas-pages-'+"f985e152fcdb";
const base=new URL('./',self.location.href);
self.addEventListener('install',e=>e.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(["packages/maps/cn.json","packages/maps/art/cn-board.webp","packages/maps/art/cn-icon.svg","packages/maps/catalog.json","app.js?v=30617823abbb","audio.js?v=30617823abbb","net.js?v=30617823abbb","room-location.js?v=30617823abbb","save-check.js?v=30617823abbb","scores.js?v=30617823abbb","share.js?v=30617823abbb","storage.js?v=30617823abbb","packages/game-core/index.js?v=30617823abbb","packages/game-core/economy.js?v=30617823abbb","packages/protocol/index.js?v=30617823abbb","packages/ai/index.js?v=30617823abbb","packages/maps/validate.js?v=30617823abbb","style.css?v=30617823abbb","avatars.webp","mark.svg","index.html"])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('atlas-pages-')&&k!==cacheName).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!e.request.url.startsWith(base.href))return;
  e.respondWith((async()=>{const cache=await caches.open(cacheName);
    const key=e.request.mode==='navigate'?new URL('index.html',base).href:e.request;
    try{const r=await fetch(e.request,{cache:'no-cache'});if(r.ok)await cache.put(key,r.clone());return r}
    catch{return await cache.match(key)||Response.error()}
  })());
});