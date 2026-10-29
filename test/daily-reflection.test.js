import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as engine from '../src/engine.js';
import { getHumanView, getObservation } from '../src/observation.js';
import { GameStore } from '../src/store.js';
const ids=['P0','P1','P2','P3'];
function settled(day=1){
  const game=engine.createGame({id:'daily-reflection',randomInt:()=>0});game.current_day=day;
  for(const id of ids)engine.applyAction(game,id,{type:'speech',message:'公开协商'},()=>0,()=>1000);
  engine.applyAction(game,'P0',{type:'start_private_chat'},()=>0,()=>1000);engine.advanceTime(game,()=>31000);
  for(const id of ids)engine.applyAction(game,id,{type:'register',task_id:'A'});
  engine.applyAction(game,'P0',{type:'lock_registration'});return game;
}
const reflection=(day=1)=>({type:'reflect',day,summary:'今天执行A，自己的金币增加了2。',lesson:'仅共同增加金币还不能建立独占第一的优势。',next_plan:'根据下一天可见余额和合作条件，争取最终独自获胜。',source:'model'});

test('each settled day blocks advancement until all three private reflection records exist',()=>{
  const game=settled();
  assert.throws(()=>engine.applyAction(game,'P0',{type:'next_day'}),/反思/);
  assert.equal(game.reflection_round.day,1);
  assert.deepEqual(engine.reflectionActors(game),['P1','P2','P3']);
  engine.applyAction(game,'P1',reflection());engine.applyAction(game,'P2',reflection());
  assert.throws(()=>engine.applyAction(game,'P0',{type:'next_day'}),/反思/);
  engine.applyAction(game,'P3',reflection());
  engine.applyAction(game,'P0',{type:'next_day'},()=>0);
  assert.equal(game.current_day,2);assert.equal(game.phase,'NEGOTIATION');
  assert.equal(game.memories.P1.reflections.length,1);assert.equal(game.reflection_round,null);
});

test('reflection commits once without changing gold, facts, trust, messages or public phase events',()=>{
  const game=settled();const before=structuredClone(game);
  engine.applyAction(game,'P1',reflection());
  assert.throws(()=>engine.applyAction(game,'P1',reflection()),/已.*反思|重复/);
  assert.deepEqual(game.players,before.players);assert.deepEqual(game.messages,before.messages);
  assert.deepEqual(game.phase_events,before.phase_events);
  assert.deepEqual(game.memories.P1.facts,before.memories.P1.facts);assert.deepEqual(game.memories.P1.trust,before.memories.P1.trust);
  assert.deepEqual(game.memories.P1.reflections,[{day:1,summary:reflection().summary,lesson:reflection().lesson,next_plan:reflection().next_plan,source:'model'}]);
});

test('reflection rejects human actors, wrong days/phases and empty or oversized fields',()=>{
  const game=settled();
  assert.throws(()=>engine.applyAction(game,'P0',reflection()),/Agent|角色/);
  assert.throws(()=>engine.applyAction(game,'P1',reflection(2)),/当天|日期/);
  for(const value of ['', 'x'.repeat(601),null])assert.throws(()=>engine.applyAction(game,'P1',{...reflection(),lesson:value}),/反思|文字/);
  const active=engine.createGame({id:'active',randomInt:()=>0});
  assert.throws(()=>engine.applyAction(active,'P1',reflection()),/阶段|结算/);
});

test('reflection text stays in its owners later context while human state exposes safe progress only',()=>{
  const game=settled();engine.applyAction(game,'P1',{...reflection(),summary:'P1_PRIVATE_REFLECTION_SECRET'});
  assert.ok(JSON.stringify(getObservation(game,'P1')).includes('P1_PRIVATE_REFLECTION_SECRET'));
  for(const id of ['P0','P2','P3'])assert.ok(!JSON.stringify(getObservation(game,id)).includes('P1_PRIVATE_REFLECTION_SECRET'));
  const human=getHumanView(game);
  assert.equal(human.reflection_status.agents.P1,'completed');assert.equal(human.reflection_status.complete,false);
  assert.equal(getObservation(game,'P2').reflection_status,undefined);
  engine.applyAction(game,'P2',reflection());engine.applyAction(game,'P3',{...reflection(),source:'fallback',summary:'模型未能生成反思。'});
  assert.equal(getHumanView(game).reflection_status.agents.P3,'fallback');
  assert.equal(getHumanView(game).reflection_status.complete,true);
  engine.applyAction(game,'P0',{type:'next_day'},()=>0);
  assert.ok(JSON.stringify(getObservation(game,'P1').memories.P1).includes('P1_PRIVATE_REFLECTION_SECRET'));
});

test('old settled saves enroll only their current day and preserve existing state',()=>{
  const game=settled(3);delete game.reflection_round;
  for(const memory of Object.values(game.memories))delete memory.reflections;
  const before=structuredClone(game);
  assert.equal(engine.ensureDailyReflection(game),true);assert.equal(engine.ensureDailyReflection(game),false);
  assert.deepEqual(game.players,before.players);assert.deepEqual(game.round_results,before.round_results);
  assert.equal(game.reflection_round.day,3);assert.equal(game.memories.P1.reflections.length,0);
  const active=engine.createGame({id:'not-settled',randomInt:()=>0});
  assert.equal(engine.ensureDailyReflection(active),false);
});

test('the eighth day also reflects once without creating a ninth day',()=>{
  const game=settled(8);assert.equal(game.phase,'FINISHED');
  for(const id of ['P1','P2','P3'])engine.applyAction(game,id,reflection(8));
  assert.equal(getHumanView(game).reflection_status.complete,true);
  assert.throws(()=>engine.applyAction(game,'P0',{type:'next_day'}),/阶段/);
});

test('private reflection completion persists with the save and survives reload',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'island-reflection-record-'));
  try{const game=settled();engine.applyAction(game,'P1',reflection());await new GameStore(dir).save(game);
    const restored=await new GameStore(dir).load(game.id);
    assert.deepEqual(engine.reflectionActors(restored),['P2','P3']);assert.equal(restored.memories.P1.reflections[0].summary,reflection().summary);
  }finally{await rm(dir,{recursive:true,force:true});}
});
