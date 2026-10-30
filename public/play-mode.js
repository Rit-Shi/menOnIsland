const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function newGameSettings(data) {
  const mode = data.get('play_mode') === 'auto' ? 'auto' : 'manual';
  return { play_mode: mode, ...(mode === 'auto' ? { proxy_npc_id: data.get('proxy_npc_id') } : {}) };
}

export function setupForm(config, { mode = 'manual', proxyNpcId = config.npc_profiles?.[0]?.npc_id } = {}) {
  const auto = mode === 'auto';
  return `<form data-form="new-game" class="new-game-form"><fieldset><legend>选择你的玩法</legend><div class="mode-choices"><label class="mode-choice"><input type="radio" name="play_mode" value="manual" ${!auto ? 'checked' : ''}><span><b>手动游玩</b><small>亲自谈判、投票和出资</small></span></label><label class="mode-choice"><input type="radio" name="play_mode" value="auto" ${auto ? 'checked' : ''}><span><b>Agent代玩</b><small>选一个人设，观看四名Agent博弈</small></span></label></div></fieldset><div class="proxy-options" data-proxy-options ${!auto ? 'hidden' : ''}><label>代理人设<select name="proxy_npc_id" ${!auto ? 'disabled' : ''}>${(config.npc_profiles || []).map(p => `<option value="${esc(p.npc_id)}" ${p.npc_id === proxyNpcId ? 'selected' : ''}>${esc(p.name)} · ${esc(p.code_name)}</option>`).join('')}</select></label><p>默认模型 <b>${esc(config.models?.P0 || config.models?.P1 || '')}</b>。自动完成八天，你从代理的视角观看；其余三人从剩下九人中随机选取。</p></div><button class="primary" type="submit">开始一场博弈 <span aria-hidden="true">→</span></button></form>`;
}

export function autoStageInfo(game) {
  if (game?.play_mode !== 'auto') return null;
  const proxy = game.players?.find(p => p.id === 'P0')?.name || 'P0';
  const speaker = game.players?.find(p => p.id === game.current_speaker)?.name || 'Agent';
  const phase = game.phase;
  const reflecting = game.reflection_status && !game.reflection_status.complete;
  const steps = { NEGOTIATION: 0, PRIVATE_CHAT_READY: 1, PRIVATE_CHAT: 1, REGISTRATION: 2, VOTE_SPEECH: 3, VOTE_SUBMISSION: 3, INVESTMENT_SUBMISSION: 4, ROUND_UPDATE: 5, FINISHED: 5 };
  const titles = { NEGOTIATION: '公共协商', PRIVATE_CHAT_READY: '即将开启私聊', PRIVATE_CHAT: '私聊协商', REGISTRATION: '秘密报名', VOTE_SPEECH: '淘汰前发言', VOTE_SUBMISSION: '秘密投票', INVESTMENT_SUBMISSION: '秘密投入', ROUND_UPDATE: reflecting ? '日终反思中' : '本日结算', FINISHED: reflecting ? '终局复盘中' : '最终排名' };
  const hints = {
    NEGOTIATION: `${speaker}正在独立发言。${proxy}代你行动，本轮结束后自动开启私聊。`,
    PRIVATE_CHAT_READY: '四名Agent已完成公聊，后端即将开启30秒私聊。',
    PRIVATE_CHAT: `四名Agent正在独立私聊。你正在查看${proxy}参与的对话，30秒结束后自动报名。`,
    REGISTRATION: '四名Agent各自秘密选择任务，全部提交后自动公布报名。',
    VOTE_SPEECH: `第${game.vote_session?.vote_round || 1}轮淘汰，${speaker}正在争取留下。`,
    VOTE_SUBMISSION: '候选人正在秘密投票，全部完成后统一揭晓。',
    INVESTMENT_SUBMISSION: '正式队员正在独立决定秘密投入，全队完成后自动结算。',
    ROUND_UPDATE: reflecting ? '四名Agent正在私人复盘，全部处理完成后自动进入下一天。' : '今日结算已完成，后端即将进入下一天。',
    FINISHED: reflecting ? '八天结束，四名Agent正在完成最后一次私人复盘。排名已可查看。' : (game.ranking || []).some(p => p.is_winner) ? `${game.ranking.find(p => p.is_winner).name}成为唯一胜利者。八天博弈已结束。` : '八天博弈结束，最高金币并列，本局无人获胜。并列第一不算赢。',
  };
  if (game.automation_status === 'stopped') return { step: steps[phase] ?? -1, title: '自动对局已停止', hint: '本局不再自动行动，可以查看已有记录或开启新航程。', mapLabel: '已停止 · 保留已有记录', actionLabel: '查看已有记录', actionKind: 'results', needsAction: false };
  return { step: steps[phase] ?? -1, title: titles[phase] || '自动推进中', hint: hints[phase] || '四名Agent正在独立行动。', mapLabel: `${titles[phase] || '自动博弈'} · ${proxy}代你行动`, actionLabel: phase === 'FINISHED' ? '查看最终排名' : '查看当前进度', actionKind: phase === 'FINISHED' ? 'results' : reflecting ? 'reflection' : 'watch', needsAction: false };
}
