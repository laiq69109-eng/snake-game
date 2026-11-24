import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateMap } from './validate.mjs';

const source = await readFile(new URL('cn.json', import.meta.url), 'utf8');
for (const [name, corrupt] of Object.entries({
  '跳号': m => { m.tiles[5].index = 7; },
  '重复地块 ID': m => { m.tiles[3].id = m.tiles[1].id; },
  '重复起点': m => { m.tiles[3].type = 'start'; },
  '缺失监狱': m => { m.tiles[10].type = 'park'; },
  '缺失入狱格': m => { m.tiles[30].type = 'park'; },
  '错误颜色组': m => { m.tiles[1].group = 'absent'; },
  '负房价': m => { m.tiles[1].houseCost = -30; },
  '小数房价': m => { m.tiles[1].price = 60.25; },
  '租金逆序': m => { m.tiles[1].hotelRent = m.tiles[1].baseRent; },
  '不存在的卡牌目标': m => { m.cards.chance.find(c => c.effect === 'goto').target = 40; },
  '不完整的租金表': m => { delete m.tiles[1].oneHouseRent; },
  '缺失经过起点奖励策略': m => { delete m.cards.chance.find(c => c.effect === 'goto').salary; },
})) {
  test('地图校验拒绝' + name, () => {
    const map = JSON.parse(source);
    corrupt(map);
    assert.throws(() => validateMap(map), /MAP_INVALID/);
  });
}
