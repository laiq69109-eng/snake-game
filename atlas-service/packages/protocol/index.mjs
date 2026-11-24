export const DEFAULT_ROUND_LIMIT = 50;
export const UNLIMITED_ROUNDS = 0;
export const ROUND_LIMITS = Object.freeze([DEFAULT_ROUND_LIMIT, UNLIMITED_ROUNDS]);
export const isRoundLimit = value => ROUND_LIMITS.includes(value);

export function migrateRoundLimit(value) {
  return value === undefined || [20,30,40].includes(value) ? DEFAULT_ROUND_LIMIT : value;
}

const fields = {
  takeFee: [], visitSite: [], roll: [], bail: [], useCard: [], buy: [], decline: [], build: [], skip: [], end: [],
  sell: ['tile'], mortgage: ['tile'], redeem: ['tile'],
  settle: [], bankrupt: [], offer: ['to','give','take'], edit: ['give','take'], confirm: [], cancel: []
};
export function requireRule(test, code, message = code) {
  if (!test) throw Object.assign(new Error(message), {code});
}
const integer = (n,max=1000000000) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const identity = id => typeof id === 'string' && id.length > 0 && id.length <= 128;
function side(s) {
  return s && Object.keys(s).length === 3 && integer(s.cash) && integer(s.cards,24) &&
    Array.isArray(s.tiles) && s.tiles.length <= 40 && s.tiles.every(i=>integer(i,39)) &&
    new Set(s.tiles).size === s.tiles.length;
}
export function validateCommand(c) {
  requireRule(c && Object.hasOwn(fields,c.type) && identity(c.playerId),'INVALID_COMMAND');
  const keys = fields[c.type];
  requireRule(Object.keys(c).every(k=>['type','playerId','commandId',...keys].includes(k)) &&
    keys.every(k=>Object.hasOwn(c,k)), 'INVALID_PAYLOAD');
  if ('commandId' in c) requireRule(identity(c.commandId),'INVALID_ID');
  if ('tile' in c) requireRule(integer(c.tile,39),'INVALID_TILE');
  if ('give' in c) requireRule(side(c.give) && side(c.take),'INVALID_TERMS');
  if ('to' in c) requireRule(identity(c.to),'INVALID_PARTNER');
  return c;
}