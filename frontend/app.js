'use strict';

const API = '/api/v1';
const $ = (s) => document.querySelector(s);

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.title || `HTTP ${res.status}`);
  return data;
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function initials(n) { return (n || '?').trim().slice(0, 2).toUpperCase(); }

// ─── state ───
let me = null, userMap = {}, projects = [], currentProjectId = null, currentTab = 'board';
let chatSocket = null, chatSession = null;

const STATUSES = [
  { id: 'todo', name: '待办' }, { id: 'in_progress', name: '进行中' },
  { id: 'blocked', name: '阻塞' }, { id: 'review', name: '评审' }, { id: 'done', name: '完成' },
];
const NEXT = {
  todo: [['in_progress', '开始']],
  in_progress: [['review', '提交评审'], ['done', '完成'], ['blocked', '阻塞']],
  blocked: [['in_progress', '解除阻塞']],
  review: [['done', '完成'], ['in_progress', '退回']],
  done: [['archived', '归档']], archived: [],
};

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
  $('#login').style.display = 'none';
  $('#app').classList.add('active');
  $('#whoName').textContent = me.display_name;
  $('#meAvatar').textContent = initials(me.display_name);
  $('#pmPill').style.display = me.is_pm ? 'inline' : 'none';
  $('#navCost').style.display = me.is_pm ? 'flex' : 'none';
  await loadUsers();
  await loadProjects();
  await loadSuggestions();
  await initChat();
}
async function loadUsers() {
  try { const r = await api('/users'); (Array.isArray(r) ? r : r.items || []).forEach((u) => userMap[u.id] = u.display_name); } catch {}
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
  document.querySelectorAll('.proj-item').forEach((el, i) => el.classList.toggle('active', projects[i] && projects[i].id === id));
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  $('#emptyState').style.display = 'none';
  $('#projectView').style.display = 'block';
  $('#pvName').textContent = p.name;
  $('#pvMeta').textContent = `${p.task_count} 个任务 · 完成 ${Math.round(p.completion * 100)}%`;
  switchTab('board');
  if (window.innerWidth <= 760) $('#sidebar').classList.remove('open');
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  ['board', 'plan', 'share'].forEach((t) => $(`#tab-${t}`).style.display = t === tab ? 'block' : 'none');
  if (tab === 'board') loadBoard();
  else if (tab === 'share') loadShare();
}
document.querySelectorAll('.tab').forEach((t) => t.onclick = () => switchTab(t.dataset.tab));

// ─── board ───
async function loadBoard() {
  let tasks = [];
  try { tasks = await api(`/projects/${currentProjectId}/tasks`); } catch (e) { toast(e.message); }
  const board = $('#board'); board.innerHTML = '';
  for (const col of STATUSES) {
    const items = tasks.filter((t) => t.status === col.id);
    const el = document.createElement('div'); el.className = 'col';
    el.innerHTML = `<div class="col-head"><span class="dot ${col.id}"></span><span class="name">${col.name}</span><span class="count">${items.length}</span></div>`;
    if (!items.length) el.insertAdjacentHTML('beforeend', `<div class="col-empty">—</div>`);
    items.forEach((t, i) => el.appendChild(card(t, i)));
    board.appendChild(el);
  }
}
function card(t, i) {
  const el = document.createElement('div'); el.className = 'card'; el.style.animationDelay = (i * 0.03) + 's';
  const isAI = (t.created_by || '').startsWith('ai_auto');
  const ownerName = t.owner_user_id ? (userMap[t.owner_user_id] || '成员') : null;
  const est = t.estimated_hours ? `<span class="est">${t.estimated_hours}h</span>` : '';
  const ownerHtml = ownerName ? `<span class="owner"><span class="avatar">${initials(ownerName)}</span>${ownerName}</span>` : `<span>未认领</span>`;
  el.innerHTML = `<div class="ctitle">${escapeHtml(t.title)}</div><div class="cmeta">${ownerHtml}${est}${isAI ? '<span class="ai-tag">AI</span>' : ''}</div><div class="actions"></div>`;
  const actions = el.querySelector('.actions');
  if (!t.owner_user_id) { const b = document.createElement('button'); b.textContent = '认领'; b.onclick = () => claim(t.id); actions.appendChild(b); }
  (NEXT[t.status] || []).forEach(([to, label]) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => move(t.id, to); actions.appendChild(b); });
  return el;
}
async function claim(id) { try { await api(`/tasks/${id}/claim`, { method: 'POST' }); toast('已认领'); loadBoard(); } catch (e) { toast(e.message); } }
async function move(id, to) { try { await api(`/tasks/${id}`, { method: 'PATCH', body: { status: to } }); loadBoard(); refreshProjMeta(); } catch (e) { toast(e.message); } }
async function refreshProjMeta() { try { const p = await api(`/projects/${currentProjectId}`); const idx = projects.findIndex((x) => x.id === p.id); if (idx >= 0) projects[idx] = p; $('#pvMeta').textContent = `${p.task_count} 个任务 · 完成 ${Math.round(p.completion * 100)}%`; } catch {} }

// ─── share ───
async function loadShare() {
  const body = $('#shareBody'); body.innerHTML = '<div class="plan-hint">加载中…</div>';
  let s; try { s = await api(`/projects/${currentProjectId}/share`); } catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  const p = s.project, pct = Math.round(p.completion * 100);
  const chips = STATUSES.map((c) => `<span class="chip">${c.name} ${s.status_counts[c.id] || 0}</span>`).join('');
  const byParent = {}; const roots = [];
  s.tasks.forEach((t) => { if (t.parent_task_id) (byParent[t.parent_task_id] = byParent[t.parent_task_id] || []).push(t); else roots.push(t); });
  const taskRow = (t, child) => `<div class="share-task ${child ? 'child' : ''}"><span class="st-status">${t.status}</span><span>${escapeHtml(t.title)}</span>${t.owner_user_id ? `<span class="avatar" style="margin-left:auto">${initials(userMap[t.owner_user_id] || '·')}</span>` : ''}</div>`;
  let flow = '';
  roots.forEach((r) => { flow += taskRow(r, false); (byParent[r.id] || []).forEach((ch) => flow += taskRow(ch, true)); });
  body.innerHTML = `
    <div class="share-summary">
      <div class="big">${pct}%</div><div class="ws-meta">完成度 · ${p.done_count}/${p.task_count} 个任务</div>
      <div class="progress-bar"><i style="width:${pct}%"></i></div>
      <div class="status-chips">${chips}</div>
    </div>
    <div class="section-title" style="font-size:15px;margin-bottom:10px">任务流程</div>
    <div class="share-flow">${flow || '<div class="plan-hint">还没有任务。</div>'}</div>`;
}

// ─── decompose plan modal (shared by new-project & add-to-project) ───
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
    const row = document.createElement('div'); row.className = 'subtask'; row.style.animationDelay = (i * 0.05) + 's';
    row.innerHTML = `<div class="idx">${i + 1}</div><div class="st-body"><div class="st-title">${escapeHtml(st.title)}</div>${st.description ? `<div class="st-meta" style="margin-bottom:3px">${escapeHtml(st.description)}</div>` : ''}<div class="st-meta">${meta}</div></div>`;
    body.appendChild(row);
  });
  $('#planOverlay').classList.add('show');
}
$('#planReject').onclick = async () => { $('#planOverlay').classList.remove('show'); if (currentSug) { try { await api(`/suggestions/${currentSug}/reject`, { method: 'POST', body: { reason: 'dismissed' } }); } catch {} } loadSuggestions(); };
$('#planAccept').onclick = async () => {
  if (!currentSug) return;
  try {
    const r = await api(`/suggestions/${currentSug}/accept`, { method: 'POST' });
    toast(`已创建 ${r.created_tasks.length} 个任务`);
    $('#planOverlay').classList.remove('show');
    const selName = pendingProjectName;
    await loadProjects();
    loadSuggestions();
    if (selName) { const np = projects.find((p) => p.name === selName); if (np) selectProject(np.id); }
    else if (currentProjectId) { selectProject(currentProjectId); }
  } catch (e) { toast(e.message); }
};

// ─── new project ───
$('#newProjectBtn').onclick = () => { $('#npGoal').value = ''; $('#npName').value = ''; $('#projectOverlay').classList.add('show'); };
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

// ─── plan tab: decompose into current project ───
$('#planDecomposeBtn').onclick = async () => {
  const goal = $('#planGoal').value.trim(); if (!goal || !currentProjectId) { $('#planGoal').focus(); return; }
  const btn = $('#planDecomposeBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try { const r = await api('/decompose', { method: 'POST', body: { goal, project_id: currentProjectId } }); $('#planGoal').value = ''; openPlan(r, { eyebrow: '补充拆解 · 待确认', projectName: null }); }
  catch (e) { toast(e.message); } finally { btn.disabled = false; btn.textContent = '拆解'; }
};

// ─── suggestions drawer ───
async function loadSuggestions() {
  let items = []; try { items = (await api('/suggestions?status=pending')).items || []; } catch {}
  const badge = $('#sugBadge'); badge.style.display = items.length ? 'inline-grid' : 'none'; badge.textContent = items.length;
  const body = $('#drawerBody'); body.innerHTML = items.length ? '' : '<div class="empty-hint">没有待处理的建议。</div>';
  const label = { decompose: '任务拆解', create_task: '创建任务', assign: '分配建议' };
  items.forEach((s) => {
    const ref = s.target_ref || {}; const text = ref.project_name || ref.title || (label[s.suggestion_type] || s.suggestion_type);
    const el = document.createElement('div'); el.className = 'sug';
    el.innerHTML = `<div class="stype">${label[s.suggestion_type] || s.suggestion_type} · ${Math.round(s.confidence * 100)}%</div><div class="stext">${escapeHtml(text)}</div><div class="sration">${escapeHtml(s.rationale || '')}</div><div class="sact"><button class="btn btn-primary btn-sm">接受</button><button class="btn btn-ghost btn-sm">拒绝</button></div>`;
    const [acc, rej] = el.querySelectorAll('button');
    acc.onclick = async () => { try { const r = await api(`/suggestions/${s.id}/accept`, { method: 'POST' }); toast(`已创建 ${r.created_tasks.length} 个任务`); await loadProjects(); loadSuggestions(); if (currentProjectId) selectProject(currentProjectId); } catch (e) { toast(e.message); } };
    rej.onclick = async () => { try { await api(`/suggestions/${s.id}/reject`, { method: 'POST', body: { reason: 'rejected' } }); loadSuggestions(); } catch (e) { toast(e.message); } };
    body.appendChild(el);
  });
}
$('#openDrawer').onclick = () => $('#drawer').classList.add('show');
$('#closeDrawer').onclick = () => $('#drawer').classList.remove('show');

// ─── chat ───
function addMsg(role, text) { const m = document.createElement('div'); m.className = 'msg ' + role; m.textContent = text; $('#msgs').appendChild(m); $('#msgs').scrollTop = $('#msgs').scrollHeight; return m; }
async function initChat() {
  try {
    const sessions = (await api('/chat/sessions')).items || [];
    chatSession = sessions[0] || (await api('/chat/sessions', { method: 'POST', body: { title: '工作助手' } }));
    const msgs = (await api(`/chat/sessions/${chatSession.id}/messages`)).items || [];
    $('#msgs').innerHTML = '';
    if (!msgs.length) addMsg('assistant', `你好 ${me.display_name}，我是你的工作助手。可以让我查任务、记录工作，或帮你理清今天要做什么。`);
    msgs.forEach((m) => addMsg(m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : 'system'), m.content));
    connectWS();
  } catch (e) { addMsg('system', '助手暂不可用：' + e.message); }
}
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  chatSocket = new WebSocket(`${proto}://${location.host}/ws/chat/${chatSession.id}`);
  chatSocket.onmessage = (ev) => {
    const d = JSON.parse(ev.data);
    if (d.type === 'assistant_done') { removeTyping(); addMsg('assistant', d.content || ''); loadProjects(); loadSuggestions(); if (currentProjectId) refreshProjMeta(); }
    else if (d.type === 'error') { removeTyping(); addMsg('system', '出错：' + (d.message || '')); }
    else if (d.type === 'aborted') removeTyping();
  };
  chatSocket.onclose = () => $('#aStatus').textContent = '离线';
  chatSocket.onopen = () => $('#aStatus').textContent = '在线';
}
let typingEl = null;
function showTyping() { typingEl = document.createElement('div'); typingEl.className = 'msg assistant'; typingEl.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; $('#msgs').appendChild(typingEl); $('#msgs').scrollTop = $('#msgs').scrollHeight; }
function removeTyping() { if (typingEl) { typingEl.remove(); typingEl = null; } }
function sendChat() { const inp = $('#chatInput'); const text = inp.value.trim(); if (!text || !chatSocket || chatSocket.readyState !== 1) return; addMsg('user', text); inp.value = ''; showTyping(); chatSocket.send(JSON.stringify({ type: 'user_message', content: text })); }
$('#chatSend').onclick = sendChat;
$('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// ─── responsive toggles ───
$('#navToggle').onclick = () => $('#sidebar').classList.toggle('open');
$('#asstToggle').onclick = () => $('#assistant').classList.toggle('open');
$('#collapseAsst').onclick = () => $('#assistant').classList.remove('open');
$('#planGoal').addEventListener('input', (e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; });

boot();
