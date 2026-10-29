import { IDS, TASKS, currentSpeaker } from './engine.js';

export function getObservation(game, viewerId) {
  if (!IDS.includes(viewerId)) throw new Error('未知观察者');
  const roundResults = game.round_results.map(result => ({
    day: result.day,
    public_gold_balances: result.public_gold_balances,
    registrations: result.registrations,
    registration_status: result.registration_status,
    task_statuses: Object.fromEntries(Object.entries(result.settlements).map(([id, s]) => [id, { success: s.success, member_ids: s.member_ids }])),
    my_settlement: Object.values(result.settlements).find(s => s.member_ids.includes(viewerId)) ?? null,
    my_net_change_units: result.net_changes_units[viewerId],
    vote_results: result.vote_results,
  }));
  const session = game.vote_session;
  const view = {
    id: game.id, version: game.version, current_day: game.current_day, max_days: game.max_days, phase: game.phase,
    viewer_id: viewerId,
    players: game.players.map(p => ({ id: p.id, name: p.name, is_human: p.is_human, gold_units: p.gold_units, ...(p.id === viewerId ? { statistics: p.statistics } : {}) })),
    tasks: TASKS, registrations: game.registrations, registration_status: game.registration_status,
    active_teams: game.active_teams,
    negotiation_order: game.negotiation_order, negotiation_turn_index: game.negotiation_turn_index,
    current_speaker: currentSpeaker(game),
    messages: game.messages.filter(m => !m.to || m.from === viewerId || m.to === viewerId),
    promises: game.promises,
    vote_session: session ? { task_id: session.task_id, candidate_ids: session.candidate_ids, vote_round: session.vote_round, speech_index: session.speech_index } : null,
    vote_results: game.vote_results,
    my_vote: session && Object.hasOwn(session.votes, viewerId) ? session.votes[viewerId] : null,
    my_investment: Object.hasOwn(game.investments, viewerId) ? game.investments[viewerId] : null,
    round_results: roundResults,
    memories: { [viewerId]: game.memories[viewerId] },
    ranking: game.ranking,
  };
  return structuredClone(view);
}
export function getHumanView(game) {
  const view = getObservation(game, 'P0');
  delete view.memories;
  view.thinking = game.thinking ?? [];
  view.diagnostics = ['ROUND_UPDATE', 'FINISHED'].includes(game.phase)
    ? game.diagnostics.filter(d => d.day === game.current_day).map(({ actor_id, model, code }) => ({ actor_id, model, code })) : [];
  return view;
}
