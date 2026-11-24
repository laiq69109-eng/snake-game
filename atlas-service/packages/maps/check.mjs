import { readFile, access } from 'node:fs/promises';
import { validateMap } from './validate.mjs';

async function read(name) {
  return JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
}

const catalog = await read('./catalog.json');
const ids = new Set();
for (const entry of catalog) {
  if (ids.has(entry.id)) throw new Error('重复地图 ' + entry.id);
  ids.add(entry.id);
  const map = validateMap(await read('./' + entry.id + '.json'));
  for (const field of ['art', 'icon']) {
    await access(new URL('./art/' + map[field].split('/').pop(), import.meta.url));
  }
  console.log(map.name, map.tiles.length + ' 格', map.cards.chance.length + map.cards.fate.length + ' 张卡');
}
if (ids.size !== 8) throw new Error('首发地图应为8张');
