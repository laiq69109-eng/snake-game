const key = 'solo-v1';
let database;
function openDB() {
  if (!database) database = new Promise((resolve,reject) => {
    const req=indexedDB.open('atlas-estates',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('voyages');
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return database;
}
export async function save(game,settings) {
  const db=await openDB();
  const record={version:2,time:Date.now(),game,settings};
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('voyages','readwrite'),store=tx.objectStore('voyages');
    const prev=store.get(key);
    prev.onsuccess=()=>{if(prev.result)store.put(prev.result,'previous');store.put(record,key)};
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
  });
}
export async function read(previous=false) {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const q=db.transaction('voyages').objectStore('voyages').get(previous?'previous':key);
    q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
  });
}
export const pref=(k,fallback)=>{try{return JSON.parse(localStorage.getItem('atlas:'+k))??fallback}catch{return fallback}};
export function setPref(k,v){try{localStorage.setItem('atlas:'+k,JSON.stringify(v))}catch{}}
