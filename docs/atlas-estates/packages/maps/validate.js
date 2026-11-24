const tileCounts = {
  start: 1, land: 22, rail: 4, utility: 2, tax: 2, jail: 1, goJail: 1,
  park: 1, chance: 3, fate: 3,
};
const landMoney = ['houseCost', 'hotelCost', 'baseRent', 'oneHouseRent', 'twoHouseRent', 'hotelRent'];
const allEffects = ['cash', 'pay', 'goto', 'steps', 'rail', 'utility', 'jail', 'pass', 'repair', 'payEach', 'collectEach', 'commission'];
const positive = value => Number.isSafeInteger(value) && value > 0 && value <= 1_000_000;
const string = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Validate the shipping 40-space map schema and cross-references before starting a game. */
export function validateMap(map) {
  function check(condition, message) {
    if (!condition) throw new Error('MAP_INVALID [' + (map?.id ?? '?') + '] ' + message);
  }
  check(object(map), '地图必须是对象');
  for (const key of ['id', 'name', 'description', 'theme', 'art', 'icon', 'difficulty']) {
    check(string(map[key]), '缺少地图字段 ' + key);
  }
  check(/^#[0-9a-f]{6}$/i.test(map.color), '主题颜色无效');
  check(Array.isArray(map.music) && map.music.length > 0 && map.music.every(note =>
    Number.isInteger(note) && note >= 0 && note <= 127), '音高数据无效');
  check(Array.isArray(map.landmarks) && map.landmarks.length > 0 && map.landmarks.every(string), '缺少代表地点');
  check(object(map.groups) && Object.keys(map.groups).length === 8, '必须有八个颜色组');
  const groupSizes = new Map();
  for (const [id, group] of Object.entries(map.groups)) {
    check(object(group) && string(group.name) && string(group.pattern) && /^#[0-9a-f]{6}$/i.test(group.color), '颜色组无效 ' + id);
    groupSizes.set(id, 0);
  }
  check(Array.isArray(map.tiles) && map.tiles.length === 40, '棋盘需要40格');
  const used = new Set();
  const counts = {};
  function register(item) {
    check(object(item) && string(item.id) && string(item.name), '条目缺少 id 或 name');
    check(!used.has(item.id), '重复 ID ' + item.id);
    used.add(item.id);
  }
  for (const [i, tile] of map.tiles.entries()) {
    register(tile);
    check(tile.index === i, '格子索引不连续 ' + i);
    check(Object.hasOwn(tileCounts, tile.type), '未知格子类型 ' + tile.id);
    counts[tile.type] = (counts[tile.type] ?? 0) + 1;
    if (['land', 'utility', 'rail'].includes(tile.type)) check(positive(tile.price), '价格无效 ' + tile.id);
    if (tile.type === 'tax') check(positive(tile.amount), '税额无效 ' + tile.id);
    if (tile.type !== 'land') continue;
    check(groupSizes.has(tile.group), '颜色组不存在 ' + tile.id);
    groupSizes.set(tile.group, groupSizes.get(tile.group) + 1);
    check(landMoney.every(key => positive(tile[key])), '费用或租金无效 ' + tile.id);
    check(tile.baseRent < tile.oneHouseRent && tile.oneHouseRent < tile.twoHouseRent &&
      tile.twoHouseRent < tile.hotelRent, '四档租金必须严格递增 ' + tile.id);
  }
  for (const [type, expected] of Object.entries(tileCounts)) {
    check(counts[type] === expected, '格子数量错误 ' + type);
  }
  check(map.tiles[0].type === 'start', '第0格必须为起点');
  check([...groupSizes.values()].sort().join(',') === '2,2,3,3,3,3,3,3', '颜色组大小无效');
  check(object(map.cards), '缺少牌堆');
  for (const deck of ['chance', 'fate']) {
    check(Array.isArray(map.cards[deck]) && map.cards[deck].length >= 12, '牌堆至少需要12张卡 ' + deck);
    for (const card of map.cards[deck]) {
      register(card);
      check(string(card.text) && allEffects.includes(card.effect), '卡牌文案或效果无效 ' + card.id);
      if (['cash','pay','repair','payEach','collectEach'].includes(card.effect)) {
        check(positive(card.amount), '卡牌金额无效 ' + card.id);
      }
      if (card.effect === 'commission') {
        check(positive(card.fee) && positive(card.reward), '委托路费或稿费无效');
        check(Number.isInteger(card.target) && map.tiles[card.target]?.type === 'land', '委托目的地必须是普通地产');
      }
      if (card.effect === 'steps') check(Number.isInteger(card.amount) && card.amount !== 0 &&
        Math.abs(card.amount) < map.tiles.length, '移动步数无效 ' + card.id);
      if (card.effect === 'repair') check(positive(card.hotelAmount), '旅馆修缮费用无效 ' + card.id);
      if (card.effect === 'goto') check(Number.isInteger(card.target) && card.target >= 0 &&
        card.target < map.tiles.length, '目标格无效 ' + card.id);
      if (['steps','goto','rail','utility'].includes(card.effect)) {
        check(typeof card.salary === 'boolean', '缺少经过起点的奖励配置 ' + card.id);
      }
    }
  }
  return map;
}
