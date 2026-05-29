'use strict';

const API = '/api/v1';
const $ = (s) => document.querySelector(s);

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin',
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.title || `HTTP ${res.status}`);
  return data;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function initials(n) { return (n || '?').trim().slice(0, 2).toUpperCase(); }

// ─── state ───
let me = null, userMap = {}, projects = [], currentProjectId = null, allSuggestions = [], boardTasks = [];
let chatSocket = null, chatSession = null;

const STATUSES = [
  { id: 'todo', name: '待办' }, { id: 'in_progress', name: '进行中' },
  { id: 'blocked', name: '阻塞' }, { id: 'review', name: '评审' }, { id: 'done', name: '完成' },
];
const STATUS_NAME = Object.fromEntries(STATUSES.map((s) => [s.id, s.name]));
const PRIO = { 0: ['low', ''], 1: ['normal', ''], 2: ['high', '高'], 3: ['urgent', '紧急'] };
const NEXT = {
  todo: [['in_progress', '开始']], in_progress: [['review', '提交评审'], ['done', '完成'], ['blocked', '阻塞']],
  blocked: [['in_progress', '解除阻塞']], review: [['done', '完成'], ['in_progress', '退回']], done: [['archived', '归档']], archived: [['todo', '恢复']],
};
const SUG_LABEL = { decompose: '任务拆解', create_task: '创建任务', assign: '分配建议' };

// ─── auth ───
let registerMode = false;
function setMode(reg) {
  registerMode = reg;
  $('#nameField').style.display = reg ? 'block' : 'none';
  $('#loginTitle').textContent = reg ? '创建账号' : '欢迎回来';
  $('#loginSub').textContent = reg ? '用公司邮箱注册' : '登录到 Team Platform';
  $('#loginBtn').textContent = reg ? '注 册' : '登 录';
  $('#toggleText').textContent = reg ? '已有账号？' : '还没有账号？';
  $('#toggleMode').textContent = reg ? '登录' : '注册';
  $('#loginErr').textContent = '';
}
$('#toggleMode').onclick = () => setMode(!registerMode);
$('#loginBtn').onclick = async () => {
  const email = $('#email').value.trim(), password = $('#password').value, display_name = $('#dispName').value.trim();
  $('#loginErr').textContent = '';
  try {
    if (registerMode) await api('/auth/register', { method: 'POST', body: { email, password, display_name } });
    await api('/auth/login', { method: 'POST', body: { email, password } });
    await boot();
  } catch (e) { $('#loginErr').textContent = e.message; }
};
$('#password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#loginBtn').click(); });
$('#logoutBtn').onclick = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch {} if (chatSocket) chatSocket.close(); location.reload(); };

// ─── boot ───
async function boot() {
  try { me = await api('/auth/me'); } catch { $('#login').style.display = 'grid'; $('#app').classList.remove('active'); return; }
  $('#login').style.display = 'none'; $('#app').classList.add('active');
  $('#whoName').textContent = me.display_name; $('#meAvatar').textContent = initials(me.display_name);
  $('#pmPill').style.display = me.is_pm ? 'inline' : 'none';
  $('#navCost').style.display = me.is_pm ? 'flex' : 'none';
  $('#navAdmin').style.display = me.is_admin ? 'flex' : 'none';
  await loadUsers(); await loadProjects(); await loadSuggestions(); updateNotifBadge(); await initChat();
}
async function loadUsers() { try { const r = await api('/users'); (Array.isArray(r) ? r : r.items || []).forEach((u) => userMap[u.id] = u.display_name); } catch {} }

// ─── center view switching ───
const VIEWS = ['emptyState', 'projectView', 'suggestionsView', 'notificationsView', 'costView', 'adminView'];
function showView(id) {
  VIEWS.forEach((v) => $('#' + v).style.display = v === id ? 'block' : 'none');
  $('#navSuggestions').classList.toggle('active-nav', id === 'suggestionsView');
  $('#navNotifications').classList.toggle('active-nav', id === 'notificationsView');
  $('#navCost').classList.toggle('active-nav', id === 'costView');
  $('#navAdmin').classList.toggle('active-nav', id === 'adminView');
  if (id !== 'projectView') { currentProjectId = null; document.querySelectorAll('.proj-item').forEach((el) => el.classList.remove('active')); }
  if (window.innerWidth <= 760) $('#sidebar').classList.remove('open');
}

// ─── projects (sidebar) ───
async function loadProjects(selectId) {
  try { projects = await api('/projects'); } catch (e) { toast(e.message); projects = []; }
  const list = $('#projectList'); list.innerHTML = '';
  projects.forEach((p) => {
    const el = document.createElement('button');
    el.className = 'proj-item' + (p.id === currentProjectId ? ' active' : '');
    el.innerHTML = `<span class="pdot"></span><span class="pname">${escapeHtml(p.name)}</span><span class="pcount">${p.task_count}</span>`;
    el.onclick = () => selectProject(p.id);
    list.appendChild(el);
  });
  if (selectId) selectProject(selectId);
}
function selectProject(id) {
  currentProjectId = id;
  showView('projectView');
  document.querySelectorAll('.proj-item').forEach((el, i) => el.classList.toggle('active', projects[i] && projects[i].id === id));
  const p = projects.find((x) => x.id === id); if (!p) return;
  $('#pvName').textContent = p.name;
  $('#pvMeta').textContent = `${p.task_count} 个任务 · 完成 ${Math.round(p.completion * 100)}%`;
  switchTab('board');
}
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  ['board', 'plan', 'share'].forEach((t) => $(`#tab-${t}`).style.display = t === tab ? 'block' : 'none');
  if (tab === 'board') loadBoard();
  else if (tab === 'share') loadShare();
  else if (tab === 'plan') { renderPlanSuggestions(); renderPlanImplHints(); }
}
document.querySelectorAll('.tab').forEach((t) => t.onclick = () => switchTab(t.dataset.tab));

// ─── board ───
async function loadBoard() {
  try { boardTasks = await api(`/projects/${currentProjectId}/tasks`); } catch (e) { toast(e.message); boardTasks = []; }
  const childCount = {};
  boardTasks.forEach((t) => { if (t.parent_task_id) childCount[t.parent_task_id] = (childCount[t.parent_task_id] || 0) + 1; });
  const board = $('#board'); board.innerHTML = '';
  for (const col of STATUSES) {
    const items = boardTasks.filter((t) => t.status === col.id);
    const el = document.createElement('div'); el.className = 'col';
    el.innerHTML = `<div class="col-head"><span class="dot ${col.id}"></span><span class="name">${col.name}</span><span class="count">${items.length}</span></div>`;
    if (!items.length) el.insertAdjacentHTML('beforeend', `<div class="col-empty">—</div>`);
    items.forEach((t, i) => el.appendChild(card(t, i, childCount[t.id] || 0)));
    board.appendChild(el);
  }
  renderArchivedFold(boardTasks.filter((t) => t.status === 'archived'), childCount);
}
function renderArchivedFold(archived, childCount) {
  const fold = $('#archivedFold'); fold.innerHTML = '';
  if (!archived.length) return;
  const head = document.createElement('button');
  head.className = 'arch-head';
  head.innerHTML = `<span class="arch-arrow">▶</span>已归档 (${archived.length})`;
  const body = document.createElement('div'); body.className = 'arch-body';
  archived.forEach((t, i) => body.appendChild(card(t, i, childCount[t.id] || 0)));
  head.onclick = () => { head.classList.toggle('open'); body.classList.toggle('open'); };
  fold.appendChild(head); fold.appendChild(body);
}
function card(t, i, nChildren) {
  const el = document.createElement('div'); el.className = 'card'; el.style.animationDelay = (i * 0.03) + 's';
  const isAI = (t.created_by || '').startsWith('ai_auto');
  const ownerName = t.owner_user_id ? (userMap[t.owner_user_id] || '成员') : null;
  const [pcls, plabel] = PRIO[t.priority] || PRIO[1];
  const bits = [];
  if (ownerName) bits.push(`<span class="owner"><span class="avatar">${initials(ownerName)}</span>${escapeHtml(ownerName)}</span>`); else bits.push('<span>未认领</span>');
  if (t.estimated_hours) bits.push(`<span class="est">${t.estimated_hours}h</span>`);
  if (nChildren) bits.push(`<span class="subc">◧ ${nChildren} 子任务</span>`);
  if (plabel) bits.push(`<span class="prio ${pcls}">${plabel}</span>`);
  if (isAI) bits.push('<span class="ai-tag">AI</span>');
  el.innerHTML = `<div class="ctitle">${escapeHtml(t.title)}</div>${t.description ? `<div class="cdesc">${escapeHtml(t.description)}</div>` : ''}<div class="cmeta">${bits.join('')}</div><div class="actions"></div>`;
  const actions = el.querySelector('.actions');
  const addBtn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = (e) => { e.stopPropagation(); fn(); }; actions.appendChild(b); };
  if (!t.owner_user_id) addBtn('认领', () => claim(t.id));
  (NEXT[t.status] || []).forEach(([to, label]) => addBtn(label, () => move(t.id, to)));
  el.onclick = () => openTaskDetail(t, nChildren);
  return el;
}
async function claim(id) {
  try {
    await api(`/tasks/${id}/claim`, { method: 'POST' });
    toast('已认领'); updateNotifBadge(); loadBoard(); refreshProjMeta();
    // auto AI implementation hint for the claimed leaf task (附录 I.2) — async, refresh when ready
    api(`/tasks/${id}/impl-hint`, { method: 'POST' })
      .then((r) => { if (r && r.impl_hint && !r.skipped) { toast('AI 已给出实现思路（见 AI 方案）'); loadBoard(); if ($('#tab-plan').style.display === 'block') renderPlanImplHints(); } })
      .catch(() => {});
  } catch (e) { toast(e.message); }
}
async function move(id, to) { try { await api(`/tasks/${id}`, { method: 'PATCH', body: { status: to } }); loadBoard(); refreshProjMeta(); } catch (e) { toast(e.message); } }
async function refreshProjMeta() { try { const p = await api(`/projects/${currentProjectId}`); const idx = projects.findIndex((x) => x.id === p.id); if (idx >= 0) projects[idx] = p; $('#pvMeta').textContent = `${p.task_count} 个任务 · 完成 ${Math.round(p.completion * 100)}%`; const item = document.querySelectorAll('.proj-item')[idx]; if (item) item.querySelector('.pcount').textContent = p.task_count; } catch {} }

// ─── task detail ───
function openTaskDetail(t, nChildren) {
  $('#tdStatus').textContent = STATUS_NAME[t.status] || t.status;
  $('#tdTitle').textContent = t.title;
  const owner = t.owner_user_id ? (userMap[t.owner_user_id] || '成员') : '未认领';
  const children = boardTasks.filter((x) => x.parent_task_id === t.id);
  const childHtml = children.length
    ? `<div class="td-field"><div class="lbl">子任务 (${children.length})</div>${children.map((c) => `<div class="td-sub"><span class="st-status">${STATUS_NAME[c.status]}</span>${escapeHtml(c.title)}${c.estimated_hours ? ` · ${c.estimated_hours}h` : ''}</div>`).join('')}</div>` : '';
  $('#tdBody').innerHTML = `
    ${t.description ? `<div class="td-field"><div class="lbl">描述</div><div class="val">${escapeHtml(t.description)}</div></div>` : '<div class="td-field"><div class="lbl">描述</div><div class="val" style="color:var(--text-3)">（无）</div></div>'}
    <div class="td-field"><div class="lbl">负责人</div><div class="val">${escapeHtml(owner)}</div></div>
    <div class="td-field"><div class="lbl">优先级 · 估时</div><div class="val">${(PRIO[t.priority] || PRIO[1])[0]}${t.estimated_hours ? ` · ${t.estimated_hours}h` : ''}</div></div>
    ${t.impl_hint ? `<div class="td-field"><div class="lbl">AI 实现思路</div><div class="val">${escapeHtml(t.impl_hint)}</div></div>` : ''}
    ${childHtml}`;
  const foot = $('#tdFoot'); foot.innerHTML = '';
  if (!t.owner_user_id) { const b = document.createElement('button'); b.className = 'btn btn-soft'; b.textContent = '认领'; b.onclick = async () => { await claim(t.id); $('#taskOverlay').classList.remove('show'); }; foot.appendChild(b); }
  (NEXT[t.status] || []).forEach(([to, label]) => { const b = document.createElement('button'); b.className = 'btn btn-ghost'; b.textContent = label; b.onclick = async () => { await move(t.id, to); $('#taskOverlay').classList.remove('show'); }; foot.appendChild(b); });
  const close = document.createElement('button'); close.className = 'btn btn-primary'; close.textContent = '关闭'; close.onclick = () => $('#taskOverlay').classList.remove('show'); foot.appendChild(close);
  $('#taskOverlay').classList.add('show');
}

// ─── share ───
function briefSections(b) {
  const list = (title, items, cls) => items && items.length
    ? `<div class="brief-sec ${cls}"><div class="brief-sec-t">${title}</div><ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : '';
  return `<div class="brief-summary">${escapeHtml(b.summary)}</div>`
    + list('进展亮点', b.highlights, 'hl')
    + list('阻塞与风险', b.risks, 'risk')
    + list('下一步', b.next_steps, 'next');
}
function fmtBriefTime(iso) { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString(); }

async function loadShare() {
  const body = $('#shareBody'); body.innerHTML = '<div class="plan-hint">加载中…</div>';
  let s; try { s = await api(`/projects/${currentProjectId}/share`); } catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  const p = s.project, pct = Math.round(p.completion * 100);
  const chips = STATUSES.map((c) => `<span class="chip">${c.name} ${s.status_counts[c.id] || 0}</span>`).join('');
  const byParent = {}, roots = [];
  s.tasks.forEach((t) => { if (t.parent_task_id) (byParent[t.parent_task_id] = byParent[t.parent_task_id] || []).push(t); else roots.push(t); });
  const row = (t, child) => `<div class="share-task ${child ? 'child' : ''}"><span class="st-status">${STATUS_NAME[t.status]}</span><span>${escapeHtml(t.title)}</span>${t.owner_user_id ? `<span class="avatar" style="margin-left:auto">${initials(userMap[t.owner_user_id] || '·')}</span>` : ''}</div>`;
  let flow = ''; roots.forEach((r) => { flow += row(r, false); (byParent[r.id] || []).forEach((ch) => flow += row(ch, true)); });
  // persisted brief (附录 H.4): show the latest if present, never auto-regenerate on open
  const hasBrief = !!s.brief;
  const briefBodyHtml = hasBrief ? briefSections(s.brief) : '<div class="plan-hint">点「生成简报」让 AI 汇总任务进展与成员投送的工作痕迹。</div>';
  const metaHtml = hasBrief ? `上次生成于 ${escapeHtml(fmtBriefTime(s.brief_generated_at))}` : '';
  body.innerHTML = `<div class="share-summary"><div class="big">${pct}%</div><div class="ws-meta">完成度 · ${p.done_count}/${p.task_count} 个任务</div><div class="progress-bar"><i style="width:${pct}%"></i></div><div class="status-chips">${chips}</div></div>`
    + `<div class="brief-card" id="briefCard"><div class="brief-head"><span class="section-title" style="font-size:15px">AI 进展简报</span><span id="briefMeta" style="font-size:12px;color:var(--text-3);margin-left:auto;margin-right:8px">${metaHtml}</span><button class="btn btn-soft btn-sm" id="briefGenBtn">${hasBrief ? '重新生成' : '生成简报'}</button></div><div class="brief-body" id="briefBody">${briefBodyHtml}</div></div>`
    + `<div class="section-title" style="font-size:15px;margin-bottom:10px">任务流程</div><div class="share-flow">${flow || '<div class="plan-hint">还没有任务。</div>'}</div>`;
  $('#briefGenBtn').onclick = generateBrief;
}

async function generateBrief() {
  const btn = $('#briefGenBtn'), bb = $('#briefBody');
  btn.disabled = true; btn.textContent = '生成中…';
  bb.innerHTML = '<div class="plan-hint">AI 正在汇总进展，请稍候…</div>';
  try {
    const b = await api(`/projects/${currentProjectId}/brief`, { method: 'POST' });
    bb.innerHTML = briefSections(b);
    const meta = $('#briefMeta'); if (meta) meta.textContent = '刚刚生成';
    btn.textContent = '重新生成';
  } catch (e) {
    bb.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`;
    btn.textContent = '生成简报';
  }
  btn.disabled = false;
}

// ─── suggestions (shared renderer) ───
function sugCard(s, onDone) {
  const ref = s.target_ref || {}; const text = ref.project_name || ref.title || (SUG_LABEL[s.suggestion_type] || s.suggestion_type);
  const el = document.createElement('div'); el.className = 'sug';
  const n = (ref.subtasks || []).length;
  el.innerHTML = `<div class="stype">${SUG_LABEL[s.suggestion_type] || s.suggestion_type} · ${Math.round(s.confidence * 100)}%${n ? ` · ${n} 子任务` : ''}</div><div class="stext">${escapeHtml(text)}</div><div class="sration">${escapeHtml(s.rationale || '')}</div><div class="sact"><button class="btn btn-primary btn-sm">接受</button><button class="btn btn-ghost btn-sm">拒绝</button></div>`;
  const [acc, rej] = el.querySelectorAll('button');
  acc.onclick = async () => { try { const r = await api(`/suggestions/${s.id}/accept`, { method: 'POST' }); toast(`已创建 ${r.created_tasks.length} 个任务`); await loadProjects(); await loadSuggestions(); updateNotifBadge(); onDone && onDone(); } catch (e) { toast(e.message); } };
  rej.onclick = async () => { try { await api(`/suggestions/${s.id}/reject`, { method: 'POST', body: { reason: 'rejected' } }); await loadSuggestions(); onDone && onDone(); } catch (e) { toast(e.message); } };
  return el;
}
async function loadSuggestions() {
  try { allSuggestions = (await api('/suggestions?status=pending')).items || []; } catch { allSuggestions = []; }
  const badge = $('#sugBadge'); badge.style.display = allSuggestions.length ? 'inline-grid' : 'none'; badge.textContent = allSuggestions.length;
  if ($('#suggestionsView').style.display === 'block') renderSuggestionsView();
  if ($('#tab-plan').style.display === 'block') renderPlanSuggestions();
}
function renderSuggestionsView() {
  $('#sugMeta').textContent = `${allSuggestions.length} 条待处理`;
  const body = $('#suggestionsBody'); body.innerHTML = '';
  if (!allSuggestions.length) { body.innerHTML = '<div class="empty-hint">没有待处理的建议。</div>'; return; }
  allSuggestions.forEach((s) => body.appendChild(sugCard(s, renderSuggestionsView)));
}
$('#navSuggestions').onclick = () => { showView('suggestionsView'); renderSuggestionsView(); };

function renderPlanSuggestions() {
  const mine = allSuggestions.filter((s) => (s.target_ref || {}).project_id === currentProjectId);
  const body = $('#planSuggestions'); body.innerHTML = '';
  if (!mine.length) { body.innerHTML = '<div class="plan-hint">本项目暂无待处理 AI 建议。补充拆解后会出现在这里。</div>'; return; }
  mine.forEach((s) => body.appendChild(sugCard(s, () => { renderPlanSuggestions(); loadBoard(); refreshProjMeta(); })));
}

// my claimed (leaf) tasks + their AI implementation hints (附录 I.2)
async function renderPlanImplHints() {
  const body = $('#planImplHints'); if (!body) return;
  let tasks; try { tasks = await api(`/projects/${currentProjectId}/tasks`); } catch { tasks = []; }
  const parents = new Set(tasks.filter((t) => t.parent_task_id).map((t) => t.parent_task_id));
  const mine = tasks.filter((t) => t.owner_user_id === me.id && !parents.has(t.id)); // my leaf tasks
  if (!mine.length) { body.innerHTML = '<div class="plan-hint">认领任务后，AI 会在这里给出实现思路。</div>'; return; }
  body.innerHTML = '';
  mine.forEach((t) => {
    const el = document.createElement('div'); el.className = 'ih-card';
    const hint = t.impl_hint ? `<div class="ih-text">${escapeHtml(t.impl_hint)}</div>` : '<div class="plan-hint">还没有思路，点右侧生成。</div>';
    el.innerHTML = `<div class="ih-head"><span class="ih-title">${escapeHtml(t.title)}</span><button class="btn btn-ghost btn-sm">${t.impl_hint ? '重新生成' : '生成思路'}</button></div>${hint}`;
    el.querySelector('button').onclick = async (e) => {
      const btn = e.target; btn.disabled = true; btn.textContent = '生成中…';
      try {
        const r = await api(`/tasks/${t.id}/impl-hint${t.impl_hint ? '?regenerate=true' : ''}`, { method: 'POST' });
        if (r.impl_hint && !r.skipped) renderPlanImplHints();
        else { btn.disabled = false; btn.textContent = t.impl_hint ? '重新生成' : '生成思路'; toast(r.skipped === 'not_leaf' ? '父任务不生成思路' : '已跳过'); }
      } catch (err) { btn.disabled = false; btn.textContent = '生成思路'; toast(err.message); }
    };
    body.appendChild(el);
  });
}

// ─── notifications inbox (附录 I.3, separate from AI suggestions) ───
async function updateNotifBadge() {
  try {
    const c = await api('/me/notifications/unread-count');
    const b = $('#notifBadge'); b.style.display = c.unread ? 'inline-grid' : 'none'; b.textContent = c.unread;
  } catch {}
}
async function loadNotifications() {
  showView('notificationsView');
  const body = $('#notificationsBody'); body.innerHTML = '<div class="plan-hint">加载中…</div>';
  let items; try { items = (await api('/me/notifications')).items || []; } catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  $('#notifMeta').textContent = `${items.length} 条`;
  if (!items.length) { body.innerHTML = '<div class="empty-hint">还没有通知。</div>'; return; }
  body.innerHTML = '';
  items.forEach((n) => {
    const el = document.createElement('div'); el.className = 'notif' + (n.read_at ? ' read' : '');
    el.innerHTML = `<div class="ntext">${escapeHtml(n.title)}</div><div class="nmeta">${escapeHtml(fmtBriefTime(n.created_at))}${n.read_at ? ' · 已读' : ''}</div>`;
    if (!n.read_at) {
      el.style.cursor = 'pointer';
      el.onclick = async () => { try { await api(`/me/notifications/${n.id}/read`, { method: 'POST' }); el.classList.add('read'); el.querySelector('.nmeta').textContent += ' · 已读'; el.onclick = null; updateNotifBadge(); } catch {} };
    }
    body.appendChild(el);
  });
}
$('#navNotifications').onclick = loadNotifications;

// ─── cost view ───
$('#navCost').onclick = async () => {
  showView('costView');
  const body = $('#costBody'); body.innerHTML = '<div class="plan-hint">加载中…</div>';
  try {
    const d = await api('/pm/llm-usage');
    const rows = d.by_trigger.map((t) => `<div class="cost-row"><span class="ctrigger">${t.trigger}</span><span class="cnums">${t.calls} 次 · ${t.tokens_in + t.tokens_out} tokens</span><span class="ccost">$${t.cost_usd.toFixed(4)}</span></div>`).join('');
    body.innerHTML = `<div class="cost-total"><div class="big">$${d.total_cost_usd.toFixed(4)}</div><div class="sub">${d.total_calls} 次调用 · ${d.total_tokens_in + d.total_tokens_out} tokens · 自 ${d.since.slice(0, 10)}</div></div><div class="cost-breakdown">${rows || '<div class="plan-hint">今日还没有 LLM 调用。</div>'}</div>`;
  } catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; }
};

// ─── admin: team management (附录 L, admin-only) ───
$('#navAdmin').onclick = loadAdmin;
async function loadAdmin() {
  showView('adminView');
  const body = $('#adminBody'); body.innerHTML = '<div class="plan-hint">加载中…</div>';
  let items;
  try { items = (await api('/admin/users')).items || []; }
  catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  body.innerHTML = '';
  items.forEach((u) => {
    const row = document.createElement('div'); row.className = 'admin-row';
    const self = u.id === me.id;
    row.innerHTML = `<span class="avatar">${initials(u.display_name)}</span>`
      + `<span class="ar-name"><b>${escapeHtml(u.display_name)}${self ? ' <span class="ws-meta">（你）</span>' : ''}</b><span class="ws-meta">${escapeHtml(u.email)}</span></span>`
      + `<label class="ar-role"><input type="checkbox" data-role="is_admin" ${u.is_admin ? 'checked' : ''}> admin</label>`
      + `<label class="ar-role"><input type="checkbox" data-role="is_pm" ${u.is_pm ? 'checked' : ''}> pm</label>`;
    row.querySelectorAll('input').forEach((chk) => {
      chk.onchange = async () => {
        const role = chk.dataset.role;
        try {
          const updated = await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { [role]: chk.checked } });
          u.is_admin = updated.is_admin; u.is_pm = updated.is_pm;
          if (self) { me = { ...me, is_admin: updated.is_admin, is_pm: updated.is_pm }; $('#navAdmin').style.display = me.is_admin ? 'flex' : 'none'; $('#navCost').style.display = me.is_pm ? 'flex' : 'none'; }
        } catch (e) { toast(e.message); chk.checked = !chk.checked; }
      };
    });
    body.appendChild(row);
  });
}

// ─── project members (附录 K) ───
$('#pvMembersBtn').onclick = () => { if (currentProjectId) openMembers(currentProjectId); };
$('#membersClose').onclick = () => $('#membersOverlay').classList.remove('show');
async function openMembers(pid) {
  $('#membersOverlay').classList.add('show');
  const body = $('#membersBody'); const addRow = $('#membersAddRow');
  body.innerHTML = '<div class="plan-hint">加载中…</div>'; addRow.innerHTML = '';
  let members;
  try { members = await api(`/projects/${pid}/members`); }
  catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  const myRole = (members.find((m) => m.user_id === me.id) || {}).role;
  const canManage = myRole === 'lead' || me.is_pm || me.is_admin;
  $('#membersTitle').textContent = `成员 · ${members.length}`;
  $('#membersHint').textContent = canManage ? 'lead 可加/移成员、改角色;成员只能查看。' : '你是项目成员,可查看名单。';
  body.innerHTML = '';
  const memberIds = new Set(members.map((m) => m.user_id));
  members.forEach((m) => {
    const isLead = m.role === 'lead';
    const row = document.createElement('div'); row.className = 'members-row';
    row.innerHTML = `<span class="avatar">${initials(m.name)}</span>`
      + `<span class="mr-name"><b>${escapeHtml(m.name)}${m.user_id === me.id ? ' <span class="ws-meta">（你）</span>' : ''}</b></span>`
      + `<span class="mr-role ${isLead ? '' : 'member'}">${isLead ? 'lead' : 'member'}</span>`;
    if (canManage) {
      const toggle = document.createElement('button'); toggle.className = 'btn btn-ghost btn-sm';
      toggle.textContent = isLead ? '设为成员' : '设为 lead';
      toggle.onclick = async () => {
        try { await api(`/projects/${pid}/members/${m.user_id}`, { method: 'PATCH', body: { role: isLead ? 'member' : 'lead' } }); openMembers(pid); }
        catch (e) { toast(e.message); }
      };
      const rm = document.createElement('button'); rm.className = 'btn btn-ghost btn-sm'; rm.textContent = '移除';
      rm.onclick = async () => {
        try { await api(`/projects/${pid}/members/${m.user_id}`, { method: 'DELETE' }); openMembers(pid); }
        catch (e) { toast(e.message); }
      };
      row.appendChild(toggle); row.appendChild(rm);
    }
    body.appendChild(row);
  });
  if (canManage) {
    const candidates = Object.entries(userMap).filter(([id]) => !memberIds.has(id));
    if (candidates.length) {
      const wrap = document.createElement('div'); wrap.className = 'members-add';
      const sel = document.createElement('select');
      sel.innerHTML = '<option value="">添加成员…</option>'
        + candidates.map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join('');
      const btn = document.createElement('button'); btn.className = 'btn btn-primary btn-sm'; btn.textContent = '添加';
      btn.onclick = async () => {
        if (!sel.value) return;
        try { await api(`/projects/${pid}/members`, { method: 'POST', body: { user_id: sel.value } }); openMembers(pid); }
        catch (e) { toast(e.message); }
      };
      wrap.appendChild(sel); wrap.appendChild(btn);
      addRow.appendChild(wrap);
    } else {
      addRow.innerHTML = '<span class="ws-meta">没有可添加的成员了</span>';
    }
  }
}

// ─── unified overlay dismissal: click backdrop or Esc closes any open overlay (附录 K §9) ───
document.querySelectorAll('.overlay').forEach((ov) => {
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('show'); });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.overlay.show').forEach((ov) => ov.classList.remove('show'));
});

// ─── new project ───
$('#newProjectBtn').onclick = () => { $('#npGoal').value = ''; $('#npName').value = ''; $('#projectOverlay').classList.add('show'); };
$('#npClose').onclick = $('#npCancel').onclick = () => $('#projectOverlay').classList.remove('show');
$('#npDecomposeBtn').onclick = async () => {
  const goal = $('#npGoal').value.trim(); if (!goal) { $('#npGoal').focus(); return; }
  const btn = $('#npDecomposeBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>拆解中…';
  try { const r = await api('/decompose', { method: 'POST', body: { goal } }); $('#projectOverlay').classList.remove('show'); openPlan(r, { eyebrow: '新项目 · 待确认', projectName: r.plan.title }); }
  catch (e) { toast(e.message); } finally { btn.disabled = false; btn.textContent = 'AI 拆解 →'; }
};
$('#npManualBtn').onclick = async () => {
  const name = $('#npName').value.trim(); if (!name) { $('#npName').focus(); return; }
  try { const p = await api('/projects', { method: 'POST', body: { name } }); $('#projectOverlay').classList.remove('show'); await loadProjects(p.id); toast('项目已创建'); }
  catch (e) { toast(e.message); }
};
$('#planDecomposeBtn').onclick = async () => {
  const goal = $('#planGoal').value.trim(); if (!goal || !currentProjectId) { $('#planGoal').focus(); return; }
  const btn = $('#planDecomposeBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try { const r = await api('/decompose', { method: 'POST', body: { goal, project_id: currentProjectId } }); $('#planGoal').value = ''; openPlan(r, { eyebrow: '补充拆解 · 待确认', projectName: null }); }
  catch (e) { toast(e.message); } finally { btn.disabled = false; btn.textContent = '拆解'; }
};

// ─── plan confirm modal ───
let currentSug = null, pendingProjectName = null;
function openPlan(resp, { eyebrow, projectName }) {
  currentSug = resp.suggestion_id; pendingProjectName = projectName || null;
  const plan = resp.plan || {};
  $('#planEyebrow').textContent = eyebrow || '拆解建议 · 待确认';
  $('#planTitle').textContent = plan.title || '拆解结果';
  $('#planRationale').textContent = plan.description || resp.message || '';
  $('#planConf').textContent = (plan.subtasks || []).length + ' 个子任务';
  const body = $('#planBody'); body.innerHTML = '';
  (plan.subtasks || []).forEach((st, i) => {
    const meta = [st.estimated_hours ? `${st.estimated_hours}h` : null, st.suggested_owner_hint ? `<span class="hint">建议：${escapeHtml(st.suggested_owner_hint)}</span>` : null].filter(Boolean).join(' · ');
    const r = document.createElement('div'); r.className = 'subtask'; r.style.animationDelay = (i * 0.05) + 's';
    r.innerHTML = `<div class="idx">${i + 1}</div><div class="st-body"><div class="st-title">${escapeHtml(st.title)}</div>${st.description ? `<div class="st-meta" style="margin-bottom:3px">${escapeHtml(st.description)}</div>` : ''}<div class="st-meta">${meta}</div></div>`;
    body.appendChild(r);
  });
  $('#planOverlay').classList.add('show');
}
$('#planReject').onclick = async () => { $('#planOverlay').classList.remove('show'); if (currentSug) { try { await api(`/suggestions/${currentSug}/reject`, { method: 'POST', body: { reason: 'dismissed' } }); } catch {} } loadSuggestions(); };
$('#planAccept').onclick = async () => {
  if (!currentSug) return;
  try {
    const r = await api(`/suggestions/${currentSug}/accept`, { method: 'POST' });
    toast(`已创建 ${r.created_tasks.length} 个任务`); $('#planOverlay').classList.remove('show');
    const selName = pendingProjectName;
    await loadProjects(); await loadSuggestions();
    if (selName) { const np = projects.find((p) => p.name === selName); if (np) selectProject(np.id); }
    else if (currentProjectId) selectProject(currentProjectId);
  } catch (e) { toast(e.message); }
};

// ─── chat ───
function addMsg(role, text) { const m = document.createElement('div'); m.className = 'msg ' + role; m.textContent = text; $('#msgs').appendChild(m); $('#msgs').scrollTop = $('#msgs').scrollHeight; return m; }
async function initChat() {
  try {
    const sessions = (await api('/chat/sessions')).items || [];
    chatSession = sessions[0] || (await api('/chat/sessions', { method: 'POST', body: { title: '工作助手' } }));
    const msgs = (await api(`/chat/sessions/${chatSession.id}/messages`)).items || [];
    // render after a frame so the 3-pane grid has settled (avoids first-paint width race)
    requestAnimationFrame(() => {
      $('#msgs').innerHTML = '';
      if (!msgs.length) addMsg('assistant', `你好 ${me.display_name}，我是你的工作助手。可以让我查任务、记录工作，或帮你理清今天要做什么。`);
      msgs.forEach((m) => addMsg(m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : 'system'), m.content));
    });
    connectWS();
  } catch (e) { addMsg('system', '助手暂不可用：' + e.message); }
}
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  chatSocket = new WebSocket(`${proto}://${location.host}/ws/chat/${chatSession.id}`);
  chatSocket.onmessage = (ev) => {
    const d = JSON.parse(ev.data);
    if (d.type === 'assistant_done') { removeTyping(); addMsg('assistant', d.content || ''); loadProjects(); loadSuggestions(); if (currentProjectId) { loadBoard(); refreshProjMeta(); } }
    else if (d.type === 'error') { removeTyping(); addMsg('system', '出错：' + (d.message || '')); }
    else if (d.type === 'aborted') removeTyping();
  };
  chatSocket.onclose = () => $('#aStatus').textContent = '离线';
  chatSocket.onopen = () => $('#aStatus').textContent = '在线';
}
let typingEl = null;
function showTyping() { typingEl = document.createElement('div'); typingEl.className = 'msg assistant'; typingEl.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; $('#msgs').appendChild(typingEl); $('#msgs').scrollTop = $('#msgs').scrollHeight; }
function removeTyping() { if (typingEl) { typingEl.remove(); typingEl = null; } }
function sendChat() { const inp = $('#chatInput'); const text = inp.value.trim(); if (!text || !chatSocket || chatSocket.readyState !== 1) return; addMsg('user', text); inp.value = ''; showTyping(); chatSocket.send(JSON.stringify({ type: 'user_message', content: text, project_id: currentProjectId })); }
$('#chatSend').onclick = sendChat;
$('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// ─── assistant settings: persona / memory / profile (附录 J) ───
$('#asstSettingsBtn').onclick = async () => {
  try {
    const w = await api('/me/assistant');
    $('#awPersona').value = w.persona_md || '';
    $('#awMemory').value = w.memory_md || '';
    $('#awProfile').value = w.profile_md || '';
    resetSkillForm(); renderSkills();
    $('#asstSettingsOverlay').classList.add('show');
  } catch (e) { toast(e.message); }
};
$('#awCancel').onclick = () => $('#asstSettingsOverlay').classList.remove('show');
$('#awSave').onclick = async () => {
  try {
    await api('/me/assistant', { method: 'PATCH', body: { persona_md: $('#awPersona').value, memory_md: $('#awMemory').value, profile_md: $('#awProfile').value } });
    $('#asstSettingsOverlay').classList.remove('show'); toast('助手设置已保存');
  } catch (e) { toast(e.message); }
};

// assistant skills (附录 J.5)
let awEditingSkill = null;
function resetSkillForm() { awEditingSkill = null; $('#awSkillName').value = ''; $('#awSkillDesc').value = ''; $('#awSkillInstr').value = ''; $('#awSkillSave').textContent = '添加技能'; }
async function renderSkills() {
  const box = $('#awSkills'); box.innerHTML = '<div class="plan-hint">加载中…</div>';
  let items; try { items = (await api('/me/assistant/skills')).items || []; } catch (e) { box.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  if (!items.length) { box.innerHTML = '<div class="plan-hint">还没有技能,下面添加。</div>'; return; }
  box.innerHTML = '';
  items.forEach((s) => {
    const row = document.createElement('div'); row.className = 'aw-skill-row';
    row.innerHTML = `<label class="aw-sk-on"><input type="checkbox" ${s.enabled ? 'checked' : ''}><b>${escapeHtml(s.name)}</b></label><span class="ws-meta aw-sk-desc">${escapeHtml(s.description || '')}</span><button class="btn btn-ghost btn-sm">编辑</button><button class="btn btn-ghost btn-sm">删除</button>`;
    const chk = row.querySelector('input');
    const [editBtn, delBtn] = row.querySelectorAll('button');
    chk.onchange = async () => { try { await api(`/me/assistant/skills/${s.id}`, { method: 'PATCH', body: { enabled: chk.checked } }); } catch (e) { toast(e.message); chk.checked = !chk.checked; } };
    editBtn.onclick = () => { awEditingSkill = s.id; $('#awSkillName').value = s.name; $('#awSkillDesc').value = s.description || ''; $('#awSkillInstr').value = s.instruction_md || ''; $('#awSkillSave').textContent = '保存修改'; $('#awSkillName').focus(); };
    delBtn.onclick = async () => { try { await api(`/me/assistant/skills/${s.id}`, { method: 'DELETE' }); if (awEditingSkill === s.id) resetSkillForm(); renderSkills(); } catch (e) { toast(e.message); } };
    box.appendChild(row);
  });
}
$('#awSkillSave').onclick = async () => {
  const name = $('#awSkillName').value.trim(); if (!name) { $('#awSkillName').focus(); return; }
  const body = { name, description: $('#awSkillDesc').value.trim(), instruction_md: $('#awSkillInstr').value };
  try {
    if (awEditingSkill) await api(`/me/assistant/skills/${awEditingSkill}`, { method: 'PATCH', body });
    else await api('/me/assistant/skills', { method: 'POST', body });
    resetSkillForm(); renderSkills();
  } catch (e) { toast(e.message); }
};

// ─── responsive + textareas ───
$('#navToggle').onclick = () => $('#sidebar').classList.toggle('open');
$('#asstToggle').onclick = () => $('#assistant').classList.toggle('open');
$('#collapseAsst').onclick = () => $('#assistant').classList.remove('open');
['#planGoal', '#npGoal'].forEach((sel) => { const e = $(sel); if (e) e.addEventListener('input', () => { e.style.height = 'auto'; e.style.height = e.scrollHeight + 'px'; }); });

boot();
