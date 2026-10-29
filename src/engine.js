import { randomInt as secureRandomInt } from 'node:crypto';

export const IDS = ['P0', 'P1', 'P2', 'P3'];
export const TASKS = {
  A: { id: 'A', name: '收集淡水', required_members: null, threshold: 0, multiplier: 0, fixed_reward: 2 },
  B: { id: 'B', name: '搭建庇护所', required_members: 2, threshold: 10, multiplier: 1.5, fixed_reward: 0 },
  C: { id: 'C', name: '修复通讯塔', required_members: 3, threshold: 30, multiplier: 2, fixed_reward: 0 },
};
export class RuleError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}
function requireRule(condition, message) { if (!condition) throw new RuleError(message); }
export const player = (game, id) => game.players.find(p => p.id === id);
const owns = (obj, key) => Object.hasOwn(obj, key);
export function currentSpeaker(game) {
  if (game.phase === 'NEGOTIATION') return game.negotiation_order[game.negotiation_turn_index] ?? null;
  if (game.phase === 'VOTE_SPEECH') return game.vote_session.candidate_ids[game.vote_session.speech_index] ?? null;
  return null;
}
export function createGame({ id, randomInt = secureRandomInt } = {}) {
  const names = ['玩家', '林舟', '沈默', '顾寒'];
  const personalities = ['Human', '温和的合作型，组织公平出资、珍惜信誉，也会在风险过高时选择 A。', '谨慎的计算型，比较收益、成功概率和最终名次，避免独自承担成本。', '机会主义型，在有利时合作，争取较低投入和较高名次，可以提出不兑现的承诺。'];
  const game = {
    id, version: 0, current_day: 1, max_days: 8, phase: 'NEGOTIATION',
    created_at: new Date().toISOString(),
    players: IDS.map((id, i) => ({ id, name: names[i], is_human: i === 0, gold_units: 120, personality: personalities[i], statistics: { success: 0, failure: 0, eliminated: 0 } })),
    messages: [], promises: [], vote_results: [], round_results: [], ranking: [],
    memories: Object.fromEntries(IDS.map(id => [id, { facts: [], trust: Object.fromEntries(IDS.filter(other => other !== id).map(other => [other, 0])) }])),
    diagnostics: [], thinking: [],
  };
  startDay(game, randomInt);
  return game;
}
function startDay(game, randomInt) {
  const start = randomInt(4);
  game.negotiation_order = IDS.map((_, i) => IDS[(start + i) % 4]);
  game.negotiation_turn_index = 0;
  game.registrations = {};
  game.registration_status = {};
  game.registration_revision = 0;
  game.registration_reviews = 0;
  game.agent_registration_revision = {};
  game.active_teams = {};
  game.investments = {};
  game.vote_session = null;
  game.vote_queue = [];
  game.phase = 'NEGOTIATION';
  game.day_start_balances = Object.fromEntries(game.players.map(p => [p.id, p.gold_units]));
  addMessage(game, 'SYSTEM', `第 ${game.current_day} 天开始。公共协商从${player(game, game.negotiation_order[0]).name}开始，依次发言。`);
}
export function addMessage(game, from, text, to = null, kind = 'chat') {
  const message = { id: `${game.id}-${game.messages.length + 1}`, day: game.current_day, from, to, text, kind, at: new Date().toISOString() };
  game.messages.push(message);
  return message;
}
function validateMessage(value, allowBlank = false) {
  requireRule(typeof value === 'string' && (allowBlank || value.trim().length > 0) && value.length <= 1000, '消息必须为 1–1000 字的文字');
  return value.trim();
}
function startVote(game, taskId, candidates, round = 1) {
  game.vote_session = { task_id: taskId, candidate_ids: [...candidates], vote_round: round, speech_index: 0, votes: {} };
  game.phase = 'VOTE_SPEECH';
  addMessage(game, 'SYSTEM', `${TASKS[taskId].name}超员，开始第 ${round} 轮淘汰。候选人重新发言后秘密投票。`);
}
function beginTeamPhase(game) {
  if (game.vote_queue.length) {
    const taskId = game.vote_queue.shift();
    startVote(game, taskId, IDS.filter(id => game.registrations[id] === taskId));
  } else {
    game.vote_session = null;
    game.phase = 'INVESTMENT_SUBMISSION';
    if (!Object.keys(game.active_teams).length) settleRound(game);
  }
}
function resolveVote(game, randomInt) {
  const session = game.vote_session;
  const counts = Object.fromEntries(session.candidate_ids.map(id => [id, 0]));
  for (const target of Object.values(session.votes)) counts[target]++;
  const maximum = Math.max(...Object.values(counts));
  const tied = session.candidate_ids.filter(id => counts[id] === maximum);
  const eliminated = tied.length > 1 ? tied[randomInt(tied.length)] : tied[0];
  game.vote_results.push({ day: game.current_day, task_id: session.task_id, vote_round: session.vote_round, votes: { ...session.votes }, counts, tied_ids: tied.length > 1 ? tied : [], eliminated_id: eliminated });
  game.registration_status[eliminated] = 'eliminated';
  player(game, eliminated).statistics.eliminated++;
  addMessage(game, 'SYSTEM', `${player(game, eliminated).name}被淘汰${tied.length > 1 ? '（最高票平票，随机抽签）' : ''}，本日无任务收入。`, null, 'vote_result');
  const remaining = session.candidate_ids.filter(id => id !== eliminated);
  if (remaining.length > TASKS[session.task_id].required_members) {
    startVote(game, session.task_id, remaining, session.vote_round + 1);
  } else {
    game.active_teams[session.task_id] = remaining;
    remaining.forEach(id => { game.registration_status[id] = 'confirmed'; });
    beginTeamPhase(game);
  }
}
export function applyAction(game, actorId, action, randomInt = secureRandomInt) {
  requireRule(IDS.includes(actorId), '未知角色');
  requireRule(action && typeof action === 'object', '行动格式错误');
  switch (action.type) {
    case 'private_message': {
      requireRule(game.phase !== 'FINISHED', '游戏已结束，当前阶段不能私聊');
      requireRule(IDS.includes(action.to) && action.to !== actorId, '私聊对象必须是其他角色');
      const message = validateMessage(action.message);
      addMessage(game, actorId, message, action.to);
      break;
    }
    case 'speech': {
      requireRule(['NEGOTIATION', 'VOTE_SPEECH'].includes(game.phase), '当前阶段不能发言');
      requireRule(currentSpeaker(game) === actorId, '尚未轮到该角色发言');
      const message = validateMessage(action.message);
      if (action.promise != null) {
        requireRule(['B', 'C'].includes(action.promise.task_id) && Number.isSafeInteger(action.promise.amount) && action.promise.amount >= 0 && action.promise.amount <= Math.floor(player(game, actorId).gold_units / 12), '承诺必须是余额内的非负整数');
      }
      addMessage(game, actorId, message, null, game.phase === 'VOTE_SPEECH' ? 'vote_speech' : 'negotiation');
      if (action.promise) game.promises.push({ day: game.current_day, actor_id: actorId, task_id: action.promise.task_id, amount: action.promise.amount, message_id: game.messages.at(-1).id });
      if (game.phase === 'NEGOTIATION') {
        game.negotiation_turn_index++;
        if (game.negotiation_turn_index === 4) game.phase = 'REGISTRATION';
      } else {
        game.vote_session.speech_index++;
        if (game.vote_session.speech_index === game.vote_session.candidate_ids.length) game.phase = 'VOTE_SUBMISSION';
      }
      break;
    }
    case 'register': {
      requireRule(game.phase === 'REGISTRATION', '当前阶段不能报名');
      requireRule(owns(TASKS, action.task_id), '只能选择任务 A、B、C');
      game.registrations[actorId] = action.task_id;
      game.registration_status[actorId] = 'registered';
      if (actorId !== 'P0') {
        game.agent_registration_revision ??= {};
        game.agent_registration_revision[actorId] = game.registration_revision ?? 0;
      }
      break;
    }
    case 'reconsider_registrations': {
      requireRule(actorId === 'P0' && game.phase === 'REGISTRATION', '当前阶段不能重新评估报名');
      requireRule((game.registration_reviews ?? 0) < 2, '今天的重新评估次数已用完');
      requireRule(IDS.every(id => owns(game.registrations, id)), '请先完成全体初次报名');
      requireRule(!game.thinking?.length && IDS.slice(1).every(id => (game.agent_registration_revision?.[id] ?? 0) === (game.registration_revision ?? 0)), '请等待本次重新评估结束');
      game.registration_reviews = (game.registration_reviews ?? 0) + 1;
      game.registration_revision = (game.registration_revision ?? 0) + 1;
      addMessage(game, 'SYSTEM', '玩家邀请三名 Agent 根据最新报名和各自收到的消息重新评估任务选择。');
      break;
    }
    case 'lock_registration': {
      requireRule(actorId === 'P0', '只有玩家可以结束报名');
      requireRule(game.phase === 'REGISTRATION', '当前阶段不能锁定报名');
      requireRule(IDS.every(id => owns(game.registrations, id)), '还有角色未完成报名');
      requireRule(IDS.slice(1).every(id => (game.agent_registration_revision?.[id] ?? 0) === (game.registration_revision ?? 0)), '请等待 Agent 完成本次重新评估');
      for (const task of Object.values(TASKS)) {
        const members = IDS.filter(id => game.registrations[id] === task.id);
        if (task.id === 'A') members.forEach(id => { game.registration_status[id] = 'confirmed'; });
        else if (members.length < task.required_members) members.forEach(id => { game.registration_status[id] = 'insufficient_members'; });
        else if (members.length === task.required_members) {
          game.active_teams[task.id] = members;
          members.forEach(id => { game.registration_status[id] = 'confirmed'; });
        } else game.vote_queue.push(task.id);
      }
      beginTeamPhase(game);
      break;
    }
    case 'vote': {
      requireRule(game.phase === 'VOTE_SUBMISSION', '当前阶段不能投票');
      const session = game.vote_session;
      requireRule(session.candidate_ids.includes(actorId), '只有当前候选人可以投票');
      requireRule(action.target_id !== actorId, '不能投给自己');
      requireRule(session.candidate_ids.includes(action.target_id), '投票对象不是当前候选人');
      requireRule(!owns(session.votes, actorId), '不能重复投票');
      session.votes[actorId] = action.target_id;
      if (session.candidate_ids.every(id => owns(session.votes, id))) resolveVote(game, randomInt);
      break;
    }
    case 'invest': {
      requireRule(game.phase === 'INVESTMENT_SUBMISSION', '当前阶段不能投入');
      const taskId = Object.keys(game.active_teams).find(id => game.active_teams[id].includes(actorId));
      requireRule(taskId, '只有正式任务成员可以投入');
      requireRule(Number.isSafeInteger(action.amount) && action.amount >= 0, '投入必须为非负整数');
      requireRule(action.amount * 12 <= player(game, actorId).gold_units, '投入超过当前余额');
      requireRule(!owns(game.investments, actorId), '不能重复提交投入');
      game.investments[actorId] = action.amount;
      if (Object.values(game.active_teams).flat().every(id => owns(game.investments, id))) settleRound(game);
      break;
    }
    case 'next_day': {
      requireRule(actorId === 'P0' && game.phase === 'ROUND_UPDATE', '当前阶段不能进入下一天');
      game.current_day++;
      startDay(game, randomInt);
      break;
    }
    default: throw new RuleError('未知行动类型', 400);
  }
  game.version++;
  return game;
}
function updateMemories(game, settlements) {
  for (const viewerId of IDS) {
    const memory = game.memories[viewerId];
    for (const settlement of Object.values(settlements)) {
      if (!settlement.member_ids.includes(viewerId)) continue;
      memory.facts.push({ day: game.current_day, source: 'authorized_settlement', task_id: settlement.task_id, success: settlement.success, investments: { ...settlement.investments } });
      for (const id of settlement.member_ids.filter(id => id !== viewerId)) {
        const promise = game.promises.findLast(p => p.day === game.current_day && p.actor_id === id && p.task_id === settlement.task_id);
        let delta = settlement.success ? 0.1 : 0;
        if (promise) delta += settlement.investments[id] >= promise.amount ? 0.2 : -0.4;
        if (settlement.investments[id] === 0 && settlement.success) delta -= 0.25;
        memory.trust[id] = Math.max(-1, Math.min(1, Math.round((memory.trust[id] + delta) * 100) / 100));
      }
    }
    memory.facts = memory.facts.slice(-16);
  }
}
export function settleRound(game) {
  if (game.round_results.some(result => result.day === game.current_day)) return game;
  requireRule(game.phase === 'INVESTMENT_SUBMISSION', '当前阶段不能结算');
  requireRule(Object.values(game.active_teams).flat().every(id => owns(game.investments, id)), '还有队员未提交投入');
  const settlements = {};
  for (const [taskId, memberIds] of Object.entries(game.active_teams)) {
    const investments = Object.fromEntries(memberIds.map(id => [id, game.investments[id]]));
    const total = Object.values(investments).reduce((a, b) => a + b, 0);
    const success = total >= TASKS[taskId].threshold;
    const rewardUnits = success ? total * (taskId === 'B' ? 9 : 8) : 0;
    const netChanges = {};
    for (const id of memberIds) {
      netChanges[id] = rewardUnits - investments[id] * 12;
      player(game, id).gold_units += netChanges[id];
      player(game, id).statistics[success ? 'success' : 'failure']++;
    }
    settlements[taskId] = { task_id: taskId, member_ids: memberIds, investments, total_investment: total, success, reward_multiplier: TASKS[taskId].multiplier, reward_pool_units: rewardUnits * memberIds.length, reward_per_player_units: rewardUnits, net_changes_units: netChanges };
  }
  for (const id of IDS.filter(id => game.registrations[id] === 'A')) {
    player(game, id).gold_units += 24;
    player(game, id).statistics.success++;
  }
  updateMemories(game, settlements);
  const balances = Object.fromEntries(game.players.map(p => [p.id, p.gold_units]));
  game.round_results.push({ day: game.current_day, public_gold_balances: balances, registrations: { ...game.registrations }, registration_status: { ...game.registration_status }, settlements, vote_results: game.vote_results.filter(v => v.day === game.current_day), net_changes_units: Object.fromEntries(IDS.map(id => [id, balances[id] - game.day_start_balances[id]])) });
  game.phase = game.current_day === game.max_days ? 'FINISHED' : 'ROUND_UPDATE';
  if (game.phase === 'FINISHED') {
    game.ranking = [...game.players].sort((a, b) => b.gold_units - a.gold_units).map((p, i, list) => ({ id: p.id, name: p.name, gold_units: p.gold_units, rank: list.findIndex(other => other.gold_units === p.gold_units) + 1 }));
  }
  addMessage(game, 'SYSTEM', `第 ${game.current_day} 天结算完成。详细投入仅对正式队员开放。`, null, 'settlement');
  return game;
}
