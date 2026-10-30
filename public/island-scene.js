const IDS = ['P0', 'P1', 'P2', 'P3'];
const NAMES = { P0: '你', P1: 'P1', P2: 'P2', P3: 'P3' };
const COLORS = { P0: '#bd8739', P1: '#3f876a', P2: '#557faa', P3: '#ac745e' };
const SITES = { A: { x: 254, y: 210, label: '淡水源', title: '收集淡水' }, B: { x: 488, y: 166, label: '庇护所', title: '搭建庇护所' }, C: { x: 716, y: 204, label: '通讯塔', title: '修复通讯塔' } };
const PUBLISHED = new Set(['VOTE_SPEECH', 'VOTE_SUBMISSION', 'INVESTMENT_SUBMISSION', 'ROUND_UPDATE', 'FINISHED']);
const signed = value => `${value > 0 ? '+' : ''}${value}`;
const nameFor = (game, id) => id === 'P0' ? '你' : game?.players?.find(player => player.id === id)?.name || NAMES[id] || '其他角色';

export function stageInfo(game) {
  const phase = game?.phase || 'WELCOME';
  const stage = { step: -1, title: '等待登岛', mapLabel: '风平浪静，等待启程', hint: '开始一场八天的海岛博弈，与其他幸存者协商、组队，争取最多金币。', actionLabel: '开始博弈', actionKind: 'start', needsAction: false };
  if (!game) return stage;
  const ownTeam = Object.keys(game.active_teams || {}).find(task => game.active_teams[task].includes('P0'));
  const candidate = game.vote_session?.candidate_ids?.includes('P0');
  const reflecting = game.reflection_status && !game.reflection_status.complete;
  switch (phase) {
    case 'NEGOTIATION':
      return { ...stage, step: 0, title: '公共协商', mapLabel: '营地议事 · 轮流发言', hint: game.current_speaker === 'P0' ? '轮到你了，说出今天的计划，回应伙伴或提出合作。' : `正在听${nameFor(game, game.current_speaker)}发言。本轮结束后，由你手动开启私聊。`, actionLabel: game.current_speaker === 'P0' ? '去公开发言' : '查看发言顺序', actionKind: game.current_speaker === 'P0' ? 'public' : 'wait', needsAction: game.current_speaker === 'P0' };
    case 'PRIVATE_CHAT_READY':
      return { ...stage, step: 1, title: '准备私聊', mapLabel: '公共协商结束 · 等你开启私聊', hint: '30秒倒计时尚未开始。先读完公共发言，准备好后点击按钮，再进入私聊。', actionLabel: '开始30秒私聊', actionKind: 'start-private', needsAction: true };
    case 'PRIVATE_CHAT':
      return { ...stage, step: 1, title: '私聊协商', mapLabel: '短暂私聊 · 话只给彼此听', hint: game.private_chat?.remaining_messages > 0 ? `每天只有这 30 秒可以私聊。你还可发送 ${game.private_chat.remaining_messages} 条，时间结束后进入报名。` : '今天的私聊额度已用完，可以阅读已有消息，等待报名开始。', actionLabel: '打开私聊', actionKind: 'private', needsAction: game.private_chat?.remaining_messages > 0 };
    case 'REGISTRATION': {
      const submitted = Object.values(game.registration_submitted || {}).filter(Boolean).length;
      const ready = submitted === 4 && !game.registration_review_pending;
      return { ...stage, step: 2, title: '秘密报名', mapLabel: '各自选择 · 去向暂时保密', hint: `已有 ${submitted}/4 人提交。你的选择只有你知道，确认公布后，大家才会走向任务点。`, actionLabel: !game.registrations?.P0 ? '选择今天的任务' : ready ? '确认并公布报名' : '查看报名进度', actionKind: !game.registrations?.P0 ? 'tasks' : 'wait', needsAction: !game.registrations?.P0 || ready };
    }
    case 'VOTE_SPEECH':
      return { ...stage, step: 3, title: '淘汰前发言', mapLabel: '名额有限 · 争取留下', hint: game.current_speaker === 'P0' ? `第 ${game.vote_session?.vote_round || 1} 轮淘汰，轮到你发言，争取队伍中的名额。` : `第 ${game.vote_session?.vote_round || 1} 轮淘汰，${nameFor(game, game.current_speaker)}正在发言；本轮发言后再秘密投票。`, actionLabel: game.current_speaker === 'P0' ? '去争取名额' : '查看候选人', actionKind: game.current_speaker === 'P0' ? 'public' : 'wait', needsAction: game.current_speaker === 'P0' };
    case 'VOTE_SUBMISSION':
      return { ...stage, step: 3, title: '秘密投票', mapLabel: '密封选票 · 等待揭晓', hint: !candidate ? '你不在本轮候选人中。候选人正在秘密投票，结果随后公开。' : game.my_vote ? '你的选票已锁定。其他人的选择仍然保密，请等待统一揭晓。' : '选择一名其他候选人淘汰。提交后不可修改，投票结束后统一揭晓。', actionLabel: candidate && !game.my_vote ? '填写淘汰票' : '查看投票进度', actionKind: 'ballot', needsAction: Boolean(candidate && !game.my_vote) };
    case 'INVESTMENT_SUBMISSION':
      return { ...stage, step: 4, title: '秘密投入', mapLabel: '队伍出发 · 各自决定投入', hint: ownTeam ? game.my_investment == null ? '你已经成为正式队员。现在决定实际投入，承诺不会自动代替出资。' : '你的投入已锁定。其他人的金额保密，待全队完成后统一结算。' : game.registration_status?.P0 === 'eliminated' ? '你今天已被淘汰，无需投入，不扣金币。其他队伍正在行动。' : game.registration_status?.P0 === 'insufficient_members' ? '你的任务没有凑齐人数，无需投入，不扣金币。其他队伍正在行动。' : '收集淡水无需投入，结算时固定获得 2 金币。其他队伍正在行动。', actionLabel: ownTeam && game.my_investment == null ? '决定我的投入' : '查看行动进度', actionKind: 'invest', needsAction: Boolean(ownTeam && game.my_investment == null) };
    case 'ROUND_UPDATE':
      if (reflecting) return { ...stage, step: 5, title: '日终反思中', mapLabel: '今日收获 · 各自复盘', hint: '三名Agent正在回顾今天的决策。你可以先查看结算，全部处理完成后再进入下一天。', actionLabel: '查看反思进度', actionKind: 'reflection', needsAction: false };
      return { ...stage, step: 5, title: '本日结算', mapLabel: '今日收获 · 承诺有了答案', hint: '今天的行动已结束。查看你的队内结算和所有人的公开资产，再开始新的一天。', actionLabel: '查看今日收获', actionKind: 'results', needsAction: true };
    case 'FINISHED':
      if (reflecting) return { ...stage, step: 5, title: '终局复盘中', mapLabel: '八日结束 · 回望每次选择', hint: '最终排名已揭晓，三名Agent正在完成第8天的私人复盘。下方可查看最终胜负。', actionLabel: '查看复盘进度', actionKind: 'reflection', needsAction: false };
      return { ...stage, step: 5, title: '最终排名', mapLabel: '八日之后 · 岛上故事留下', hint: (game.ranking || []).filter(p => p.rank === 1).length === 1 ? '八天航程结束。只有金币严格高于其余三人的角色，才是本局唯一胜利者。' : '八天航程结束。最高金币并列，本局无人获胜；并列第一不算赢。', actionLabel: '查看最终排名', actionKind: 'results', needsAction: false };
    default:
      return { ...stage, title: '正在同步', hint: '正在同步当前进度，请稍候。', actionLabel: '查看进度', actionKind: 'wait' };
  }
}

export function islandModel(game) {
  const phase = game?.phase || 'WELCOME';
  const published = PUBLISHED.has(phase);
  const registrations = published ? game.registrations || {} : {};
  const currentResult = ['ROUND_UPDATE', 'FINISHED'].includes(phase) ? game.round_results?.findLast(result => result.day === game.current_day) : null;
  const previousResult = currentResult ? game.round_results.findLast(result => result.day < currentResult.day) : null;
  const leaders = phase === 'FINISHED' ? (game.ranking || []).filter(player => player.rank === 1) : [];
  const winners = leaders.length === 1 ? leaders.map(player => player.id) : [];
  const tasks = Object.entries(SITES).map(([id, site]) => {
    const applicants = published ? IDS.filter(role => registrations[role] === id) : [];
    const active = game?.active_teams?.[id];
    const contested = published && game.vote_session?.task_id === id && ['VOTE_SPEECH', 'VOTE_SUBMISSION'].includes(phase);
    const roster = published ? contested ? [...game.vote_session.candidate_ids] : active ? [...active] : applicants : [];
    let state = phase === 'REGISTRATION' ? 'sealed' : 'idle';
    if (published) {
      if (id === 'A') state = applicants.length ? currentResult ? 'success' : 'working' : 'idle';
      else if (currentResult) state = currentResult.task_statuses?.[id] ? currentResult.task_statuses[id].success ? 'success' : 'failed' : 'cancelled';
      else if (contested) state = 'contested';
      else if (active?.length) state = 'working';
      else state = applicants.length >= (id === 'B' ? 2 : 3) ? 'waiting' : 'cancelled';
    }
    const subtitles = { sealed: '报名保密', idle: '等待出发', working: id === 'A' ? '沿溪采集' : '队伍行动中', contested: '正在争取名额', waiting: '等待组队', success: '任务完成', failed: '投入未达标', cancelled: roster.length ? '人数不足' : '无人执行' };
    return { id, ...site, state, roster, subtitle: subtitles[state], selected: phase === 'REGISTRATION' && game.registrations?.P0 === id };
  });
  const roles = IDS.map((id, index) => {
    const player = game?.players?.find(role => role.id === id);
    const registrationStatus = game?.registration_status?.[id];
    const assigned = registrations[id];
    const excluded = ['eliminated', 'insufficient_members'].includes(registrationStatus);
    const location = published && phase !== 'FINISHED' && !excluded && SITES[assigned] ? assigned : 'camp';
    const speaking = ['NEGOTIATION', 'VOTE_SPEECH'].includes(phase) && game?.current_speaker === id;
    const delta = currentResult ? (currentResult.public_gold_balances?.[id] ?? player?.gold ?? 10) - (previousResult?.public_gold_balances?.[id] ?? 10) : null;
    let status = '待登岛';
    if (phase === 'WELCOME') status = '待登岛';
    else if (phase === 'NEGOTIATION') status = speaking ? '发言中' : '等候';
    else if (phase === 'PRIVATE_CHAT_READY') status = '等待私聊';
    else if (phase === 'PRIVATE_CHAT') status = '私聊时间';
    else if (phase === 'REGISTRATION') status = game.registration_submitted?.[id] ? '已提交' : '选择中';
    else if (phase === 'FINISHED') status = winners.includes(id) ? '唯一胜者' : leaders.some(p => p.id === id) ? '并列 · 未获胜' : '航程结束';
    else if (excluded) status = registrationStatus === 'eliminated' ? '已淘汰' : '未成队';
    else if (currentResult) status = delta ? signed(delta) : '无收益';
    else if (speaking) status = '发言中';
    else if (game?.vote_session?.candidate_ids?.includes(id) && ['VOTE_SPEECH', 'VOTE_SUBMISSION'].includes(phase)) status = phase === 'VOTE_SPEECH' ? '候选人' : id === 'P0' && game.my_vote ? '已投票' : '秘密投票';
    else if (assigned === 'A') status = '采集中';
    else if (phase === 'INVESTMENT_SUBMISSION') status = id === 'P0' ? game.my_investment == null ? '待投入' : '已锁定' : '投入保密';
    else status = '等待组队';
    const peers = location === 'camp' ? [] : IDS.filter(other => registrations[other] === location && !['eliminated', 'insufficient_members'].includes(game?.registration_status?.[other]));
    const x = location === 'camp' ? 350 + index * 76 : SITES[location].x + (peers.indexOf(id) - (peers.length - 1) / 2) * 62;
    const y = location === 'camp' ? 316 : SITES[location].y + 74;
    return { id, name: id === 'P0' ? '你' : player?.name || NAMES[id], color: COLORS[id], gold: player?.gold ?? 10, x, y, location, status, speaking, delta, winner: winners.includes(id) };
  });
  return { id: game?.id || 'preview', day: game?.current_day || 1, phase, published, selectedTask: phase === 'REGISTRATION' ? game.registrations?.P0 || null : null, stage: stageInfo(game), tasks, roles };
}

const tree = (x, y, scale = 1) => `<g class="island-tree" transform="translate(${x} ${y}) scale(${scale})"><ellipse cy="9" rx="16" ry="5" fill="#315e4520"/><path d="M0 8Q4-7 0-23" fill="none" stroke="#8f7850" stroke-width="5"/><g class="palm-leaves"><path d="M0-21q-25-23-37 2Q-17-28 0-21q-3-28 16-31Q4-39 0-21q25-25 38-2Q18-31 0-21q-18 0-23 18Q-10-14 0-21q17-1 21 16Q10-16 0-21" fill="#40856a"/><path d="M0-21q-13-18-27-5M0-21q12-15 26-10" fill="none" stroke="#6baa7e" stroke-width="2"/></g></g>`;
const wave = (x, y) => `<path class="sea-ripple" d="M${x} ${y}q10-5 20 0t20 0m-30 9q8-4 16 0t16 0"/>`;

export function islandMarkup() {
  return `<section class="island-scene" id="island-scene" aria-label="岛屿实况"><div class="scene-hud"><div><span class="scene-live-dot"></span><b data-scene-title>风平浪静，等待启程</b></div><span class="scene-day" data-scene-day>DAY 01</span></div>
  <svg class="island-map" viewBox="0 0 960 410" role="img" aria-label="四名幸存者、营地和三个任务地点的动态海岛地图">
    <defs><linearGradient id="scene-water" x2="0" y2="1"><stop stop-color="#d7efef"/><stop offset="1" stop-color="#b9e0e0"/></linearGradient><linearGradient id="scene-land" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#a6ca92"/><stop offset="1" stop-color="#79ad86"/></linearGradient><linearGradient id="scene-beach" x2="0" y2="1"><stop stop-color="#f8e6bb"/><stop offset="1" stop-color="#e6d5a6"/></linearGradient><filter id="scene-shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#517d6a" flood-opacity=".13"/></filter></defs>
    <rect width="960" height="410" fill="url(#scene-water)"/>
    <g class="ocean-contours" fill="none" stroke="#fff" stroke-width="1.5"><path d="M122 248C66 171 211 74 338 87S474 28 602 73s226 36 242 133-125 146-274 141-206 48-314 13-111-44-134-112Z"/><path d="M99 251C46 167 196 52 334 68S471 6 609 51s250 45 258 154-136 165-294 163-211 46-327 14-124-48-147-131Z"/></g>
    <g class="water-ripples">${[[73,150],[89,310],[850,287],[785,80],[42,225],[690,365]].map(([x,y]) => wave(x,y)).join('')}</g>
    <g class="scene-sun" transform="translate(844 71)"><g class="sun-rays" stroke="#e1b86c" stroke-width="2.5"><path d="M0-29v-8m0 66v8m-29-37h-8m66 0h8m-57-20-6-6m46 46 6 6m-46 0-6 6m46-46 6-6"/></g><circle r="19" fill="#f4ce7c"/><circle r="11" fill="#f7db99"/></g>
    <g class="scene-cloud cloud-one" fill="#fff" opacity=".8"><path d="M56 85c-17-1-13-19-1-19 1-20 31-20 35-3 17-3 23 21 4 22Z"/></g><g class="scene-cloud cloud-two" fill="#fff" opacity=".7"><path d="M639 64c-14 0-12-15-1-16 2-17 27-18 31-3 14-3 22 18 6 19Z"/></g>
    <g class="scene-birds" fill="none" stroke="#6b999b" stroke-width="2" stroke-linecap="round"><path d="M121 105q7-9 14 0 7-9 14 0m27 14q5-6 10 0 5-6 10 0"/></g>
    <path class="island-shore-wave" d="M148 245C99 180 221 99 340 108s134-55 257-13 198 31 216 113-113 127-246 121-194 47-291 13-110-38-128-97Z" fill="#eaf7ee" opacity=".65"/>
    <path d="M158 240C113 181 228 108 342 118s132-51 250-13 188 30 203 103-105 115-228 110-187 44-280 14-111-37-129-92Z" fill="url(#scene-beach)" filter="url(#scene-shadow)"/>
    <path d="M177 230C140 182 240 123 346 133s125-47 238-11 178 27 192 87-102 96-210 92-179 44-267 12-104-30-122-83Z" fill="url(#scene-land)"/>
    <path d="M244 227q112 64 229 3t238-10" fill="none" stroke="#d3d09b" stroke-width="6" stroke-linecap="round" stroke-dasharray="1 12" opacity=".75"/>
    <path class="island-stream" d="M350 141q-39 28-40 52t-54 30-42 38" fill="none" stroke="#8fc8c6" stroke-width="17" stroke-linecap="round"/><path d="M350 141q-39 28-40 52t-54 30-42 38" fill="none" stroke="#d4eddd" stroke-width="3" stroke-dasharray="10 15"/>
    <g class="island-forest">${[[381,166,.75],[406,141,.9],[443,127,.8],[566,140,.9],[603,177,.75],[646,143,.85],[319,270,.65],[608,278,.7],[183,203,.7],[763,265,.65]].map(args => tree(...args)).join('')}</g>
    <g class="scene-landmark" data-landmark="A" transform="translate(254 210)"><ellipse cy="9" rx="43" ry="14" fill="#659f8f33"/><ellipse cy="6" rx="31" ry="11" fill="#76b5bc" stroke="#c4e3d2" stroke-width="4"/><path d="M-15-4q-6-13 6-21 10 16 5 20" fill="#b6dbce"/><path class="water-drop" d="M16-22s-7 9-7 12a7 7 0 0 0 14 0c0-3-7-12-7-12" fill="#539eae"/><g class="site-success-mark"><circle cy="-43" r="12"/><path d="m-5-43 4 4 7-8"/></g></g>
    <g class="scene-landmark" data-landmark="B" transform="translate(488 166)"><ellipse cy="21" rx="45" ry="12" fill="#4d765f22"/><path d="M-31 19V-16h62v35" fill="#e1cb98" stroke="#a48150" stroke-width="4"/><path class="shelter-roof" d="m-45-14 43-34 47 34Z" fill="#c49459" stroke="#a07844" stroke-width="3"/><path d="M-8 20V-3h16v23" fill="#8d7657"/><path d="M-33-10h66m-62 7h57" stroke="#eedab0" stroke-width="3"/><g class="site-work-spark"><path d="m38-29 5-10m2 15 11-4m-17-11 2-9"/></g><g class="site-success-mark"><circle cy="-67" r="12"/><path d="m-5-67 4 4 7-8"/></g></g>
    <g class="scene-landmark" data-landmark="C" transform="translate(716 204)"><ellipse cy="14" rx="40" ry="11" fill="#4d765f22"/><path d="m-20 12 20-63 20 63m-33-20h26m-20-20h14M-15 12h30M0-52v-25" fill="none" stroke="#687f8b" stroke-width="5" stroke-linejoin="round"/><path d="m-14-8 21-20m-14 0 14-18" stroke="#91a0a2" stroke-width="3"/><circle cy="-77" r="5" fill="#d6aa5d"/><g class="radio-waves" fill="none" stroke="#549a9e" stroke-width="2.5"><path d="M-13-89a18 18 0 0 0 0 25m26-25a18 18 0 0 1 0 25"/><path d="M-22-98a31 31 0 0 0 0 43m44-43a31 31 0 0 1 0 43"/></g><g class="site-success-mark"><circle cx="36" cy="-63" r="12"/><path d="m31-63 4 4 7-8"/></g></g>
    <g class="scene-camp" transform="translate(463 271)"><ellipse cy="8" rx="39" ry="9" fill="#53745a22"/><path d="m-21 8 20-28L22 8Z" fill="#f1d49c" stroke="#aa8f60" stroke-width="2"/><path d="M-1-20V8L8 8Z" fill="#c8a46d"/><path d="m-7 16 16 6m-16 0 16-6" stroke="#9d7954" stroke-width="4" stroke-linecap="round"/><path class="camp-flame" d="M0 19c-13-6 1-12-1-21 12 9 15 17 1 21" fill="#dfad65"/><text y="43" text-anchor="middle" class="camp-label">营地</text></g>
    <g class="island-role-layer">${IDS.map((id,index) => `<g class="island-role" data-island-role="${id}" style="--role-color:${COLORS[id]};transform:translate(${350+index*76}px,316px)"><title data-role-tooltip></title><ellipse class="role-shadow" cy="4" rx="18" ry="6"/><g class="role-float"><circle class="role-halo" r="23"/><path class="role-crown" d="m-14-32 3 12h22l3-12-9 5-5-9-5 9Z"/><text class="role-gain" y="-30" text-anchor="middle"></text><circle class="role-disc" cy="-9" r="16"/><text class="role-initial" y="-4" text-anchor="middle"></text><g class="role-speech" transform="translate(15 -36)"><path d="M0 0h27v17H9l-5 5v-5H0Z"/><circle cx="7" cy="8" r="1.2"/><circle cx="14" cy="8" r="1.2"/><circle cx="21" cy="8" r="1.2"/></g><text class="role-name" y="26" text-anchor="middle"></text><text class="role-status" y="42" text-anchor="middle"></text></g></g>`).join('')}</g>
    <g class="scene-compass" transform="translate(875 330)" fill="none" stroke="#609397"><circle r="17"/><path d="M0-25v50m-25-25h50"/><path d="m0-12 5 12-5-3-5 3Z" fill="#609397"/><text y="-30" text-anchor="middle" stroke="none" fill="#609397" font-size="11">N</text></g>
  </svg><div class="scene-site-controls">${Object.entries(SITES).map(([id,site]) => `<button type="button" class="scene-site" id="scene-site-${id}" data-action="map-task" data-task="${id}" style="left:${site.x/9.6}%;top:${(site.y+29)/4.1}%"><span>${id}</span><b>${site.label}</b><small data-site-status></small></button>`).join('')}</div><div class="scene-caption"><span data-scene-hint>四名幸存者，一段关于合作的故事。</span><span class="scene-motion-note">DAYLIGHT ISLAND</span></div><div class="scene-legend" aria-label="角色当前状态">${IDS.map(id => `<span data-legend-role="${id}" style="--role-color:${COLORS[id]}"><i></i><b></b><small></small></span>`).join('')}</div></section>`;
}

export function updateIslandScene(element, game) {
  const model = islandModel(game);
  element.dataset.sceneKey = model.id;
  element.dataset.phase = model.phase;
  element.querySelector('[data-scene-title]').textContent = model.stage.mapLabel;
  element.querySelector('[data-scene-day]').textContent = `DAY ${String(model.day).padStart(2,'0')}`;
  element.querySelector('[data-scene-hint]').textContent = model.phase === 'REGISTRATION' ? '公布前，角色去向和任务人数都保密。' : model.phase === 'PRIVATE_CHAT' ? '私聊只对双方可见，地图不展示联系对象。' : model.phase === 'INVESTMENT_SUBMISSION' ? '只有正式队员投入；金额在结算前保密。' : model.phase === 'ROUND_UPDATE' ? '金币变化来自公开资产，详细投入仅队内可见。' : '在地图上找到伙伴，也找到今天的方向。';
  for (const task of model.tasks) {
    const landmark = element.querySelector(`[data-landmark="${task.id}"]`);
    landmark.dataset.state = task.state;
    landmark.classList.toggle('is-selected', task.selected);
    const button = element.querySelector(`#scene-site-${task.id}`);
    button.dataset.state = task.state;
    button.classList.toggle('is-selected', task.selected);
    button.querySelector('[data-site-status]').textContent = task.state === 'sealed' ? task.selected ? '你的选择' : '保密' : model.published && task.roster.length ? `${task.roster.length}人 · ${task.subtitle}` : task.subtitle;
    button.setAttribute('aria-label', `${model.phase === 'REGISTRATION' ? '选择' : '查看'}任务 ${task.id}：${task.title}`);
    if (model.phase === 'REGISTRATION') button.setAttribute('aria-pressed', String(task.selected));
    else button.removeAttribute('aria-pressed');
  }
  for (const role of model.roles) {
    const node = element.querySelector(`[data-island-role="${role.id}"]`);
    node.style.transform = `translate(${role.x}px,${role.y}px)`;
    node.dataset.location = role.location;
    node.classList.toggle('is-speaking', role.speaking);
    node.classList.toggle('is-winner', role.winner);
    node.classList.toggle('is-loss', role.delta < 0);
    node.classList.toggle('is-excluded', ['已淘汰','未成队'].includes(role.status));
    node.querySelector('[data-role-tooltip]').textContent = `${role.name} · ${role.status} · ${role.gold}金币`;
    node.querySelector('.role-initial').textContent = role.name.slice(0,1);
    node.querySelector('.role-name').textContent = role.name;
    node.querySelector('.role-status').textContent = role.status;
    node.querySelector('.role-gain').textContent = model.phase === 'ROUND_UPDATE' && role.delta ? signed(role.delta) : '';
    const legend = element.querySelector(`[data-legend-role="${role.id}"]`);
    legend.classList.toggle('is-speaking', role.speaking);
    legend.querySelector('b').textContent = role.name;
    legend.querySelector('small').textContent = role.status;
  }
  return model;
}
