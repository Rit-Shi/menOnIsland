import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGame, applyAction, advanceTime } from '../src/engine.js';
import { getHumanView, getObservation } from '../src/observation.js';
import { GameStore } from '../src/store.js';
import { createRunner } from '../src/runner.js';
const ids=['P0','P1','P2','P3'];
const fixed=()=>0;
function ready(){
  const game=createGame({id:'phase-flow',randomInt:fixed});
  for(const id of ids)applyAction(game,id,{type:'speech',message:'公开发言'},fixed,()=>1000);
  return game;
}
function register(game,choices){
  applyAction(game,'P0',{type:'start_private_chat'},fixed,()=>5000);
  advanceTime(game,()=>35000);
  choices.forEach((task_id,i)=>applyAction(game,ids[i],{type:'register',task_id}));
  applyAction(game,'P0',{type:'lock_registration'});
}

test('completed public round waits indefinitely until P0 explicitly starts a fresh private window',()=>{
  const game=ready();
  assert.equal(game.phase,'PRIVATE_CHAT_READY');
  assert.equal(game.private_chat,null);
  assert.equal(advanceTime(game,()=>999999),false);
  assert.throws(()=>applyAction(game,'P1',{type:'start_private_chat'},fixed,()=>6000),/玩家|P0/);
  assert.throws(()=>applyAction(game,'P0',{type:'private_message',to:'P1',message:'提前发送'},fixed,()=>6000),/私聊/);
  applyAction(game,'P0',{type:'start_private_chat'},fixed,()=>900000);
  assert.equal(game.phase,'PRIVATE_CHAT');
  assert.equal(game.private_chat.started_at,900000);
  assert.equal(game.private_chat.ends_at,930000);
  assert.throws(()=>applyAction(game,'P0',{type:'start_private_chat'},fixed,()=>910000),/阶段|开启/);
  assert.equal(game.private_chat.ends_at,930000);
  assert.equal(advanceTime(game,()=>929999),false);
  assert.equal(advanceTime(game,()=>930000),true);
});

test('public phase history records rapid transitions in order without exposing hidden actions',()=>{
  const game=ready();
  register(game,['A','A','A','A']);
  assert.deepEqual(game.phase_events.map(e=>[e.from,e.to]),[
    ['NEGOTIATION','PRIVATE_CHAT_READY'],['PRIVATE_CHAT_READY','PRIVATE_CHAT'],
    ['PRIVATE_CHAT','REGISTRATION'],['REGISTRATION','INVESTMENT_SUBMISSION'],['INVESTMENT_SUBMISSION','ROUND_UPDATE'],
  ]);
  assert.equal(new Set(game.phase_events.map(e=>e.id)).size,5);
  assert.ok(game.phase_events.every(e=>e.day===1));
  assert.deepEqual(getHumanView(game).phase_events,game.phase_events);
  assert.equal(getObservation(game,'P1').phase_events,undefined);
  applyAction(game,'P0',{type:'next_day'},fixed);
  assert.equal(game.phase_events.at(-1).day,2);
  assert.equal(game.phase_events.at(-1).to,'NEGOTIATION');
});

test('private traffic and incomplete secret submissions do not add public phase events',()=>{
  const game=ready();
  applyAction(game,'P0',{type:'start_private_chat'},fixed,()=>5000);
  const before=structuredClone(getHumanView(game).phase_events);
  applyAction(game,'P1',{type:'private_message',to:'P2',message:'隐藏内容'},fixed,()=>6000);
  assert.deepEqual(getHumanView(game).phase_events,before);
  advanceTime(game,()=>35000);
  const registrationEvents=structuredClone(game.phase_events);
  applyAction(game,'P1',{type:'register',task_id:'C'});
  assert.deepEqual(game.phase_events,registrationEvents);
  const investing=ready();register(investing,['B','B','A','A']);
  const investmentEvents=structuredClone(investing.phase_events);
  applyAction(investing,'P1',{type:'invest',amount:7});
  assert.deepEqual(investing.phase_events,investmentEvents);
  investing.phase_events.at(-1).secret_investment=7;
  assert.ok(getHumanView(investing).phase_events.every(e=>!Object.hasOwn(e,'secret_investment')));
});

test('multi-round elimination transitions retain the public task and round',()=>{
  const game=ready();register(game,['B','B','B','B']);
  for(const id of ids)applyAction(game,id,{type:'speech',message:'淘汰发言'});
  ['P3','P3','P3','P2'].forEach((target_id,i)=>applyAction(game,ids[i],{type:'vote',target_id},fixed));
  const event=game.phase_events.at(-1);
  assert.equal(event.from,'VOTE_SUBMISSION');
  assert.equal(event.to,'VOTE_SPEECH');
  assert.equal(event.task_id,'B');
  assert.equal(event.vote_round,1);
  assert.equal(event.next_vote_round,2);
});

test('waiting saves survive scheduler restart without calls, while active saves retain their deadline',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'island-phase-flow-'));
  const store=new GameStore(directory);await store.save(ready());
  let calls=0;
  const options={store,config:{models:{P1:'one',P2:'two',P3:'three'}},now:()=>5000,decision:async()=>{calls++;return{action:{type:'private_pass'},fallback:false};}};
  const first=createRunner(options);
  t.after(async()=>{first.close();await first.idle();await rm(directory,{recursive:true,force:true});});
  await first.resume();await first.kick('phase-flow');await first.idle();
  assert.equal(calls,0);
  const reloaded=await new GameStore(directory).load('phase-flow');
  assert.equal(reloaded.phase,'PRIVATE_CHAT_READY');assert.equal(reloaded.private_chat,null);
  await store.transact('phase-flow',game=>applyAction(game,'P0',{type:'start_private_chat'},fixed,()=>5000));
  await first.kick('phase-flow');await first.idle();
  assert.equal(calls,3);
  first.close();
  const second=createRunner({...options,now:()=>10000});
  try {await second.resume();await second.idle();assert.equal((await store.load('phase-flow')).private_chat.ends_at,35000);assert.equal(calls,3);}
  finally {second.close();await second.idle();}
});
