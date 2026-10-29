import { IDS, TASKS, addMessage, calculateSettlement, rankPlayers } from './engine.js';

export function migrateGame(game) {
  if (game.schema_version === 2) return false;
  if (game.schema_version != null || !game.players.every(p => Number.isSafeInteger(p.gold_units))) {
    throw new Error('unsupported_game_schema');
  }
  // Replay each payout: rounding only the final old balance loses earlier rounding bonuses.
  let balances = Object.fromEntries(IDS.map(id => [id, 10]));
  let dayStart = { ...balances };
  for (const result of game.round_results) {
    dayStart = { ...balances };
    const changes = Object.fromEntries(IDS.map(id => [id, result.registrations[id] === 'A' ? TASKS.A.fixed_reward : 0]));
    result.settlements = Object.fromEntries(Object.entries(result.settlements).map(([taskId, previous]) => {
      const settlement = calculateSettlement(taskId, previous.member_ids, previous.investments);
      for (const [id, change] of Object.entries(settlement.net_changes)) changes[id] += change;
      return [taskId, settlement];
    }));
    balances = Object.fromEntries(IDS.map(id => [id, balances[id] + changes[id]]));
    result.public_gold_balances = { ...balances };
    result.net_changes = changes;
    delete result.net_changes_units;
  }
  game.day_start_balances = game.round_results.at(-1)?.day === game.current_day ? dayStart : { ...balances };
  for (const p of game.players) {
    p.gold = balances[p.id];
    delete p.gold_units;
  }
  game.ranking = game.phase === 'FINISHED' ? rankPlayers(game.players) : [];
  game.schema_version = 2;
  game.version++;
  addMessage(game, 'SYSTEM', '金币规则已更新：所有金额直接使用整数金币，成功奖金平分后每人向上取整。历史结算和余额已按新规则重算；历史聊天原文保留，其中提到的旧金额仅供参考。', null, 'rule_update');
  return true;
}
