import { IDS, TASKS, currentSpeaker, privateMessagesSent, PRIVATE_CHAT_MESSAGE_LIMIT } from './engine.js';

export function getObservation(game, viewerId, now = Date.now) {
  if (!IDS.includes(viewerId)) throw new Error('未知观察者');
  const agentView = viewerId !== 'P0';
  const registrationSecret = game.phase === 'REGISTRATION';
  const nameFor = p => agentView && p.id === 'P0' ? 'P0' : p.name;
  const messageFor = message => agentView && message.from === 'SYSTEM'
    ? { ...message, text: message.text.replaceAll('人类玩家', 'P0').replaceAll('玩家', 'P0').replaceAll('人类', '角色') }
    : message;
  const roundResults = game.round_results.map(result => ({
    day: result.day,
    public_gold_balances: result.public_gold_balances,
    registrations: result.registrations,
    registration_status: result.registration_status,
    task_statuses: Object.fromEntries(Object.entries(result.settlements).map(([id, s]) => [id, { success: s.success, member_ids: s.member_ids }])),
    my_settlement: Object.values(result.settlements).find(s => s.member_ids.includes(viewerId)) ?? null,
    my_net_change: result.net_changes[viewerId],
    vote_results: result.vote_results,
  }));
  const session = game.vote_session;
  const view = {
    id: game.id, schema_version: game.schema_version, version: game.version, current_day: game.current_day, max_days: game.max_days, phase: game.phase,
    viewer_id: viewerId,
    players: game.players.map(p => ({ id: p.id, name: nameFor(p), ...(!agentView ? { is_human: p.is_human } : {}), gold: p.gold, ...(p.id === viewerId ? { statistics: p.statistics } : {}) })),
    tasks: TASKS,
    registrations: registrationSecret ? Object.fromEntries(Object.entries(game.registrations).filter(([id]) => id === viewerId)) : game.registrations,
    registration_submitted: Object.fromEntries(IDS.map(id => [id, Object.hasOwn(game.registrations, id)])),
    registration_status: game.registration_status,
    registration_reviews_remaining: 2 - (game.registration_reviews ?? 0),
    registration_review_pending: IDS.slice(1).some(id => !Object.hasOwn(game.registrations, id) || (game.agent_registration_revision?.[id] ?? 0) < (game.registration_revision ?? 0)),
    active_teams: game.active_teams,
    negotiation_order: game.negotiation_order, negotiation_turn_index: game.negotiation_turn_index,
    current_speaker: currentSpeaker(game),
    private_chat: game.private_chat ? {
      started_at: game.private_chat.started_at, ends_at: game.private_chat.ends_at,
      remaining_ms: Math.max(0, game.private_chat.ends_at - now()),
      message_limit: PRIVATE_CHAT_MESSAGE_LIMIT,
      messages_sent: privateMessagesSent(game, viewerId),
      remaining_messages: Math.max(0, PRIVATE_CHAT_MESSAGE_LIMIT - privateMessagesSent(game, viewerId)),
    } : null,
    messages: game.messages.filter(m => !m.to || m.from === viewerId || m.to === viewerId).map(messageFor),
    promises: game.promises,
    vote_session: session ? { task_id: session.task_id, candidate_ids: session.candidate_ids, vote_round: session.vote_round, speech_index: session.speech_index } : null,
    vote_results: game.vote_results,
    my_vote: session && Object.hasOwn(session.votes, viewerId) ? session.votes[viewerId] : null,
    my_investment: Object.hasOwn(game.investments, viewerId) ? game.investments[viewerId] : null,
    round_results: roundResults,
    memories: { [viewerId]: game.memories[viewerId] },
    ranking: game.ranking.map(p => ({ ...p, name: nameFor(p) })),
  };
  return structuredClone(view);
}
export function getHumanView(game, now = Date.now) {
  const view = getObservation(game, 'P0', now);
  view.server_time = now();
  delete view.memories;
  view.thinking = game.phase === 'PRIVATE_CHAT' ? [] : game.thinking ?? [];
  view.diagnostics = ['ROUND_UPDATE', 'FINISHED'].includes(game.phase)
    ? game.diagnostics.filter(d => d.day === game.current_day).map(({ actor_id, model, code }) => ({ actor_id, model, code })) : [];
  return view;
}
