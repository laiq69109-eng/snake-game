import {readFileSync as read,writeFileSync as write} from 'node:fs';
const engine=read('src/engine.js','utf8'),motion=read('src/motion.js','utf8'),client=read('src/client.js','utf8').replace('/* RUNTIME */',read('src/client-runtime.js','utf8')),html=read('src/index.html','utf8');
write('game-worker.js','const ENGINE_SOURCE='+JSON.stringify(engine)+';\nconst MOTION_SOURCE='+JSON.stringify(motion)+';\nconst HTML_SOURCE='+JSON.stringify(html.replace('/* CLIENT */',client))+';\n'+engine.replaceAll('export ','')+'\n'+read('src/server.js','utf8'));
let offlineClient=client.replace(/^import[^\n]*\n/gm,'').replace("const invited=new URLSearchParams(location.search).get('room');","const invited=null;").replace("$('multi-tab').onclick=()=>selectMode('multi');","$('multi-tab').onclick=()=>toast('此文件为离线单机版');");
offlineClient=offlineClient.slice(0,offlineClient.indexOf('// Restore online session'));
const offline=html.replace('<script type="module">/* CLIENT */</script>','<script>(()=>{'+engine.replaceAll('export ','')+'\n'+motion.replaceAll('export ','')+'\n'+offlineClient+'})();</script>').replace('class="logo" href="/"','class="logo" href="#"').replace('id="multi-tab" class="mode-tab"','id="multi-tab" class="mode-tab hidden"').replace('<title>蛇蛇碰头 · 来碰个头</title>','<title>蛇蛇碰头 · 流畅单机版</title>');
write('solo.html',offline);console.log('Built smooth multiplayer and offline solo');
