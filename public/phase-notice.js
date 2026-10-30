const PHASES = new Set(['NEGOTIATION','PRIVATE_CHAT_READY','PRIVATE_CHAT','REGISTRATION','VOTE_SPEECH','VOTE_SUBMISSION','INVESTMENT_SUBMISSION','ROUND_UPDATE','FINISHED']);

export function phaseNotice(event, mode = 'manual') {
  if (!event || typeof event.id !== 'string' || !PHASES.has(event.from) || !PHASES.has(event.to)) return null;
  const day = Number.isInteger(event.day) ? event.day : 1;
  const round = Number.isInteger(event.vote_round) ? event.vote_round : 1;
  const nextRound = Number.isInteger(event.next_vote_round) ? event.next_vote_round : round + 1;
  const task = ['B','C'].includes(event.task_id) ? ` · ${event.task_id} 任务` : '';
  const notice = { id: event.id, kicker: `第 ${day} 天${task}`, tone: 'leaf', title: '阶段已完成', detail: '下一阶段已经准备好。' };
  if (event.from === 'NEGOTIATION') return { ...notice, title: '公共协商结束', detail: mode === 'auto' ? '公共协商已完成，即将自动开启30秒私聊。' : '计划已说出口。准备好后，点击开始30秒私聊。' };
  if (event.to === 'PRIVATE_CHAT') return { ...notice, tone: 'sea', title: '私聊已开启', detail: '30秒开始计时，每人今天最多发送5条私信。' };
  if (event.from === 'PRIVATE_CHAT') return { ...notice, tone: 'sea', title: '私聊时间到', detail: '悄悄话暂告一段落，现在各自秘密选择任务。' };
  if (event.from === 'REGISTRATION') return { ...notice, tone: 'sun', title: '报名已公布', detail: event.to === 'VOTE_SPEECH' ? `出现超员，第 ${nextRound} 轮淘汰发言开始。` : '各角色去向已公开，按组队结果进入行动与结算。' };
  if (event.from === 'VOTE_SPEECH') return { ...notice, tone: 'sun', title: '淘汰发言结束', detail: `第 ${round} 轮进入秘密投票，选票提交后不可修改。` };
  if (event.from === 'VOTE_SUBMISSION') return { ...notice, tone: 'sun', title: `第 ${round} 轮投票结束`, detail: event.to === 'VOTE_SPEECH' ? `仍有超员，第 ${nextRound} 轮重新发言、重新投票。` : '淘汰结果已公布，留下的正式队员进入秘密投入。' };
  if (event.to === 'FINISHED') return { ...notice, tone: 'gold', title: '八日航程结束', detail: '最终排名已揭晓。唯一第一才算赢，并列最高无人获胜。' };
  if (event.from === 'INVESTMENT_SUBMISSION') return { ...notice, tone: 'gold', title: '今日行动完成', detail: '收获与代价已有答案，查看你的结算和公开资产。' };
  if (event.to === 'NEGOTIATION') return { ...notice, title: '新的一天启程', detail: `第 ${day} 天，返回营地，重新商量今天的计划。` };
  return notice;
}

export function noticeEvents(previous, next) {
  if (!previous || !next || previous.id !== next.id) return [];
  const known = new Set((previous.phase_events || []).map(event => event.id));
  const notices = [];
  for (const event of next.phase_events || []) {
    if (known.has(event.id)) continue;
    known.add(event.id);
    const notice = phaseNotice(event, next.play_mode);
    if (notice) notices.push(notice);
  }
  return notices;
}

export function createPhaseNotices({ show, hide }) {
  let queue = [];
  let timer;
  let active = false;
  const seen = new Set();
  function advance() {
    const notice = queue.shift();
    if (!notice) { active = false; return; }
    active = true;
    show(notice);
    timer = setTimeout(() => { hide(); timer = setTimeout(advance, 100); }, 1700);
  }
  return {
    enqueue(notices) {
      for (const notice of notices) if (!seen.has(notice.id)) { seen.add(notice.id); queue.push(notice); }
      if (!active && queue.length) advance();
    },
    reset() { clearTimeout(timer); queue = []; seen.clear(); active = false; hide(); },
  };
}
