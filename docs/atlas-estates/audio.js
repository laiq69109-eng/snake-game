import {tracks,scheduleStep,makeMix} from './scores.js?v=0501d660236e';
export {tracks} from './scores.js?v=0501d660236e';
const defaultMotif=[60,64,67,71];
let context, timer, mix, master, step=0, next=0;
let music=false,effects=true,track=tracks.cafe,volume=.45,motif=defaultMotif;

function pump(){
  if(!context || !mix || context.state!=='running' || document.hidden)return;
  const now=context.currentTime;
  if(next<now)next=now+.025;
  while(next<now+.18){
    scheduleStep(context,mix.bus,track,motif,step++,next);
    next+=30/track.bpm;
  }
}
function stopMusic(){
  clearInterval(timer);timer=undefined;
  if(!mix)return;
  const old=mix,node=master,now=context.currentTime;
  mix=undefined;master=undefined;
  node.gain.cancelScheduledValues(now);node.gain.setTargetAtTime(.00001,now,.025);
  setTimeout(()=>{old.close();node.disconnect()},150);
}
function startMusic(){
  if(timer||!music||!context||document.hidden||context.state!=='running')return;
  master=context.createGain();master.gain.value=volume;master.connect(context.destination);
  mix=makeMix(context,master);next=context.currentTime+.035;
  pump();timer=setInterval(pump,90);
}
export function unlock(){
  try{
    if(!context){
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return;
      context=new Audio();context.onstatechange=startMusic;
    }
    if(!document.hidden && context.state!=='running')context.resume().then(startMusic).catch(()=>{});
    else startMusic();
  }catch{}
}
export function sound(){
  if(!effects||!context||document.hidden||context.state!=='running')return;
  const osc=context.createOscillator(),gain=context.createGain(),now=context.currentTime;
  osc.frequency.value=740;gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(.04,now+.009);gain.gain.exponentialRampToValueAtTime(.0001,now+.12);
  osc.connect(gain);gain.connect(context.destination);osc.start(now);osc.stop(now+.13);
  osc.onended=()=>{osc.disconnect();gain.disconnect()};
}
export function configure(enabled,sfx,notes,choice='cafe',level=.45){
  const selected=tracks[choice]||tracks.cafe;
  const phrase=Array.isArray(notes)&&notes.length?notes:defaultMotif;
  const changed=track!==selected||phrase.join()!==motif.join();
  if(changed){stopMusic();step=0}
  track=selected;motif=phrase;music=!!enabled;effects=!!sfx;
  volume=Number.isFinite(level)?Math.max(0,Math.min(1,level)):.45;
  if(master)master.gain.setTargetAtTime(volume,context.currentTime,.035);
  if(music)startMusic();else stopMusic();
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){stopMusic();context?.suspend().catch(()=>{})}
  else if(context)context.resume().then(startMusic).catch(()=>{});
});