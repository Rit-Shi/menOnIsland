import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGame,applyAction,advanceTime,ensureDailyReflection } from '../src/engine.js';
import { getHumanView,getObservation } from '../src/observation.js';
import { GameStore } from '../src/store.js';
import { createRunner } from '../src/runner.js';
const agents=['P1','P2','P3'];
const action=(day=1,summary='可见结果表明，今天尚未建立领先。')=>({type:'reflect',day,summary,lesson:'合作只有有助于独自获胜时才是合适策略。',next_plan:'重新比较公开余额和可行选择。'});
function settled(){
  const game=createGame({id:'reflect-runner',randomInt:()=>0});
  for(const id of ['P0',...agents])applyAction(game,id,{type:'speech',message:'公开协商'},()=>0,()=>1000);
  applyAction(game,'P0',{type:'start_private_chat'},()=>0,()=>1000);
  applyAction(game,'P1',{type:'private_message',to:'P0',message:'P1_P0_PRIVATE'},()=>0,()=>2000);
  advanceTime(game,()=>31000);
  for(const id of ['P0',...agents])applyAction(game,id,{type:'register',task_id:'A'});
  applyAction(game,'P0',{type:'lock_registration'});return game;
}
async function until(check){for(let i=0;i<300;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,3));}assert.fail('reflection state not reached');}
async function fixture(t,decision,prepare=()=>{}){
  const directory=await mkdtemp(join(tmpdir(),'island-reflection-worker-'));const store=new GameStore(directory);
  const game=settled();prepare(game);await store.save(game);
  const runner=createRunner({store,config:{models:{P1:'one',P2:'two',P3:'three'},timeoutMs:1000},decision});
  t.after(async()=>{runner.close();await runner.idle();await rm(directory,{recursive:true,force:true});});
  return {store,runner,game};
}

test('daily jobs start concurrently, commit independently and use only each owners observation',async t=>{
  let release;const slow=new Promise(resolve=>{release=resolve;});const calls=[];
  const f=await fixture(t,async(_cfg,view,kind)=>{
    assert.equal(kind,'reflect');calls.push(view);
    if(view.viewer_id==='P2')await slow;
    if(view.viewer_id==='P3')throw new Error('offline provider failure');
    return{action:action(view.current_day,view.viewer_id+'_PRIVATE_REVIEW'),fallback:false};
  });
  const pending=f.runner.kick(f.game.id);
  await until(async()=>{const view=getHumanView(await f.store.load(f.game.id));return view.reflection_status.agents.P1==='completed'&&view.reflection_status.agents.P3==='fallback';});
  assert.equal(calls.length,3);
  const mid=await f.store.load(f.game.id);assert.equal(getHumanView(mid).reflection_status.agents.P2,'pending');
  assert.throws(()=>applyAction(mid,'P0',{type:'next_day'}),/反思/);
  assert.ok(calls.find(v=>v.viewer_id==='P1').messages.some(m=>m.text==='P1_P0_PRIVATE'));
  assert.ok(!JSON.stringify(calls.find(v=>v.viewer_id==='P2')).includes('P1_P0_PRIVATE'));
  assert.ok(calls.every(v=>!JSON.stringify(v).includes('P1_PRIVATE_REVIEW')));
  release();await pending;await f.runner.idle();
  const done=await f.store.load(f.game.id);assert.equal(getHumanView(done).reflection_status.complete,true);
  assert.equal(done.memories.P3.reflections[0].source,'fallback');assert.match(done.memories.P3.reflections[0].summary,/未.*生成|未.*成功/);
  await f.runner.kick(f.game.id);assert.equal(calls.length,3);
  assert.ok(!JSON.stringify(getHumanView(done)).includes('PRIVATE_REVIEW'));
  applyAction(done,'P0',{type:'next_day'},()=>0);
  assert.equal(getObservation(done,'P1').memories.P1.reflections[0].summary,'P1_PRIVATE_REVIEW');
});

test('startup resumes missing enrolled records and does not replay completed ones',async t=>{
  const seen=[];
  const f=await fixture(t,async(_cfg,view,kind)=>{seen.push(view.viewer_id);return{action:action(view.current_day),fallback:false};},game=>{applyAction(game,'P1',action());game.thinking=['P1'];});
  await f.runner.resume();await f.runner.idle();assert.deepEqual(seen.sort(),['P2','P3']);
  const restored=await f.store.load(f.game.id);assert.equal(restored.memories.P1.reflections.length,1);assert.deepEqual(restored.thinking,[]);
});

test('startup does not enroll historical saves but explicitly enrolling the selected save starts current-day work',async t=>{
  const seen=[];
  const f=await fixture(t,async(_cfg,view)=>{seen.push(view.current_day);return{action:action(view.current_day),fallback:false};},game=>{delete game.reflection_round;});
  await f.runner.resume();await f.runner.idle();assert.deepEqual(seen,[]);
  await f.store.transact(f.game.id,game=>ensureDailyReflection(game));
  await f.runner.kick(f.game.id);await f.runner.idle();assert.deepEqual(seen,[1,1,1]);
});

test('shutdown discards late reflection results and leaves pending records resumable',async t=>{
  let release;const blocked=new Promise(resolve=>{release=resolve;});let calls=0;
  const f=await fixture(t,async(_cfg,view)=>{calls++;await blocked;return{action:action(view.current_day),fallback:false};});
  const pending=f.runner.kick(f.game.id);await until(()=>calls===3);
  f.runner.close();await pending;await f.runner.idle();release();await new Promise(resolve=>setImmediate(resolve));
  const restored=await f.store.load(f.game.id);assert.equal(getHumanView(restored).reflection_status.complete,false);
  assert.ok(agents.every(id=>restored.memories[id].reflections.length===0));
});

test('a late response for a previous day is discarded rather than stored in a newer day',async t=>{
  let release;const blocked=new Promise(resolve=>{release=resolve;});let calls=0;
  const f=await fixture(t,async(_cfg,view)=>{calls++;await blocked;return{action:action(view.current_day),fallback:false};});
  const pending=f.runner.kick(f.game.id);await until(()=>calls===3);
  await f.store.transact(f.game.id,game=>{game.current_day=2;game.phase='NEGOTIATION';game.reflection_round=null;});
  release();await pending;await f.runner.idle();
  const game=await f.store.load(f.game.id);
  assert.ok(agents.every(id=>game.memories[id].reflections.length===0));assert.equal(game.current_day,2);
});
