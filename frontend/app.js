'use strict';

const API = '/api/v1';
const $ = (s) => document.querySelector(s);

// ─── tiny API helper (same-origin cookie auth) ───
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
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ─── state ───
let me = null;
let userMap = {};   // id -> display_name
let chatSocket = null;
let chatSession = null;

const STATUSES = [
  { id: 'todo', name: '待办' },
  { id: 'in_progress', name: '进行中' },
  { id: 'blocked', name: '阻塞' },
  { id: 'review', name: '评审' },
  { id: 'done', name: '完成' },
];
// next-status actions (mirrors backend state machine)
const NEXT = {
  todo: [['in_progress', '开始']],
  in_progress: [['review', '提交评审'], ['done', '完成'], ['blocked', '阻塞']],
  blocked: [['in_progress', '解除阻塞']],
  review: [['done', '完成'], ['in_progress', '退回']],
  done: [['archived', '归档']],
  archived: [],
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
  const email = $('#email').value.trim();
  const password = $('#password').value;
  const display_name = $('#dispName').value.trim();
  $('#loginErr').textContent = '';
  try {
    if (registerMode) {
      await api('/auth/register', { method: 'POST', body: { email, password, display_name } });
    }
    await api('/auth/login', { method: 'POST', body: { email, password } });
    await boot();
  } catch (e) {
    $('#loginErr').textContent = e.message;
  }
};
$('#password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#loginBtn').click(); });

$('#logoutBtn').onclick = async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch {}
  if (chatSocket) chatSocket.close();
  location.reload();
};

// ─── boot ───
async function boot() {
  try {
    me = await api('/auth/me');
  } catch {
    $('#login').style.display = 'grid';
    $('#app').classList.remove('active');
    return;
  }
  $('#login').style.display = 'none';
  $('#app').classList.add('active');
  $('#whoName').textContent = me.display_name;
  $('#pmPill').style.display = me.is_pm ? 'inline' : 'none';

  await loadUsers();
  await loadBoard();
  await loadSuggestions();
  await initChat();
}

async function loadUsers() {
  try {
    const r = await api('/users');
    const list = Array.isArray(r) ? r : (r.items || []);
    userMap = {};
    list.forEach((u) => { userMap[u.id] = u.display_name; });
  } catch { /* optional */ }
}

function initials(name) {
  if (!name) return '?';
  return name.trim().slice(0, 2).toUpperCase();
}

// ─── kanban ───
async function loadBoard() {
  let tasks = [];
  try { tasks = (await api('/tasks?limit=200')).items || []; } catch (e) { toast(e.message); }
  const board = $('#board');
  board.innerHTML = '';
  for (const col of STATUSES) {
    const items = tasks.filter((t) => t.status === col.id);
    const el = document.createElement('div');
    el.className = 'col';
    el.innerHTML = `<div class="col-head"><span class="dot ${col.id}"></span>
      <span class="name">${col.name}</span><span class="count">${items.length}</span></div>`;
    if (!items.length) {
      el.insertAdjacentHTML('beforeend', `<div class="col-empty">—</div>`);
    }
    items.forEach((t, i) => el.appendChild(card(t, i)));
    board.appendChild(el);
  }
}

function card(t, i) {
  const el = document.createElement('div');
  el.className = 'card';
  el.style.animationDelay = (i * 0.03) + 's';
  const isAI = (t.created_by || '').startsWith('ai_auto');
  const ownerName = t.owner_user_id ? (userMap[t.owner_user_id] || '成员') : null;
  const est = t.estimated_hours ? `<span class="est">${t.estimated_hours}h</span>` : '';
  const ownerHtml = ownerName
    ? `<span class="owner"><span class="avatar">${initials(ownerName)}</span>${ownerName}</span>`
    : `<span>未认领</span>`;
  const aiTag = isAI ? `<span class="ai-tag">AI</span>` : '';
  el.innerHTML = `
    <div class="ctitle">${escapeHtml(t.title)}</div>
    <div class="cmeta">${ownerHtml}${est}${aiTag}</div>
    <div class="actions"></div>`;
  const actions = el.querySelector('.actions');
  if (!t.owner_user_id) {
    const b = document.createElement('button');
    b.textContent = '认领';
    b.onclick = () => claim(t.id);
    actions.appendChild(b);
  }
  (NEXT[t.status] || []).forEach(([to, label]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => move(t.id, to);
    actions.appendChild(b);
  });
  return el;
}

async function claim(id) {
  try { await api(`/tasks/${id}/claim`, { method: 'POST' }); toast('已认领'); loadBoard(); }
  catch (e) { toast(e.message); }
}
async function move(id, to) {
  try { await api(`/tasks/${id}`, { method: 'PATCH', body: { status: to } }); loadBoard(); }
  catch (e) { toast(e.message); }
}

// ─── decompose ───
const goalInput = $('#goalInput');
goalInput.addEventListener('input', () => { goalInput.style.height = 'auto'; goalInput.style.height = goalInput.scrollHeight + 'px'; });

$('#decomposeBtn').onclick = async () => {
  const goal = goalInput.value.trim();
  if (!goal) { goalInput.focus(); return; }
  const btn = $('#decomposeBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span><span>拆解中…</span>';
  try {
    const r = await api('/decompose', { method: 'POST', body: { goal } });
    openPlan(r);
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5z"/></svg><span>拆解</span>';
  }
};

let currentSug = null;
function openPlan(r) {
  currentSug = r.suggestion_id;
  const plan = r.plan || {};
  $('#planTitle').textContent = plan.title || '拆解结果';
  $('#planRationale').textContent = plan.description || r.message || '';
  $('#planConf').textContent = (plan.subtasks || []).length + ' 个子任务';
  const body = $('#planBody');
  body.innerHTML = '';
  (plan.subtasks || []).forEach((st, i) => {
    const hint = st.suggested_owner_hint || st.owner_hint;
    const meta = [
      st.estimated_hours ? `${st.estimated_hours}h` : null,
      hint ? `<span class="hint">建议：${escapeHtml(hint)}</span>` : null,
    ].filter(Boolean).join(' · ');
    const row = document.createElement('div');
    row.className = 'subtask';
    row.style.animationDelay = (i * 0.05) + 's';
    row.innerHTML = `<div class="idx">${i + 1}</div>
      <div class="st-body"><div class="st-title">${escapeHtml(st.title)}</div>
      ${st.description ? `<div class="st-meta" style="margin-bottom:3px">${escapeHtml(st.description)}</div>` : ''}
      <div class="st-meta">${meta}</div></div>`;
    body.appendChild(row);
  });
  $('#planOverlay').classList.add('show');
}
$('#planReject').onclick = async () => {
  $('#planOverlay').classList.remove('show');
  if (currentSug) { try { await api(`/suggestions/${currentSug}/reject`, { method: 'POST', body: { reason: 'dismissed from composer' } }); } catch {} }
  loadSuggestions();
};
$('#planAccept').onclick = async () => {
  if (!currentSug) return;
  try {
    const r = await api(`/suggestions/${currentSug}/accept`, { method: 'POST' });
    toast(`已创建 ${r.created_tasks.length} 个任务`);
    $('#planOverlay').classList.remove('show');
    goalInput.value = ''; goalInput.style.height = 'auto';
    loadBoard(); loadSuggestions();
  } catch (e) { toast(e.message); }
};

// ─── suggestions drawer ───
async function loadSuggestions() {
  let items = [];
  try { items = (await api('/suggestions?status=pending')).items || []; } catch {}
  const badge = $('#sugBadge');
  badge.style.display = items.length ? 'grid' : 'none';
  badge.textContent = items.length;
  const body = $('#drawerBody');
  body.innerHTML = items.length ? '' : '<div class="empty-hint">没有待处理的建议。</div>';
  const typeLabel = { decompose: '任务拆解', create_task: '创建任务', assign: '分配建议' };
  items.forEach((s) => {
    const el = document.createElement('div');
    el.className = 'sug';
    const ref = s.target_ref || {};
    const text = ref.title || (typeLabel[s.suggestion_type] || s.suggestion_type);
    el.innerHTML = `<div class="stype">${typeLabel[s.suggestion_type] || s.suggestion_type} · ${(s.confidence * 100).toFixed(0)}%</div>
      <div class="stext">${escapeHtml(text)}</div>
      <div class="sration">${escapeHtml(s.rationale || '')}</div>
      <div class="sact">
        <button class="btn btn-primary btn-sm">接受</button>
        <button class="btn btn-ghost btn-sm">拒绝</button>
      </div>`;
    const [acc, rej] = el.querySelectorAll('button');
    acc.onclick = async () => { try { const r = await api(`/suggestions/${s.id}/accept`, { method: 'POST' }); toast(`已创建 ${r.created_tasks.length} 个任务`); loadBoard(); loadSuggestions(); } catch (e) { toast(e.message); } };
    rej.onclick = async () => { try { await api(`/suggestions/${s.id}/reject`, { method: 'POST', body: { reason: 'rejected' } }); loadSuggestions(); } catch (e) { toast(e.message); } };
    body.appendChild(el);
  });
}
$('#openDrawer').onclick = () => $('#drawer').classList.add('show');
$('#closeDrawer').onclick = () => $('#drawer').classList.remove('show');

// ─── chat ───
function addMsg(role, text) {
  const m = document.createElement('div');
  m.className = 'msg ' + role;
  m.textContent = text;
  $('#msgs').appendChild(m);
  $('#msgs').scrollTop = $('#msgs').scrollHeight;
  return m;
}

async function initChat() {
  try {
    let sessions = (await api('/chat/sessions')).items || [];
    chatSession = sessions[0] || (await api('/chat/sessions', { method: 'POST', body: { title: '工作助手' } }));
    const msgs = (await api(`/chat/sessions/${chatSession.id}/messages`)).items || [];
    $('#msgs').innerHTML = '';
    if (!msgs.length) addMsg('assistant', `你好 ${me.display_name}，我是你的工作助手。可以让我查任务、记录工作，或帮你理一理今天要做什么。`);
    msgs.forEach((m) => addMsg(m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : 'system'), m.content));
    connectWS();
  } catch (e) { addMsg('system', '助手暂不可用：' + e.message); }
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  chatSocket = new WebSocket(`${proto}://${location.host}/ws/chat/${chatSession.id}`);
  chatSocket.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.type === 'assistant_done') { removeTyping(); addMsg('assistant', data.content || ''); loadBoard(); loadSuggestions(); }
    else if (data.type === 'error') { removeTyping(); addMsg('system', '出错：' + (data.message || '')); }
    else if (data.type === 'aborted') { removeTyping(); }
  };
  chatSocket.onclose = () => { $('#aStatus').textContent = '离线'; };
  chatSocket.onopen = () => { $('#aStatus').textContent = '在线'; };
}

let typingEl = null;
function showTyping() {
  typingEl = document.createElement('div');
  typingEl.className = 'msg assistant';
  typingEl.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  $('#msgs').appendChild(typingEl);
  $('#msgs').scrollTop = $('#msgs').scrollHeight;
}
function removeTyping() { if (typingEl) { typingEl.remove(); typingEl = null; } }

function sendChat() {
  const input = $('#chatInput');
  const text = input.value.trim();
  if (!text || !chatSocket || chatSocket.readyState !== 1) return;
  addMsg('user', text);
  input.value = '';
  showTyping();
  chatSocket.send(JSON.stringify({ type: 'user_message', content: text }));
}
$('#chatSend').onclick = sendChat;
$('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// ─── util ───
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

boot();
