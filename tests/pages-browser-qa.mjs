import {chromium} from 'playwright-core';
import {mkdtempSync,readFileSync} from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'snake-pages-'));delete process.env.PUBLIC_ORIGIN;
const {server,realtime}=await import('../app.mjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));
const backend='http://127.0.0.1:'+server.address().port;
const html=readFileSync('docs/index.html','utf8').replaceAll('https://snake-game-laiq69109.onrender.com',backend);
const frontend=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end(html);});await new Promise(r=>frontend.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+frontend.address().port,url=origin+'/snake-game/';process.env.CORS_ORIGINS=origin;
const errors=[],browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
async function page(){const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:['clipboard-read','clipboard-write']});const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);return p;}
try{
  const a=await page();let calls=0;a.on('request',req=>{if(req.url().startsWith(backend))calls++;});await a.locator('#solo').click();await a.waitForTimeout(3400);assert.ok((await a.evaluate(()=>window.__snakeStats().head.x))>5);assert.equal(calls,0,'Solo must work without contacting the API');await a.locator('#exit').click();
  const players=[a,await page(),await page()];await a.locator('#multi-tab').click();await a.locator('#create').click();await a.waitForFunction(()=>document.querySelector('#room-code').textContent.length===6);const code=await a.locator('#room-code').textContent();
  for(const p of players.slice(1)){await p.locator('#multi-tab').click();await p.locator('#code').fill(code);await p.locator('#join').click();}
  await a.waitForFunction(()=>document.querySelector('#start').textContent.includes('3 人开局'));await a.bringToFront();await a.locator('#invite').click();const invite=await a.evaluate(()=>navigator.clipboard.readText());assert.equal(invite,url+'?room='+code);
  await a.locator('#start').click();await Promise.all(players.map(p=>p.waitForFunction(()=>window.__snakeStats().transport==='websocket')));await a.waitForTimeout(3400);const stats=await Promise.all(players.map(p=>p.evaluate(()=>window.__snakeStats())));assert.ok(stats.every(s=>s.head));assert.deepEqual(errors,[]);console.log(JSON.stringify({staticFrontend:true,soloWithoutBackend:true,threePlayerCrossOrigin:true,correctInvitePath:true,errors}));
}finally{await browser.close();realtime.close();await new Promise(r=>server.close(r));await new Promise(r=>frontend.close(r));}
