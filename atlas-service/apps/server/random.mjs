import {randomInt} from 'node:crypto';
import {randomUnavailable} from '../../packages/game-core/random.mjs';

export function serverRandomBelow(max){
  try{
    return randomInt(max);
  }catch(error){
    throw randomUnavailable(error);
  }
}
