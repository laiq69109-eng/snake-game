import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import game from './game-worker.js';
import {attachRealtime} from './realtime.mjs';
import {gzipSync} from 'node:zlib';

const base=path.dirname(fileURLToPath(import.meta.url));
const dataDir=process.env.DATA_DIR||path.join(base,'data');
mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(path.join(dataDir,'rooms.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY NOT NULL,data TEXT NOT NULL,rev INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS rooms_updated_idx ON rooms(updated);');
const DB={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};},async first(){return db.prepare(sql).get(...args)||null;}};}};
const compressedAssets=new Map();
function allowedOrigins(){return (process.env.CORS_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);}
function corsHeaders(req){const origin=req.headers.origin;return origin&&allowedOrigins().includes(origin)?{'access-control-allow-origin':origin,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'Content-Type','access-control-max-age':'600',vary:'Origin'}:{};}

function requestOrigin(req){
  const scheme=process.env.TRUST_PROXY==='1'&&req.headers['x-forwarded-proto']?.split(',')[0].trim()==='https'?'https':'http';
  const host=process.env.TRUST_PROXY==='1'?(req.headers['x-forwarded-host']?.split(',')[0].trim()||req.headers.host):req.headers.host;
  return process.env.PUBLIC_ORIGIN||scheme+'://'+host;
}
export const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,requestOrigin(req));
    if(req.method==='OPTIONS'&&url.pathname.startsWith('/api/')){const headers=corsHeaders(req);res.writeHead(headers['access-control-allow-origin']?204:403,headers);res.end();return;}
    if(url.pathname==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end('{"ok":true}');return;}
    let body='';for await(const part of req){body+=part.toString('utf8');if(body.length>4096){res.writeHead(413);res.end('Request too large');return;}}
    const headers=new Headers();for(const [k,v] of Object.entries(req.headers)){if(v&&k!=='content-length'&&k!=='host')headers.set(k,Array.isArray(v)?v.join(','):v);}
    const request=new Request(url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body})});
    const response=await game.fetch(request,{DB,ALLOWED_ORIGINS:allowedOrigins()});
    const outHeaders={...Object.fromEntries(response.headers),...corsHeaders(req)};let bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>512&&/\bgzip\b/.test(req.headers['accept-encoding']||'')){
      const staticAsset=!url.pathname.startsWith('/api/');
      if(staticAsset&&compressedAssets.has(url.pathname))bytes=compressedAssets.get(url.pathname);
      else{bytes=gzipSync(bytes,{level:staticAsset?6:3});if(staticAsset&&compressedAssets.size<8)compressedAssets.set(url.pathname,bytes);}
      outHeaders['content-encoding']='gzip';outHeaders.vary=outHeaders.vary?'Origin, Accept-Encoding':'Accept-Encoding';
    }
    res.writeHead(response.status,outHeaders);res.end(bytes);
  }catch{if(!res.headersSent)res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"服务暂时不可用"}');}
});
export const realtime=attachRealtime(server,db,requestOrigin,allowedOrigins);
server.requestTimeout=15000;server.headersTimeout=10000;
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||8788),host=process.env.HOST||'127.0.0.1';
  server.listen(port,host,()=>console.log('Snake Party listening on http://'+host+':'+port));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{realtime.close();server.close(()=>{db.close();process.exit(0);});});
}
