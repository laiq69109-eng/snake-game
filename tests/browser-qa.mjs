import {chromium} from 'playwright-core';
import {mkdtempSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'snake-browser-'));delete process.env.PUBLIC_ORIGIN;
const {server,realtime}=await import('../app.mjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=process.env.SNAKE_QA_ORIGIN||'http://127.0.0.1:'+server.address().port,errors=[],report={origin};
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--no-first-run']});
async function page(){const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin);return p;}
async function sample(p,frames=90){return p.evaluate(n=>new Promise(resolve=>{const values=[],times=[];function step(t){times.push(t);values.push(window.__snakeStats());if(times.length===n)resolve({fps:Math.round((n-1)*1000/(times.at(-1)-times[0])),unique:new Set(values.map(v=>v.head?Number(v.head.x).toFixed(4)+','+Number(v.head.y).toFixed(4):'none')).size,renderMs:values.at(-1).renderMs,transport:values.at(-1).transport,rtt:values.at(-1).rtt,serverAge:values.at(-1).serverAge,head:values.at(-1).head});else requestAnimationFrame(step);}requestAnimationFrame(step);}),frames);}
try{
  const p=await page();await p.locator('#solo').click();await p.waitForTimeout(3400);report.solo=await sample(p,60);assert.ok(report.solo.unique>40,'Solo must animate between grid steps');
  await p.keyboard.press('ArrowUp');await p.waitForTimeout(300);assert.ok((await p.evaluate(()=>window.__snakeStats().head.y))<6);
  await p.locator('#pause').click();const before=await p.evaluate(()=>window.__snakeStats().head);await p.waitForTimeout(250);assert.deepEqual(await p.evaluate(()=>window.__snakeStats().head),before);
  await p.screenshot({path:'qa-mobile.png',fullPage:true});await p.locator('#exit').click();
  const players=[p,await page(),await page()];await p.locator('#multi-tab').click();await p.locator('#create').click();await p.waitForFunction(()=>document.querySelector('#room-code').textContent.length===6);const code=await p.locator('#room-code').textContent();
  for(const q of players.slice(1)){await q.locator('#multi-tab').click();await q.locator('#code').fill(code);await q.locator('#join').click();}
  await p.waitForFunction(()=>document.querySelector('#start').textContent.includes('3 人开局'));await p.locator('#start').click();
  await Promise.all(players.map(q=>q.waitForFunction(()=>window.__snakeStats().transport==='websocket')));await p.waitForTimeout(3400);
  report.multiplayer=await Promise.all(players.map(q=>sample(q,60)));console.log('Network render samples',JSON.stringify(report));for(const result of report.multiplayer)assert.ok(result.unique>35,'Remote mode must animate at display rate');
  await p.keyboard.press('ArrowUp');await p.waitForTimeout(250);assert.ok((await p.evaluate(()=>window.__snakeStats().head.y))<6);
  report.errors=errors;assert.deepEqual(errors,[]);console.log(JSON.stringify(report,null,2));writeFileSync('qa-performance.json',JSON.stringify(report,null,2));
}finally{await browser.close();realtime.close();await new Promise(r=>server.close(r));}
