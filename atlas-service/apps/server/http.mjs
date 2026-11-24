import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sign} from './wechat.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.mp3':'audio/mpeg'};
export function createHttp(rooms,port) {
  const origins=new Set((process.env.PUBLIC_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean));
  if(process.env.RENDER_EXTERNAL_URL)origins.add(new URL(process.env.RENDER_EXTERNAL_URL).origin);
  const counters=new Map();
  const reset=setInterval(()=>counters.clear(),60000); reset.unref();
  function allowed(req) {
    return !req.headers.origin || origins.has(req.headers.origin);
  }
  function rate(req,bucket,limit) {
    const forwarded=String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();
    const peer=process.env.TRUST_CADDY==='1'&&forwarded?forwarded:req.socket.remoteAddress;
    const key=bucket+':'+peer;
    const n=(counters.get(key)||0)+1; counters.set(key,n);
    return n<=limit;
  }
  const server=createServer({headersTimeout:10000,requestTimeout:15000},async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://res.wx.qq.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' wss: ws: https://*.qq.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control','no-store');
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
    if(!allowed(req)){res.writeHead(403);return res.end();}
    if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
    if(!rate(req,'http',1200)){res.writeHead(429);return res.end();}
    try {
      const url=new URL(req.url,'http://atlas.local');
      const p=decodeURIComponent(url.pathname);
      const sendJson=v=>{res.setHeader('Content-Type',mime['.json']);res.end(JSON.stringify(v));};
      if(p==='/healthz') return sendJson({ok:true,rooms:rooms.size});
      if(p==='/api/wechat/sign'){
        if(!rate(req,'sign',60)){res.writeHead(429);return res.end();}
        try { return sendJson(await sign(url.searchParams.get('url')||'',origins)); } catch(err) { console.warn('wechat',err.message);res.statusCode=503; return sendJson({}); }
      }
      if(p.includes('\\')||p.includes('\0')||p.split('/').some(seg=>seg.startsWith('.'))) {res.writeHead(404);return res.end();}
      const shared=p.startsWith('/packages/');
      const base=path.join(root,shared?'packages':'apps/web');
      const rel=p==='/'||/^\/room\/[A-Z0-9]{6}\/?$/i.test(p)?'index.html':p.slice(shared?10:1);
      const file=path.resolve(base,rel);
      if(!file.startsWith(base+path.sep)||!mime[path.extname(file)]||!(await stat(file)).isFile()){res.writeHead(404);return res.end();}
      res.setHeader('Content-Type',mime[path.extname(file)]);
      res.setHeader('Cache-Control',path.extname(file)==='.svg'?'public, max-age=3600':'no-cache');
      res.end(req.method==='HEAD'?undefined:await readFile(file));
    } catch {res.writeHead(404);res.end();}
  });
  server.on('close',()=>clearInterval(reset));
  if(!origins.size)server.once('listening',()=>{
    const actual=server.address().port;
    origins.add('http://localhost:'+actual);
    origins.add('http://127.0.0.1:'+actual);
  });
  return {server,allowed,rate};
}
