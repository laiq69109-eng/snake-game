import test from 'node:test';
import assert from 'node:assert/strict';
import {MotionBuffer} from '../src/motion.js';
import {STEP,createSolo,advance,turn} from '../src/engine.js';

test('rendering interpolates subcell positions at display rate',()=>{
  const room=createSolo('test',0),history=new MotionBuffer(STEP);history.push(room);
  advance(room,room.started+STEP*3,()=>history.push(room));
  const mid=history.sample('me',room.started+STEP*.5);assert.equal(mid.body[0].x,5.5);
  const positions=Array.from({length:30},(_,i)=>history.sample('me',room.started+i*1000/60).body[0].x);
  assert.equal(new Set(positions).size,30);
  for(let i=1;i<positions.length;i++)assert.ok(positions[i]-positions[i-1]<.102);
});
test('rendering never mutates authoritative positions or food',()=>{
  const room=createSolo('test',0),history=new MotionBuffer(STEP);history.push(room);const original=JSON.stringify(room);
  const pose=history.sample('me',room.started+STEP/2);pose.body[0].x=123;
  assert.equal(JSON.stringify(room),original);assert.equal(history.sample('me',room.started).body[0].x,5);
});
test('short snapshot gaps extrapolate at most one cell and new rounds reset history',()=>{
  const room=createSolo('test',0),history=new MotionBuffer(STEP);history.push(room);
  assert.equal(history.sample('me',room.started+10000).body[0].x,6);
  const next=createSolo('test',100000);history.push(next);assert.equal(history.frames.length,1);assert.equal(history.sample('me',next.started).body[0].x,5);
});
test('two rapid valid turns are preserved and reverse inputs rejected',()=>{
  const r=createSolo('test',0),p=r.players[0];assert.equal(turn(p,3),false);assert.equal(turn(p,0),true);assert.equal(turn(p,3),true);assert.equal(turn(p,1),false);
  advance(r,r.started+STEP);assert.equal(p.dir,0);assert.equal(p.next,3);
  advance(r,r.started+STEP*2);assert.equal(p.dir,3);assert.equal(p.body[0].y,5);assert.equal(p.body[0].x,4);
});
