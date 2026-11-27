import {requireRule as check} from '../protocol/index.mjs';

const UINT32_RANGE=0x100000000;
const unavailable='安全随机源暂不可用，本次随机操作未执行。';

export function randomUnavailable(cause){
  return Object.assign(new Error(unavailable,{cause}),{code:'RNG_UNAVAILABLE'});
}

function secureFill(array){
  try{
    return globalThis.crypto.getRandomValues(array);
  }catch(error){
    throw randomUnavailable(error);
  }
}

export function secureRandomBelow(max){
  check(Number.isInteger(max)&&max>0&&max<=UINT32_RANGE,'INVALID_RANDOM_BOUND');
  // Keep only a whole number of buckets. The discarded values never become a result.
  const cutoff=UINT32_RANGE-UINT32_RANGE%max;
  const word=new Uint32Array(1);
  do{secureFill(word)}while(word[0]>=cutoff);
  return word[0]%max;
}

export function randomId(){
  return Array.from(secureFill(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function rollDie(randomBelow=secureRandomBelow){
  const value=randomBelow(6);
  check(Number.isInteger(value)&&value>=0&&value<6,'INVALID_RANDOM_VALUE');
  return value+1;
}
