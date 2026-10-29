import test from 'node:test';
import assert from 'node:assert/strict';
import { noticeEvents, phaseNotice, createPhaseNotices } from '../public/phase-notice.js';
const event=(id,from,to,detail={})=>({id,day:1,from,to,...detail});
const first=event('one','NEGOTIATION','PRIVATE_CHAT_READY');
const second=event('two','PRIVATE_CHAT_READY','PRIVATE_CHAT');
const third=event('three','PRIVATE_CHAT','REGISTRATION');
const state=events=>({id:'game',phase_events:events});

test('notice cursor skips initial/reloaded history and unchanged polling but includes unseen events in order',()=>{
  assert.deepEqual(noticeEvents(null,state([first,second])),[]);
  assert.deepEqual(noticeEvents(state([first]),state([first])),[]);
  assert.deepEqual(noticeEvents(state([first]),state([first,second,third])).map(n=>n.id),['two','three']);
  assert.deepEqual(noticeEvents(state([first]),{id:'other',phase_events:[second]}),[]);
  assert.deepEqual(noticeEvents(state([first]),state([first,second,second])).map(n=>n.id),['two']);
});

test('rapid all-A completion, fresh vote rounds and next-day copy remain distinct and public',()=>{
  const rapid=noticeEvents(state([]),state([event('r','REGISTRATION','INVESTMENT_SUBMISSION'),event('s','INVESTMENT_SUBMISSION','ROUND_UPDATE')]));
  assert.deepEqual(rapid.map(n=>n.title),['报名已公布','今日行动完成']);
  const vote=phaseNotice(event('v','VOTE_SUBMISSION','VOTE_SPEECH',{task_id:'B',vote_round:1,next_vote_round:2,hidden_votes:{P1:'P3'}}));
  assert.match(vote.title,/第 1 轮/);assert.match(vote.detail,/第 2 轮/);
  assert.ok(!JSON.stringify(vote).includes('P3'));
  const next=phaseNotice(event('n','ROUND_UPDATE','NEGOTIATION',{day:2}));
  assert.match(next.detail,/第 2 天/);
  assert.equal(phaseNotice(event('bad','SECRET_UNKNOWN','PRIVATE_CHAT')),null);
});

test('real notice queue displays each unseen phase once, in order, and resets timers for a new game',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const shown=[];let hides=0;
  const presenter=createPhaseNotices({show:n=>shown.push(n.title),hide:()=>{hides++;}});
  const notices=[first,second,third].map(phaseNotice);
  presenter.enqueue(notices);presenter.enqueue(notices);
  assert.deepEqual(shown,['公共协商结束']);
  t.mock.timers.tick(1700);assert.equal(hides,1);
  t.mock.timers.tick(100);assert.deepEqual(shown,['公共协商结束','私聊已开启']);
  presenter.reset();t.mock.timers.tick(5000);
  assert.deepEqual(shown,['公共协商结束','私聊已开启']);
  presenter.enqueue([phaseNotice(first)]);assert.equal(shown.at(-1),'公共协商结束');
  presenter.reset();
});
