// Original 16-bar miniatures. Chords are MIDI voicings relative to C.
const chords = {
  C: [48,59,64,67,74], Am: [45,55,60,64,71], Dm: [50,60,65,69,76],
  G: [43,53,59,62,69], F: [41,52,57,60,67], Em: [40,50,55,59,66],
  Bb: [46,57,62,65,72], Gs: [43,53,57,60,67]
};
export const tracks = {
  cafe: {name:'街角咖啡馆', bpm:84, beats:4, progression:'C Am Dm G Em Am F G C Em F G Dm Gs G C', pattern:[0,3,5,7], instrument:'keys'},
  river: {name:'沿河慢行', bpm:88, beats:3, progression:'F C Dm Am Bb F Gs G F Am Dm G Em Am G C', pattern:[0,2,3,5], instrument:'strings'},
  night: {name:'星灯晚归', bpm:68, beats:4, progression:'Am F C G Em Am Dm G F Em Dm Am F Gs G C', pattern:[0,3,6], instrument:'bell'}
};
const phrases = [
  [0,2,1], [1,3], [3,2,0], [1], [1,2], [3,1,0], [2,1], [],
  [2,3,1], [0,2], [1,3,2], [0], [2,1], [0,1,3], [2], [0]
];
for (const track of Object.values(tracks)) track.chords=track.progression.split(' ').map(key=>chords[key]);

const frequency = midi => 440 * 2 ** ((midi-69)/12);
const timbres = {
  keys: [1,.32,.19,.045,.035], strings:[1,.44,.14,.105,.035,.02],
  bell:[1,.08,.23,0,.075], bass:[1,.22,.035], chord:[1,.19,.08,.025]
};
const waves = new WeakMap();
function voice(ctx,bus,pitch,when,duration,gain,color){
  let palette=waves.get(ctx);
  if(!palette){palette={};waves.set(ctx,palette)}
  if(!palette[color]){
    const harmonics=Float32Array.from([0,...timbres[color]]);
    palette[color]=ctx.createPeriodicWave(new Float32Array(harmonics.length),harmonics);
  }
  const osc=ctx.createOscillator(),envelope=ctx.createGain();
  osc.setPeriodicWave(palette[color]);osc.frequency.value=frequency(pitch);
  const attack=color==='bass'?.045:color==='bell'?.024:.012;
  const end=when+duration;
  envelope.gain.setValueAtTime(.00001,when);
  envelope.gain.exponentialRampToValueAtTime(gain,when+attack);
  envelope.gain.exponentialRampToValueAtTime(gain*.35,when+duration*.36);
  envelope.gain.exponentialRampToValueAtTime(.00001,end);
  osc.connect(envelope);envelope.connect(bus);osc.start(when);osc.stop(end+.015);
  osc.onended=()=>{osc.disconnect();envelope.disconnect()};
}
export function scheduleStep(ctx,bus,track,motif,step,when){
  const eighth=30/track.bpm,perBar=track.beats*2;
  const bar=Math.floor(step/perBar)%16,slot=step%perBar;
  const chord=track.chords[bar],transpose=((motif[0]-60)%12+18)%12-6;
  const play=(pitch,offset,length,gain,color)=>voice(ctx,bus,pitch+transpose,when+offset*eighth,length*eighth,gain,color);
  if(slot===0)play(chord[0],0,track.beats===3?3.4:3.8,.15,'bass');
  if(slot===4&&track.beats===4&&track!==tracks.night)play(chord[0]+7,0,2.8,.085,'bass');
  const accent=track.pattern.indexOf(slot);
  if(accent>=0){
    if(track===tracks.cafe && (accent===1||accent===3)){
      chord.slice(1,4).forEach((n,i)=>play(n,.04*i,2,.044,'strings'));
    }else{
      const index=(accent+bar%2)%3+1;
      play(chord[index],.035,track===tracks.night?4.2:2.7,.095,'chord');
    }
  }
  const rhythm=perBar===6?[0,2,4]:[0,3,6],phrase=phrases[bar];
  const idx=rhythm.indexOf(slot);
  if(idx>=0 && idx<phrase.length){
    const variation=bar>=8 && motif[bar%motif.length]>motif[0]?1:0;
    const tone=chord[1+(phrase[idx]+variation)%4];
    play(tone+(tone<65?12:0),.06,idx===phrase.length-1?3.8:2.4,.13,track.instrument);
  }
}
export function makeMix(ctx,destination){
  const bus=ctx.createGain(),echo=ctx.createDelay(1),wet=ctx.createGain();
  echo.delayTime.value=.155;wet.gain.value=.12;
  bus.connect(destination);bus.connect(echo);echo.connect(wet);wet.connect(destination);
  return {bus,close(){bus.disconnect();echo.disconnect();wet.disconnect()}};
}