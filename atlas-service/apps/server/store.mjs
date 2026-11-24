import { mkdirSync } from 'node:fs';
import path from 'node:path';

const schema = `
CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(code TEXT NOT NULL, revision INTEGER NOT NULL, actor TEXT, command_id TEXT, action TEXT NOT NULL, payload TEXT NOT NULL, time_ms BIGINT NOT NULL, PRIMARY KEY(code,revision), UNIQUE(code,actor,command_id));
`;
export async function openStore() {
  let run, query, close;
  if (process.env.DATABASE_URL) {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const result = await client.query("SELECT pg_try_advisory_lock(8651023) AS acquired");
    if (!result.rows[0].acquired) throw Error('数据库已有运行中的游戏实例');
    await client.query(schema);
    run = (sql, params=[]) => client.query(sql,params);
    query = async (sql,params=[]) => (await run(sql,params)).rows;
    close = () => client.end();
  } else {
    const { DatabaseSync } = await import('node:sqlite');
    const dir = path.resolve(process.env.DATA_DIR || 'var');
    mkdirSync(dir,{recursive:true});
    const db = new DatabaseSync(path.join(dir,'atlas.sqlite'));
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;'+schema);
    const sqlite = s => s.replace(/\$\d+/g,'?');
    run = (sql,params=[]) => db.prepare(sqlite(sql)).run(...params);
    query = (sql,params=[]) => db.prepare(sqlite(sql)).all(...params);
    close = () => db.close();
  }
  async function transaction(fn) {
    await run('BEGIN');
    try { await fn(); await run('COMMIT'); }
    catch(error){ await run('ROLLBACK'); throw error; }
  }
  return {
    close,
    load: async () => (await query('SELECT state FROM rooms')).map(row=>JSON.parse(row.state)),
    seen: async(code,actor,id) => (await query('SELECT 1 FROM events WHERE code=$1 AND actor=$2 AND command_id=$3',[code,actor,id])).length>0,
    async save(room,actor,request,action,payload={}) {
      await transaction(async()=>{
        await run('INSERT INTO rooms(code,state) VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET state=excluded.state',[room.code,JSON.stringify(room)]);
        await run('INSERT INTO events(code,revision,actor,command_id,action,payload,time_ms) VALUES($1,$2,$3,$4,$5,$6,$7)',[room.code,room.revision,actor,request,action,JSON.stringify(payload),Date.now()]);
      });
    },
    async remove(code) {
      await transaction(async()=>{await run('DELETE FROM events WHERE code=$1',[code]);await run('DELETE FROM rooms WHERE code=$1',[code]);});
    }
  };
}
