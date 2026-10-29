const $ = selector => document.querySelector(selector);
const root = $('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = units => (Number(units) / 12).toFixed(2);
const signed = units => `${units > 0 ? '+' : ''}${money(units)}`;
const names = { P0: '玩家', P1: '林舟', P2: '沈默', P3: '顾寒', SYSTEM: '岛屿广播' };
const colors = { P0: '#d9bd86', P1: '#83bda8', P2: '#8da9c9', P3: '#c99a87' };
const labels = { NEGOTIATION: '公共协商', REGISTRATION: '任务报名', VOTE_SPEECH: '淘汰前发言', VOTE_SUBMISSION: '秘密投票', INVESTMENT_SUBMISSION: '秘密投入', ROUND_UPDATE: '本日结算', FINISHED: '最终排名' };
const taskNames = { A: '收集淡水', B: '搭建庇护所', C: '修复通讯塔' };
const statusNames = { registered: '已报名', confirmed: '正式队员', insufficient_members: '人数不足', eliminated: '已被淘汰' };
let game = null;
let config = { models: {}, configured: false };
let channel = 'public';
let busy = false;
let polling = false;
let toastTimer;
const drafts = {};

function icon(name, size = 24) {
  const shapes = {
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.2 5.4-5.4 2.2 2.2-5.4Z"/>',
    water: '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
    shelter: '<path d="m3 19 9-15 9 15H3Zm9-15v15m0-8 5 8"/>',
    radio: '<path d="m8 21 4-13 4 13m-6-6h4m-6 6h8M8 4a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M5 1a10 10 0 0 0 0 14m14-14a10 10 0 0 1 0 14"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    chat: '<path d="M21 11a8 8 0 0 1-8 8H6l-4 3 1-7a8 8 0 0 1-1-4 9 9 0 0 1 19 0Z"/><path d="M7 10h10m-10 4h6"/>',
    flag: '<path d="M5 22V3m0 1c4-4 8 4 14 0v10c-6 4-10-4-14 0"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.compass}</svg>`;
}
function avatar(id, small = false) { return `<span class="avatar ${small ? 'small' : ''}" style="--role-color:${colors[id]}" aria-hidden="true">${id === 'P0' ? '你' : names[id]?.slice(0, 1)}</span>`; }
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4500);
}
async function api(path, body) {
  const response = await fetch(path, { credentials: 'same-origin', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) { const error = new Error(value.error || '请求失败'); error.status = response.status; throw error; }
  return value;
}
function accept(next) {
  if (game && game.id === next.id && next.version < game.version) return;
  const changed = !game || game.id !== next.id || game.version !== next.version;
  game = next;
  if (changed) render();
}
async function action(value) {
  if (busy || !game) return;
  busy = true;
  render();
  try {
    const next = await api('/api/action', { action: value, expected_day: game.current_day, request_id: crypto.randomUUID() });
    game = next;
    if (value.type === 'speech') drafts[`speech-${game.current_day}`] = '';
    if (value.type === 'private_message') drafts[`private-${value.to}`] = '';
  } catch (error) { toast(error.message); }
  finally { busy = false; render(); }
}
async function newGame() {
  if (busy || (game && !window.confirm('开始新一局？当前页面将切换到新的游戏。'))) return;
  busy = true; render();
  try { game = await api('/api/games', {}); channel = 'public'; }
  catch (error) { toast(error.message); }
  finally { busy = false; render(); }
}
function islandMap() {
  const day = game?.current_day || 1;
  return `<div class="island-scene">
    <div class="scene-label"><span class="live-dot"></span>孤岛 · 北纬 18°<span class="scene-weather">${icon('sun', 15)}晴 · 第 ${day} 日</span></div>
    <svg class="island-map" viewBox="0 0 760 260" role="img" aria-label="孤岛示意图，标有淡水、庇护所与通讯塔三个任务地点">
      <defs><linearGradient id="land" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#527165"/><stop offset="1" stop-color="#294b43"/></linearGradient><radialGradient id="shore"><stop stop-color="#9baf8e"/><stop offset="1" stop-color="#718e77"/></radialGradient><pattern id="grid" width="38" height="38" patternUnits="userSpaceOnUse"><path d="M38 0H0v38" fill="none" stroke="#ffffff" stroke-opacity=".025"/></pattern><filter id="shadow"><feDropShadow dx="0" dy="9" stdDeviation="12" flood-opacity=".2"/></filter></defs>
      <rect width="760" height="260" fill="url(#grid)"/>
      <g fill="none" stroke="#60948f" opacity=".15"><path d="M120 170c-35-50 60-100 145-109s82-34 171-21 100 35 130 66 73 29 60 65-102 50-192 49-169 27-214 0-88-7-100-50Z"/><path d="M105 173c-34-67 63-117 153-127s90-35 186-22 105 37 136 70 82 37 62 81-110 59-203 59-172 27-225 0-96-11-109-61Z"/></g>
      <path d="M164 169c-31-42 42-82 114-90s72-38 152-23 88 34 116 61 56 24 47 49-83 40-166 38-136 29-182 5-66-10-81-40Z" fill="url(#shore)" filter="url(#shadow)"/>
      <path d="M183 161c-22-33 38-67 105-75s71-34 141-20 75 32 101 56 45 23 38 39-72 32-142 30-131 25-169 4-61-8-74-34Z" fill="url(#land)"/>
      <g fill="#25463c" stroke="#73907b" stroke-opacity=".45"><path d="m332 113 16-39 16 39-11-5v15h-11v-15Z"/><path d="m365 98 12-29 13 29-9-4v13h-8V94Z"/><path d="m390 120 18-42 18 42-12-5v18h-12v-18Z"/><path d="m304 142 12-27 12 27-8-3v12h-8v-12Z"/><path d="m431 144 13-31 13 31-9-4v14h-9v-14Z"/></g>
      <path d="M247 158q61 38 112 4t141-40" fill="none" stroke="#c2bc8a" stroke-width="1.4" stroke-dasharray="4 5" opacity=".7"/>
      <path d="m285 137-15-15 16-18 13 14-4 14 10 12-8 13-18-4Z" fill="#72a2a1" opacity=".7"/>
      <g class="map-location"><circle cx="246" cy="156" r="14" fill="#142c31" stroke="#8ebaaa"/><text x="246" y="161" text-anchor="middle" fill="#a8d2bf" font-size="12">A</text><path d="M230 163h-53l-13 18" stroke="#8ebaaa" opacity=".6" fill="none"/><text x="154" y="194" text-anchor="middle" fill="#b2cbc3" font-size="11">淡水源</text></g>
      <g class="map-location"><circle cx="365" cy="170" r="14" fill="#243532" stroke="#d5bc88"/><text x="365" y="175" text-anchor="middle" fill="#e5cc9d" font-size="12">B</text><path d="M367 186v24" stroke="#d5bc88" opacity=".6"/><text x="367" y="226" text-anchor="middle" fill="#d7c8a7" font-size="11">庇护所</text></g>
      <g class="map-location"><circle cx="505" cy="122" r="14" fill="#243532" stroke="#9baccc"/><text x="505" y="127" text-anchor="middle" fill="#bdcbe2" font-size="12">C</text><path d="M517 115h53l11-18" stroke="#9baccc" opacity=".6" fill="none"/><text x="594" y="87" text-anchor="middle" fill="#b9c7db" font-size="11">通讯塔</text></g>
      <g transform="translate(692 47)" fill="none" stroke="#91aaa7" opacity=".5"><circle r="15"/><path d="M0-22v44m-22-22h44"/><path d="m0-10 4 10-4-2-4 2Z" fill="#91aaa7"/><text y="-27" text-anchor="middle" fill="#91aaa7" stroke="none" font-size="9">N</text></g>
      <g fill="none" stroke="#87a9aa" opacity=".25"><path d="M45 90q8-5 16 0t16 0m-10 8q8-5 16 0t16 0M623 205q8-5 16 0t16 0m-7 9q8-5 16 0t16 0"/></g>
    </svg><div class="scene-bottom"><span>四位幸存者，一座孤岛</span><span>ISLAND 01 / SURVIVAL ZONE</span></div></div>`;
}
function roleCards() {
  const players = game?.players || Object.keys(colors).map(id => ({ id, name: names[id], gold_units: 120 }));
  const latest = game?.round_results.at(-1);
  return players.map(p => {
    const change = latest ? p.gold_units - (game.round_results.length > 1 ? game.round_results.at(-2).public_gold_balances[p.id] : 120) : 0;
    const current = game?.current_speaker === p.id;
    return `<article class="role-card ${current ? 'speaking' : ''}" style="--role-color:${colors[p.id]}"><div class="role-top">${avatar(p.id)}<div class="role-info"><h3>${p.id === 'P0' ? '你' : esc(p.name)}<span>${p.id === 'P0' ? 'HUMAN' : p.id}</span></h3><p>${p.id === 'P0' ? '每一次选择，都有代价' : esc(config.models[p.id] || '')}</p></div>${current ? '<span class="speaking-tag">发言中</span>' : ''}</div><div class="role-bottom"><div><span class="coin-mark">◈</span><strong>${money(p.gold_units)}</strong><small>金币</small></div><span class="${change >= 0 ? 'positive' : 'negative'}">${latest ? signed(change) : p.id === 'P0' ? '你的资产' : ['','合作型','计算型','机会主义型'][Number(p.id[1])]}</span></div></article>`;
  }).join('');
}
function taskCards() {
  return ['A', 'B', 'C'].map((id, i) => {
    const members = Object.entries(game?.registrations || {}).filter(([, task]) => task === id).map(([playerId]) => playerId);
    const selected = game?.registrations.P0 === id;
    const selectable = game?.phase === 'REGISTRATION';
    return `<button class="task-card task-${id} ${selected ? 'selected' : ''}" data-action="register" data-task="${id}" ${!selectable || busy ? 'disabled' : ''} aria-pressed="${selected}"><div class="task-card-top"><span class="task-symbol">${icon(['water','shelter','radio'][i], 26)}</span><span class="task-kind">${['独立行动','双人合作','三人合作'][i]}</span><span class="task-letter">${id}</span></div><h3>${taskNames[id]}</h3><p class="task-desc">${['沿溪寻找淡水，稳妥地度过一天。','合力搭起屋檐，分担风雨与成本。','重启岛上信号，让合作创造更多。'][i]}</p><div class="task-metrics"><div><small>${id === 'A' ? '固定净收益' : '奖池倍率'}</small><strong>${['+2','×1.5','×2'][i]}<span>${id === 'A' ? '金币' : ''}</span></strong></div><div><small>${id === 'A' ? '投入要求' : '全队投入门槛'}</small><strong>${['0','10','30'][i]}<span>金币</span></strong></div></div><div class="task-footer"><span>${id === 'A' ? '不限人数' : `需要 ${i + 1} 人 · 奖金平分`}</span><span>${members.length ? members.map(member => `<i style="color:${colors[member]}">${names[member]}</i>`).join(' · ') : '尚未报名'}</span></div>${selectable ? `<span class="select-task">${selected ? '✓ 已选择此任务' : '选择任务 ' + id}</span>` : ''}</button>`;
  }).join('');
}
function phaseAction() {
  if (!game) return `<section class="action-panel welcome"><div><span class="eyebrow">YOUR STORY STARTS HERE</span><h2>八日之间，信任有价。</h2><p>与三位独立思考的 AI 幸存者谈判、组队，争夺最后的财富。</p></div><button class="primary" data-action="new" ${busy ? 'disabled' : ''}>${busy ? '正在抵达…' : '开始一场博弈'} ${icon('arrow', 18)}</button></section>`;
  const phase = game.phase;
  const me = game.players[0];
  const thinking = game.thinking.map(id => names[id]).join('、');
  const waiting = `<div class="waiting"><span class="pulse-ring"></span><span>${thinking ? `${esc(thinking)}正在思考…` : '等待其他角色完成行动…'}</span></div>`;
  let content = '';
  if (['NEGOTIATION','VOTE_SPEECH'].includes(phase)) {
    content = game.current_speaker === 'P0' ? `<p>轮到你了。可以提出组队方案、承诺投入，或回应其他幸存者。</p><button class="primary" data-action="focus-public">前往公共频道发言 ${icon('arrow', 17)}</button>` : `<p>当前由${names[game.current_speaker]}发言。你可以阅读公共消息，或在私聊中联系其他角色。</p>${waiting}`;
  } else if (phase === 'REGISTRATION') {
    const all = game.players.every(p => game.registrations[p.id]);
    const pending = game.thinking.length || game.registration_review_pending;
    content = `<p>点击上方任务卡报名。截止前可修改，也可以私聊后请 Agent 重新考虑。人数不足或被淘汰都将失去当日收入。</p><div class="action-row"><span>${game.registrations.P0 ? `你的选择：${taskNames[game.registrations.P0]}` : '你还没有选择任务'}${pending ? ' · Agent 正在评估' : ''}</span><button class="primary" data-action="lock" ${!all || pending || busy ? 'disabled' : ''}>锁定全体报名 ${icon('lock', 16)}</button></div><button class="reconsider-button" data-action="reconsider" ${!all || pending || busy || game.registration_reviews_remaining <= 0 ? 'disabled' : ''}>请 Agent 重新评估报名 <small>今日剩余 ${game.registration_reviews_remaining} 次</small></button>`;
  } else if (phase === 'VOTE_SUBMISSION') {
    if (!game.vote_session.candidate_ids.includes('P0')) content = `<p>你不在本轮候选人中。投票完成后，结果将统一公开。</p>${waiting}`;
    else if (game.my_vote) content = `<p>你的淘汰票已锁定，目标为${names[game.my_vote]}。其他人的选票仍然保密。</p>${waiting}`;
    else content = `<form data-form="vote"><p>选择一名候选人淘汰。不能自投或弃票，提交后不可修改。</p><div class="vote-options">${game.vote_session.candidate_ids.filter(id => id !== 'P0').map(id => `<label><input type="radio" name="target" value="${id}" required>${avatar(id, true)}<span>${names[id]}</span></label>`).join('')}</div><button class="primary" ${busy ? 'disabled' : ''}>锁定秘密投票 ${icon('lock', 16)}</button></form>`;
  } else if (phase === 'INVESTMENT_SUBMISSION') {
    const task = Object.keys(game.active_teams).find(id => game.active_teams[id].includes('P0'));
    if (!task) content = `<p>${game.registration_status.P0 === 'eliminated' ? '你已被淘汰，本日净收益为 0。' : game.registration_status.P0 === 'insufficient_members' ? '你的任务人数不足，本日无任务收入。' : '你的淡水任务将在当天统一结算，固定获得 2 金币。'} 多人队伍正在秘密投入。</p>${waiting}`;
    else if (game.my_investment !== null) content = `<p>你的投入已锁定为 <b>${game.my_investment} 金币</b>，其他队员完成提交后统一结算。</p>${waiting}`;
    else {
      const max = Math.floor(me.gold_units / 12);
      const defaultAmount = Math.min(max, task === 'B' ? 5 : 10);
      const value = drafts[`investment-${game.current_day}`] ?? defaultAmount;
      content = `<form data-form="invest"><p>你已加入${taskNames[task]}。全队至少投入 ${task === 'B' ? 10 : 30} 金币才成功，失败不退还投入。</p><div class="investment-input"><label for="investment">你的秘密投入</label><div><input id="investment" data-draft="investment-${game.current_day}" type="number" name="amount" min="0" max="${max}" step="1" value="${esc(value)}" required><span>/ ${max} 可用</span></div></div><div class="action-row"><small>${icon('lock', 13)}提交后不可修改，队友无法提前查看</small><button class="primary" ${busy ? 'disabled' : ''}>锁定投入 ${icon('arrow', 16)}</button></div></form>`;
    }
  } else if (phase === 'ROUND_UPDATE') content = `<p>今日所有任务已完成。下方可查看你的详细结算与公开金币走势。</p><button class="primary" data-action="next">进入第 ${game.current_day + 1} 天 ${icon('arrow', 17)}</button>`;
  else content = `<p>八天结束，${game.ranking.filter(p => p.rank === 1).map(p => p.id === 'P0' ? '你' : p.name).join('、')}${game.ranking.filter(p => p.rank === 1).length > 1 ? '并列获胜' : '获得胜利'}。每一次承诺与选择，都留在了这座岛上。</p><button class="primary" data-action="new">再赴孤岛 ${icon('arrow', 17)}</button>`;
  const order = phase === 'NEGOTIATION' ? game.negotiation_order : phase === 'VOTE_SPEECH' ? game.vote_session.candidate_ids : [];
  const turnOrder = order.length ? `<div class="turn-order"><span>发言顺序</span>${order.map(id => `<b class="${id === game.current_speaker ? 'current' : ''}">${id === 'P0' ? '你' : names[id]}</b>`).join('<i>→</i>')}</div>` : '';
  return `<section class="action-panel"><div class="section-heading"><h2>${icon(phase === 'FINISHED' ? 'flag' : 'compass', 20)}${labels[phase]}</h2><span class="subtle">${phase === 'VOTE_SPEECH' || phase === 'VOTE_SUBMISSION' ? `第 ${game.vote_session.vote_round} 轮淘汰` : 'DAY ' + String(game.current_day).padStart(2, '0')}</span></div>${turnOrder}${content}</section>`;
}
function messageMarkup(m) {
  if (m.from === 'SYSTEM') return `<div class="system-message"><span>DAY ${m.day}</span>${esc(m.text)}</div>`;
  const promise = game.promises.find(p => p.message_id === m.id);
  return `<article class="chat-message ${m.from === 'P0' ? 'own' : ''}">${avatar(m.from, true)}<div class="message-body"><div class="message-meta"><b>${m.from === 'P0' ? '你' : names[m.from]}</b><span>第 ${m.day} 天${m.to ? ' · 私聊' : m.kind === 'vote_speech' ? ' · 淘汰发言' : ''}</span></div><p>${esc(m.text)}${promise ? `<span class="promise-badge">公开承诺 · ${promise.task_id} 任务投入 ${promise.amount} 金币</span>` : ''}</p></div></article>`;
}
function chatPanel() {
  const messages = (game?.messages || []).filter(m => channel === 'public' ? !m.to : m.to && (m.from === channel || m.to === channel));
  const canSpeak = game && ['NEGOTIATION','VOTE_SPEECH'].includes(game.phase) && game.current_speaker === 'P0';
  const privateAllowed = game && game.phase !== 'FINISHED';
  const key = channel === 'public' ? `speech-${game?.current_day || 1}` : `private-${channel}`;
  const allowed = channel === 'public' ? canSpeak : privateAllowed;
  return `<aside class="chat-panel"><div class="chat-heading"><h2>${icon('chat', 20)}幸存者频道</h2><span class="channel-tag">${channel === 'public' ? '公开' : icon('lock', 12) + ' 私密'}</span></div><div class="chat-tabs" role="tablist" aria-label="聊天频道"><button role="tab" aria-selected="${channel === 'public'}" data-channel="public">公共频道${canSpeak ? '<i></i>' : ''}</button>${['P1','P2','P3'].map(id => `<button role="tab" aria-selected="${channel === id}" data-channel="${id}">${names[id]}</button>`).join('')}</div><div class="channel-description">${channel === 'public' ? '四名幸存者共享消息。承诺可以被违背。' : `仅你与${names[channel]}可见，对方将在下次行动时处理私信。`}</div><div id="chat-feed" class="chat-feed" aria-live="polite" aria-relevant="additions">${messages.length ? messages.map(messageMarkup).join('') : `<div class="chat-empty">${icon('chat', 36)}<h3>${game ? '还没有消息' : '故事从一句话开始'}</h3><p>${game ? '试着联系一位幸存者，提出你的计划。' : '开始游戏后，与三名 Agent 共同商量任务。谁会兑现承诺，由你判断。'}</p></div>`}</div><form data-form="chat" class="chat-composer"><label class="sr-only" for="chat-input">${channel === 'public' ? '公开发言' : '私人消息'}</label><textarea id="chat-input" data-draft="${key}" name="message" maxlength="1000" rows="3" ${!allowed || busy ? 'disabled' : ''} placeholder="${!game ? '开始游戏，加入协商…' : channel !== 'public' ? `发给${names[channel]}的私信…` : canSpeak ? '说出你的计划，或回应他人的承诺…' : game.phase === 'FINISHED' ? '这段航程已经结束' : '轮到你时可以公开发言…'}">${esc(drafts[key] || '')}</textarea>${channel === 'public' && canSpeak ? `<div class="promise-row"><label for="promise-task">公开承诺</label><select id="promise-task" data-draft="promise-task" name="promise_task"><option value="">不记录金额</option><option value="B" ${drafts['promise-task'] === 'B' ? 'selected' : ''}>B 庇护所</option><option value="C" ${drafts['promise-task'] === 'C' ? 'selected' : ''}>C 通讯塔</option></select><input aria-label="承诺投入金额" data-draft="promise-amount" name="promise_amount" type="number" min="0" max="${Math.floor(game.players[0].gold_units / 12)}" step="1" placeholder="金币" value="${esc(drafts['promise-amount'] || '')}"></div>` : ''}<div class="composer-footer"><span>${channel === 'public' ? 'Ctrl / ⌘ + Enter 发送' : icon('lock', 12) + ' 仅双方可见'}</span><button class="send-button" ${!allowed || busy ? 'disabled' : ''} aria-label="${channel === 'public' ? '提交公开发言' : '发送私信'}">${busy ? '提交中' : '发送'} ${icon('arrow', 15)}</button></div></form></aside>`;
}
function chart() {
  if (!game?.round_results.length) return '';
  const history = [{ day: 0, public_gold_balances: { P0: 120, P1: 120, P2: 120, P3: 120 } }, ...game.round_results];
  const maximum = Math.max(144, ...history.flatMap(r => Object.values(r.public_gold_balances)));
  const x = index => 45 + index * 600 / 8;
  const y = value => 160 - value / maximum * 130;
  return `<section class="history-card"><div class="section-heading"><h2>公开金币走势</h2><div class="chart-legend">${Object.keys(colors).map(id => `<span style="--role-color:${colors[id]}"><i></i>${id === 'P0' ? '你' : names[id]}</span>`).join('')}</div></div><svg class="gold-chart" viewBox="0 0 680 200" role="img" aria-label="各角色八天的公开金币趋势">${[0, 0.5, 1].map(n => `<path d="M45 ${y(maximum * n)}H650" stroke="#263a40" stroke-dasharray="3 5"/><text x="34" y="${y(maximum * n) + 4}" text-anchor="end" fill="#7d9297" font-size="10">${money(maximum * n)}</text>`).join('')}${Object.keys(colors).map(id => `<polyline points="${history.map((r, i) => `${x(i)},${y(r.public_gold_balances[id])}`).join(' ')}" fill="none" stroke="${colors[id]}" stroke-width="2"/>${history.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.public_gold_balances[id])}" r="3" fill="${colors[id]}"><title>第 ${r.day} 天 · ${names[id]} ${money(r.public_gold_balances[id])} 金币</title></circle>`).join('')}`).join('')}${Array.from({ length: 9 }, (_, i) => `<text x="${x(i)}" y="185" text-anchor="middle" fill="#81969b" font-size="10">${i === 0 ? '起始' : 'D' + i}</text>`).join('')}</svg></section>`;
}
function settlement(result) {
  const s = result.my_settlement;
  return `<div class="settlement-summary"><span class="result-badge ${s && !s.success ? 'failed' : ''}">${s ? s.success ? '任务成功' : '任务失败' : result.registrations.P0 === 'A' ? '淡水收集完成' : statusNames[result.registration_status.P0] || '本日无任务'}</span><strong class="${result.my_net_change_units >= 0 ? 'positive' : 'negative'}">${signed(result.my_net_change_units)}<small>金币</small></strong></div>${s ? `<div class="settlement-meta"><span>全队投入 <b>${s.total_investment}</b></span><span>奖池 <b>${money(s.reward_pool_units)}</b></span><span>每人分得 <b>${money(s.reward_per_player_units)}</b></span></div><table class="settlement-table"><thead><tr><th>队员</th><th>实际投入</th><th>净收益</th></tr></thead><tbody>${s.member_ids.map(id => `<tr><td>${id === 'P0' ? '你' : names[id]}</td><td>${s.investments[id]}.00</td><td class="${s.net_changes_units[id] >= 0 ? 'positive' : 'negative'}">${signed(s.net_changes_units[id])}</td></tr>`).join('')}</tbody></table>` : `<p class="subtle">${result.registrations.P0 === 'A' ? '任务 A 无需投入，每名执行者独立获得 2 金币。' : '报名不足或被淘汰者当日收益为 0，不自动转入任务 A。'}</p>`}`;
}
function results() {
  if (!game?.round_results.length) return '';
  const latest = game.round_results.at(-1);
  const finished = game.phase === 'FINISHED';
  return `${finished ? `<section class="ranking-card"><div class="section-heading"><h2>${icon('flag', 20)}最终排名</h2><span class="eyebrow">AFTER EIGHT DAYS</span></div><div class="statistics"><span>任务成功 <b>${game.players[0].statistics.success}</b> 次</span><span>任务失败 <b>${game.players[0].statistics.failure}</b> 次</span><span>投票淘汰 <b>${game.players[0].statistics.eliminated}</b> 次</span></div>${game.ranking.map(p => `<div class="ranking-row ${p.rank === 1 ? 'winner' : ''}"><span class="rank-number">${String(p.rank).padStart(2,'0')}</span>${avatar(p.id, true)}<span class="rank-name">${p.id === 'P0' ? '你' : p.name}${p.rank === 1 ? '<small>获胜者</small>' : ''}</span><strong>${money(p.gold_units)}<small>金币</small></strong></div>`).join('')}</section>` : ''}<section class="settlement-card"><div class="section-heading"><h2>你的第 ${latest.day} 天</h2><span class="subtle">${icon('lock', 13)}队内明细</span></div>${settlement(latest)}${game.diagnostics.length ? `<div class="fallback-notice">${game.diagnostics.map(d => `${names[d.actor_id]}的模型调用异常（${esc(d.code)}），该次已使用规则规定的合法兜底。`).join(' ')}</div>` : ''}</section>${chart()}${game.round_results.length > 1 ? `<section class="history-card"><div class="section-heading"><h2>你的历史记录</h2><span class="subtle">仅展示你有权限查看的内容</span></div>${game.round_results.slice(0,-1).reverse().map(r => `<details><summary><span>第 ${r.day} 天 · ${taskNames[r.registrations.P0]}</span><span class="${r.my_net_change_units >= 0 ? 'positive' : 'negative'}">${signed(r.my_net_change_units)}</span></summary>${settlement(r)}</details>`).join('')}</section>` : ''}${game.vote_results.length ? `<section class="history-card"><div class="section-heading"><h2>公开投票记录</h2></div>${game.vote_results.map(v => `<details><summary><span>第 ${v.day} 天 · ${v.task_id} · 第 ${v.vote_round} 轮</span><span>${names[v.eliminated_id]}出局</span></summary><p class="subtle">${Object.entries(v.votes).map(([from,to]) => `${names[from]} → ${names[to]}`).join('；')}${v.tied_ids.length ? '。最高票平票，随机淘汰。' : ''}</p></details>`).join('')}</section>` : ''}`;
}
function render() {
  const active = document.activeElement;
  const focused = active?.dataset?.draft;
  const selection = focused && active.type !== 'number' ? [active.selectionStart, active.selectionEnd] : null;
  const feed = $('#chat-feed');
  const nearBottom = !feed || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 70;
  const oldScroll = feed?.scrollTop || 0;
  const pageScroll = window.scrollY;
  const day = game?.current_day || 1;
  root.innerHTML = `<header class="topbar"><a class="brand" href="/">${icon('compass',34)}<span><b>孤岛协议</b><small>ISLAND PROTOCOL</small></span></a><div class="topbar-right"><span class="connection"><i class="${config.configured ? '' : 'offline'}"></i>${config.configured ? '模型网关已配置' : '模型网关未配置'}</span><button class="text-button" data-action="rules">游戏规则</button>${game ? '<button class="outline-button" data-action="new">新航程 ' + icon('arrow',14) + '</button>' : ''}</div></header><main><div class="page-intro"><div><span class="eyebrow">COOPERATION. TRUST. SURVIVAL.</span><h1>${game?.phase === 'FINISHED' ? '航程结束，故事留下。' : '欢迎来到孤岛。'}</h1><p>${game ? '财富有限，选择自由。你愿意把信任交给谁？' : '八天，四名幸存者。合作的收益，未必公平地属于每个人。'}</p></div><div class="day-progress"><div><span>生存日程</span><b>${String(day).padStart(2,'0')}<small>/ 08</small></b></div><div class="day-dots">${Array.from({ length: 8 },(_,i) => `<span class="${i + 1 === day ? 'current' : i + 1 < day ? 'done' : ''}">${i + 1}</span>`).join('')}</div></div></div><section class="roles" aria-label="幸存者资产">${roleCards()}</section><div class="game-grid"><div class="board"><section class="mission-area"><div class="section-heading"><h2>${icon('compass',20)}今日岛屿任务</h2><span class="phase-tag">${game ? labels[game.phase] : '等待登陆'}</span></div>${islandMap()}<div class="tasks">${taskCards()}</div></section>${phaseAction()}${results()}<footer class="board-footer"><span>合作创造财富，信任决定赢家。</span><span>ISLAND PROTOCOL · V0.1</span></footer></div>${chatPanel()}</div></main>`;
  if (focused) {
    const next = [...document.querySelectorAll('[data-draft]')].find(el => el.dataset.draft === focused);
    if (next && !next.disabled) { next.focus({ preventScroll: true }); if (selection && next.setSelectionRange) { try { next.setSelectionRange(...selection); } catch {} } }
  }
  const nextFeed = $('#chat-feed');
  if (nextFeed) nextFeed.scrollTop = nearBottom ? nextFeed.scrollHeight : oldScroll;
  window.scrollTo({ top: pageScroll, behavior: 'instant' });
}
root.addEventListener('input', event => { if (event.target.dataset.draft) drafts[event.target.dataset.draft] = event.target.value; });
root.addEventListener('change', event => { if (event.target.dataset.draft) drafts[event.target.dataset.draft] = event.target.value; });
root.addEventListener('click', event => {
  const tab = event.target.closest('[data-channel]');
  if (tab) { channel = tab.dataset.channel; render(); return; }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const kind = button.dataset.action;
  if (kind === 'new') newGame();
  else if (kind === 'register') action({ type: 'register', task_id: button.dataset.task });
  else if (kind === 'lock') action({ type: 'lock_registration' });
  else if (kind === 'reconsider') action({ type: 'reconsider_registrations' });
  else if (kind === 'next') action({ type: 'next_day' });
  else if (kind === 'rules') $('#rules-dialog').showModal();
  else if (kind === 'focus-public') { channel = 'public'; render(); $('#chat-input').focus(); $('#chat-input').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
});
root.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  if (form.dataset.form === 'chat') {
    const message = String(data.get('message') || '').trim();
    if (!message) return toast('请先输入消息');
    if (channel !== 'public') return action({ type: 'private_message', to: channel, message });
    const promiseTask = data.get('promise_task');
    const amount = data.get('promise_amount');
    if (promiseTask && amount === '') return toast('请填写承诺投入的金额');
    action({ type: 'speech', message, ...(promiseTask ? { promise: { task_id: promiseTask, amount: Number(amount) } } : {}) });
  } else if (form.dataset.form === 'vote') action({ type: 'vote', target_id: data.get('target') });
  else if (form.dataset.form === 'invest') action({ type: 'invest', amount: Number(data.get('amount')) });
});
root.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && event.target.tagName === 'TEXTAREA') { event.preventDefault(); event.target.closest('form').requestSubmit(); } });
$('#close-rules').addEventListener('click', () => $('#rules-dialog').close());
$('#rules-dialog').addEventListener('click', event => { if (event.target === $('#rules-dialog')) $('#rules-dialog').close(); });
async function poll() {
  if (polling || document.hidden) return;
  polling = true;
  try { accept(await api('/api/state')); }
  catch (error) { if (error.status === 401 && !game) render(); }
  finally { polling = false; }
}
try { config = await api('/api/config'); }
catch { toast('暂时无法连接服务，请确认本地服务器已启动'); }
render();
await poll();
setInterval(poll, 1300);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
