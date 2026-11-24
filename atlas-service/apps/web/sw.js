const VERSION='atlas-offline-v4';
const CORE=['/','/app.mjs','/style.css','/mark.svg','/storage.mjs','/save-check.mjs','/audio.mjs','/scores.mjs','/avatars.webp','/share.mjs','/net.mjs','/room-location.mjs','/packages/game-core/index.mjs','/packages/ai/index.mjs','/packages/game-core/economy.mjs','/packages/protocol/index.mjs','/packages/maps/cn.json','/packages/maps/art/cn-board.webp','/packages/maps/art/cn-icon.svg','/packages/maps/validate.mjs','/packages/maps/catalog.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('atlas-offline-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/socket.io/'))return;
 event.respondWith((async()=>{const cache=await caches.open(VERSION);
   try{const response=await fetch(request,{cache:'no-cache'});if(response.ok&&(request.mode==='navigate'||/\.(?:mjs|css|svg|webp|json|png|js)$/.test(url.pathname)))await cache.put(request.mode==='navigate'?'/':request,response.clone());return response}
   catch{const stored=await cache.match(request.mode==='navigate'?'/':request);return stored||Response.error()}
 })())
});
