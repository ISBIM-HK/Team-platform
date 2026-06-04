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
let me = null, userMap = {}, projects = [], archivedProjects = [], currentProjectId = null, allSuggestions = [], boardTasks = [];
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
const DEFAULT_TOKEN_SCOPES = ['contributions:write', 'contributions:read', 'projects:read'];
const TOKEN_SCOPE_OPTIONS = [
  ['contributions:write', '投送工作'],
  ['contributions:read', '查看投送'],
  ['projects:read', '查看项目'],
  ['projects:write', '管理项目'],
  ['tasks:read', '查看任务'],
  ['tasks:write', '管理任务'],
  ['suggestions:read', '查看建议'],
  ['suggestions:write', '处理建议'],
  ['notifications:read', '查看通知'],
  ['notifications:write', '标记通知'],
  ['assistant:read', '读取助手'],
  ['assistant:write', '修改助手'],
  ['chat:read', '读取聊天'],
  ['chat:write', '发送聊天'],
  ['users:read', '查看成员'],
  ['profile:read', '读取资料'],
  ['integrations:read', '查看集成'],
  ['integrations:write', '管理集成'],
  ['decompose', 'AI 拆解'],
  ['brief', '生成简报'],
  ['pm', 'PM 观测'],
  ['admin', '管理后台'],
  ['tokens:manage', '管理令牌'],
];

// ─── starfield + mouse-triggered connections ───
function initStarfield() {
  const canvas = $('#starfield'); if (!canvas) return;
  if (canvas.dataset.init) return; canvas.dataset.init = '1';
  const ctx = canvas.getContext('2d');
  let w, h, stars;
  const mouse = { x: -9999, y: -9999 };
  const MOUSE_R = 200, LINK_R = 150;

  function resize() {
    w = canvas.width = canvas.parentElement.clientWidth;
    h = canvas.height = canvas.parentElement.clientHeight;
  }

  function create() {
    const count = Math.floor((w * h) / 6000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: Math.random() < 0.12 ? Math.random() * 2 + 1.8 : Math.random() * 1.2 + 0.4,
      base: Math.random() * 0.45 + 0.15,
      phase: Math.random() * Math.PI * 2,
      freq: Math.random() * 0.015 + 0.004,
    }));
  }

  let t = 0;
  function draw() {
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < stars.length; i++) {
      const a = stars[i];
      a.x += a.vx; a.y += a.vy;
      if (a.x < 0) a.x += w; if (a.x > w) a.x -= w;
      if (a.y < 0) a.y += h; if (a.y > h) a.y -= h;

      // twinkle
      const flicker = a.base + (1 - a.base) * (0.5 + 0.5 * Math.sin(t * a.freq + a.phase));

      // mouse proximity glow
      const mdx = a.x - mouse.x, mdy = a.y - mouse.y;
      const md = Math.sqrt(mdx * mdx + mdy * mdy);
      const boost = md < MOUSE_R ? (1 - md / MOUSE_R) * 0.5 : 0;
      const alpha = Math.min(flicker + boost, 1);

      // draw star
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r * (1 + boost * 0.6), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200, 220, 240, ' + alpha + ')';
      ctx.fill();

      // mouse → star lines
      if (md < MOUSE_R) {
        ctx.beginPath();
        ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(a.x, a.y);
        ctx.strokeStyle = 'rgba(60, 200, 235, ' + (1 - md / MOUSE_R) * 0.75 + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // star ↔ star lines near mouse
      if (md < MOUSE_R * 1.3) {
        for (let j = i + 1; j < stars.length; j++) {
          const b = stars[j];
          const bd = Math.sqrt((b.x - mouse.x) ** 2 + (b.y - mouse.y) ** 2);
          if (bd > MOUSE_R * 1.3) continue;
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK_R) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = 'rgba(60, 200, 235, ' + (1 - d / LINK_R) * 0.55 + ')';
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }
    }

    t++;
    requestAnimationFrame(draw);
  }

  const wrap = canvas.parentElement;
  wrap.addEventListener('mousemove', (e) => {
    const r = wrap.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  });
  wrap.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });
  window.addEventListener('resize', () => { resize(); create(); });
  resize(); create(); draw();
}

// ─── auth ───
// SSO entry → JarvisBIM auth page
$('#ssoEntryBtn').onclick = () => {
  $('#login').style.display = 'none';
  $('#ssoLogin').style.display = 'block';
  initStarfield();
  const saved = localStorage.getItem('remembered_email');
  if (saved) { $('#email').value = saved; $('#rememberEmail').checked = true; $('#password').focus(); }
  else { $('#email').focus(); }
};
$('#ssoBackBtn').onclick = () => {
  $('#ssoLogin').style.display = 'none';
  $('#login').style.display = 'grid';
  $('#loginErr').textContent = '';
};
$('#loginBtn').onclick = async () => {
  const email = $('#email').value.trim(), password = $('#password').value;
  $('#loginErr').textContent = '';
  if (!email || !password) { $('#loginErr').textContent = '请输入邮箱和密码'; return; }
  const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = '验证中…';
  try {
    await api('/auth/proxy-login', { method: 'POST', body: { email, password } });
    if ($('#rememberEmail').checked) localStorage.setItem('remembered_email', email);
    else localStorage.removeItem('remembered_email');
    await boot();
  } catch (e) { $('#loginErr').textContent = e.message; }
  btn.disabled = false; btn.textContent = '登 录';
};
$('#password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#loginBtn').click(); });
$('#pwToggle').onclick = () => {
  const pw = $('#password'), isHidden = pw.type === 'password';
  pw.type = isHidden ? 'text' : 'password';
  $('#eyeOpen').style.display = isHidden ? 'none' : 'block';
  $('#eyeClosed').style.display = isHidden ? 'block' : 'none';
};
$('#logoutBtn').onclick = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch {} if (chatSocket) chatSocket.close(); location.reload(); };

// ─── boot ───
async function boot() {
  try { me = await api('/auth/me'); } catch { $('#ssoLogin').style.display = 'none'; $('#login').style.display = 'grid'; $('#app').classList.remove('active'); return; }
  $('#login').style.display = 'none'; $('#ssoLogin').style.display = 'none'; $('#app').classList.add('active');
  $('#whoName').textContent = me.display_name; $('#meAvatar').textContent = initials(me.display_name);
  $('#pmPill').style.display = me.is_pm ? 'inline' : 'none';
  $('#navCost').style.display = me.is_pm ? 'flex' : 'none';
  $('#navAdmin').style.display = me.is_admin ? 'flex' : 'none';
  await loadUsers(); await loadProjects(); await loadSuggestions(); updateNotifBadge(); connectNotifSSE(); await initChat();
}
async function loadUsers() { try { const r = await api('/users'); (Array.isArray(r) ? r : r.items || []).forEach((u) => userMap[u.id] = u.display_name); } catch {} }

// ─── center view switching ───
const VIEWS = ['emptyState', 'projectView', 'suggestionsView', 'archivedView', 'notificationsView', 'tokenView', 'costView', 'adminView'];
function showView(id) {
  VIEWS.forEach((v) => $('#' + v).style.display = v === id ? 'block' : 'none');
  $('#navSuggestions').classList.toggle('active-nav', id === 'suggestionsView');
  $('#navArchived').classList.toggle('active-nav', id === 'archivedView');
  $('#navNotifications').classList.toggle('active-nav', id === 'notificationsView');
  $('#navTokens').classList.toggle('active-nav', id === 'tokenView');
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
    const el = document.createElement('div');
    el.className = 'proj-item' + (p.id === currentProjectId ? ' active' : '');
    el.innerHTML = `<span class="pdot"></span><span class="pname">${escapeHtml(p.name)}</span><span class="pcount">${p.task_count}</span>`
      + (p.name !== '未分类' ? `<button class="proj-menu-btn" title="更多">···</button><div class="proj-menu"><button data-action="archive">归档项目</button><button data-action="delete" class="danger">删除项目</button></div>` : '');
    el.querySelector('.pname').onclick = () => selectProject(p.id);
    el.querySelector('.pdot').onclick = () => selectProject(p.id);
    const menuBtn = el.querySelector('.proj-menu-btn');
    if (menuBtn) {
      menuBtn.onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.proj-menu.open').forEach((m) => m.classList.remove('open')); el.querySelector('.proj-menu').classList.toggle('open'); };
      el.querySelector('[data-action="archive"]').onclick = async (e) => {
        e.stopPropagation(); if (!confirm(`归档项目「${p.name}」？`)) return;
        try { await api(`/projects/${p.id}`, { method: 'PATCH', body: { status: 'archived' } }); toast('已归档'); if (currentProjectId === p.id) { currentProjectId = null; showView('emptyState'); } await loadProjects(); await loadSuggestions(); } catch (err) { toast(err.message); }
      };
      el.querySelector('[data-action="delete"]').onclick = async (e) => {
        e.stopPropagation(); if (!confirm(`删除项目「${p.name}」？此操作不可恢复。`)) return;
        try { await api(`/projects/${p.id}`, { method: 'DELETE' }); toast('已删除'); if (currentProjectId === p.id) { currentProjectId = null; showView('emptyState'); } await loadProjects(); await loadSuggestions(); } catch (err) { toast(err.message); }
      };
    }
    list.appendChild(el);
  });
  if (selectId) selectProject(selectId);
}
async function loadArchivedProjects() {
  let all = [];
  try { all = await api('/projects?include_archived=true'); } catch (e) { toast(e.message); }
  archivedProjects = all.filter((p) => p.status === 'archived');
  renderArchivedProjects();
}
function renderArchivedProjects() {
  $('#archivedMeta').textContent = `${archivedProjects.length} 个项目`;
  const body = $('#archivedProjectsBody'); body.innerHTML = '';
  if (!archivedProjects.length) { body.innerHTML = '<div class="empty-hint">没有已归档项目。</div>'; return; }
  archivedProjects.forEach((p) => {
    const row = document.createElement('div'); row.className = 'admin-row';
    row.innerHTML = `<span class="pdot"></span><span class="ar-name"><b>${escapeHtml(p.name)}</b><span class="ws-meta">${p.task_count} 个任务 · 完成 ${Math.round(p.completion * 100)}%</span></span><button class="btn btn-soft btn-sm">恢复</button>`;
    row.querySelector('button').onclick = async () => {
      try {
        await api(`/projects/${p.id}`, { method: 'PATCH', body: { status: 'active' } });
        toast('项目已恢复');
        await loadProjects(p.id);
        await loadSuggestions();
        await loadArchivedProjects();
      } catch (e) { toast(e.message); }
    };
    body.appendChild(row);
  });
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
  document.querySelectorAll('.ws-actions .btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  ['board', 'plan', 'share', 'pwspace'].forEach((t) => $(`#tab-${t}`).style.display = t === tab ? 'block' : 'none');
  if (tab === 'board') loadBoard();
  else if (tab === 'share') loadShare();
  else if (tab === 'plan') { renderPlanSuggestions(); renderPlanImplHints(); }
  else if (tab === 'pwspace') loadProjectWorkspace();
}
document.querySelectorAll('.tab').forEach((t) => t.onclick = () => switchTab(t.dataset.tab));
$('#pvPlanBtn').onclick = () => switchTab('plan');
$('#pvWorkspaceBtn').onclick = () => switchTab('pwspace');

// ─── board ───
async function loadBoard() {
  try { boardTasks = await api(`/projects/${currentProjectId}/tasks`); } catch (e) { toast(e.message); boardTasks = []; }
  const childCount = {};
  boardTasks.forEach((t) => { if (t.parent_task_id) childCount[t.parent_task_id] = (childCount[t.parent_task_id] || 0) + 1; });
  const board = $('#board'); board.innerHTML = '';
  for (const col of STATUSES) {
    const items = boardTasks.filter((t) => t.status === col.id);
    const el = document.createElement('div'); el.className = 'col';
    el.dataset.status = col.id;
    el.innerHTML = `<div class="col-head"><span class="dot ${col.id}"></span><span class="name">${col.name}</span><span class="count">${items.length}</span></div>`;
    if (!items.length) el.insertAdjacentHTML('beforeend', `<div class="col-empty">—</div>`);
    items.forEach((t, i) => el.appendChild(card(t, i, childCount[t.id] || 0)));

    // drop target
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      const taskId = e.dataTransfer.types.includes('text/plain');
      if (!taskId) return;
      const dragging = document.querySelector('.card.dragging');
      if (!dragging) return;
      const fromStatus = dragging.dataset.status;
      const validTargets = (NEXT[fromStatus] || []).map(([s]) => s);
      if (validTargets.includes(col.id)) {
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
        el.classList.remove('drag-invalid');
      } else {
        e.dataTransfer.dropEffect = 'none';
        el.classList.add('drag-invalid');
        el.classList.remove('drag-over');
      }
    });
    el.addEventListener('dragleave', () => { el.classList.remove('drag-over', 'drag-invalid'); });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('drag-over', 'drag-invalid');
      const taskId = e.dataTransfer.getData('text/plain');
      if (!taskId) return;
      const dragging = document.querySelector('.card.dragging');
      if (!dragging) return;
      const fromStatus = dragging.dataset.status;
      const validTargets = (NEXT[fromStatus] || []).map(([s]) => s);
      if (!validTargets.includes(col.id)) { toast('不允许的状态转换'); return; }
      await move(taskId, col.id);
    });

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
  el.dataset.taskId = t.id;
  el.dataset.status = t.status;
  const isAI = (t.created_by || '').startsWith('ai_auto');
  const ownerName = t.owner_user_id ? (userMap[t.owner_user_id] || '成员') : null;
  const [pcls, plabel] = PRIO[t.priority] || PRIO[1];
  const bits = [];
  if (ownerName) bits.push(`<span class="owner"><span class="avatar">${initials(ownerName)}</span>${escapeHtml(ownerName)}</span>`); else bits.push('<span>未认领</span>');
  if (t.estimated_hours) bits.push(`<span class="est">${t.estimated_hours}h</span>`);
  if (nChildren) bits.push(`<span class="subc">◧ ${nChildren} 子任务</span>`);
  if (plabel) bits.push(`<span class="prio ${pcls}">${plabel}</span>`);
  if (isAI) bits.push('<span class="ai-tag">AI</span>');
  el.innerHTML = `<span class="drag-handle" draggable="true" title="拖动">⠿</span><div class="ctitle">${escapeHtml(t.title)}</div>${t.description ? `<div class="cdesc">${escapeHtml(t.description)}</div>` : ''}<div class="cmeta">${bits.join('')}</div><div class="actions"></div>`;
  const actions = el.querySelector('.actions');
  const addBtn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = (e) => { e.stopPropagation(); fn(); }; actions.appendChild(b); };
  if (!t.owner_user_id) addBtn('认领', () => claim(t.id));
  (NEXT[t.status] || []).forEach(([to, label]) => addBtn(label, () => move(t.id, to)));
  el.onclick = (e) => { if (!e.target.closest('.drag-handle')) openTaskDetail(t, nChildren); };

  // drag events on handle
  const handle = el.querySelector('.drag-handle');
  handle.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.id);
    e.dataTransfer.setDragImage(el, 20, 20);
    requestAnimationFrame(() => el.classList.add('dragging'));
    const validTargets = (NEXT[t.status] || []).map(([s]) => s);
    document.querySelectorAll('.col').forEach((col) => {
      if (validTargets.includes(col.dataset.status)) col.classList.add('drop-ready');
    });
  });
  handle.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    document.querySelectorAll('.col').forEach((c) => c.classList.remove('drag-over', 'drag-invalid', 'drop-ready'));
  });
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

// ─── project workspace tab ───
let pwsVersion = 1;
async function loadProjectWorkspace() {
  const fields = ['#pwsBg', '#pwsCtx', '#pwsFocus'];
  fields.forEach((s) => { $(s).value = ''; $(s).disabled = true; });
  $('#pwsActions').style.display = 'none';
  $('#pwsReadonly').style.display = 'none';
  if (!currentProjectId) return;
  try {
    const ws = await api(`/projects/${currentProjectId}/workspace`);
    pwsVersion = ws.version;
    $('#pwsBg').value = ws.background_md;
    $('#pwsCtx').value = ws.context_md;
    $('#pwsFocus').value = ws.current_focus_md;
    $('#pwsVersion').textContent = `v${ws.version}`;
    // check if user can edit (lead/pm/admin)
    const canEdit = me.is_pm || me.is_admin;
    if (!canEdit) {
      try {
        const members = await api(`/projects/${currentProjectId}/members`);
        const mine = members.find((m) => m.user_id === me.id);
        if (mine && mine.role === 'lead') { fields.forEach((s) => { $(s).disabled = false; }); $('#pwsActions').style.display = 'flex'; return; }
      } catch {}
      $('#pwsReadonly').style.display = 'block';
    } else {
      fields.forEach((s) => { $(s).disabled = false; });
      $('#pwsActions').style.display = 'flex';
    }
  } catch (e) { toast(e.message); }
}
$('#pwsSaveBtn').onclick = async () => {
  const btn = $('#pwsSaveBtn'); btn.disabled = true; btn.textContent = '保存中…';
  try {
    const ws = await api(`/projects/${currentProjectId}/workspace`, {
      method: 'PATCH',
      body: {
        background_md: $('#pwsBg').value,
        context_md: $('#pwsCtx').value,
        current_focus_md: $('#pwsFocus').value,
        version: pwsVersion,
      },
    });
    pwsVersion = ws.version;
    $('#pwsVersion').textContent = `v${ws.version}`;
    toast('工作区已保存');
  } catch (e) { toast(e.message); }
  btn.disabled = false; btn.textContent = '保存';
};

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
$('#navArchived').onclick = async () => { showView('archivedView'); await loadArchivedProjects(); };

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
let notifSSE = null;
function connectNotifSSE() {
  if (notifSSE) notifSSE.close();
  notifSSE = new EventSource(API + '/me/notifications/stream');
  notifSSE.onmessage = (ev) => {
    try {
      const d = JSON.parse(ev.data);
      if (d.type === 'notification') {
        updateNotifBadge();
        toast(d.title || '新通知');
      }
    } catch {}
  };
  notifSSE.onerror = () => { notifSSE.close(); setTimeout(connectNotifSSE, 10000); };
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

// ─── personal access tokens ───
function renderTokenScopePicker() {
  const box = $('#tokenScopes');
  if (!box || box.dataset.ready) return;
  box.innerHTML = TOKEN_SCOPE_OPTIONS.map(([scope, label]) => (
    `<label class="scope-option"><input type="checkbox" value="${scope}" ${DEFAULT_TOKEN_SCOPES.includes(scope) ? 'checked' : ''}><span>${escapeHtml(label)}</span><code>${scope}</code></label>`
  )).join('');
  const full = $('#tokenFullScope');
  const checks = Array.from(box.querySelectorAll('input[type="checkbox"]'));
  full.onchange = () => {
    checks.forEach((chk) => { chk.disabled = full.checked; });
  };
  checks.forEach((chk) => {
    chk.onchange = () => {
      if (chk.checked) {
        full.checked = false;
        checks.forEach((c) => { c.disabled = false; });
      }
    };
  });
  box.dataset.ready = '1';
}
function selectedTokenScopes() {
  if ($('#tokenFullScope').checked) return ['*'];
  return Array.from(document.querySelectorAll('#tokenScopes input[type="checkbox"]:checked')).map((el) => el.value);
}
function scopeTags(scopes) {
  return (scopes || []).map((s) => `<span class="scope-tag ${s === '*' ? 'full' : ''}">${escapeHtml(s)}</span>`).join('');
}
async function loadTokens() {
  showView('tokenView');
  renderTokenScopePicker();
  const body = $('#tokensBody'); body.innerHTML = '<div class="plan-hint">加载中…</div>';
  let items;
  try { items = await api('/me/tokens'); }
  catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  if (!items.length) { body.innerHTML = '<div class="empty-hint">还没有访问令牌。</div>'; return; }
  body.innerHTML = '';
  items.forEach((t) => {
    const row = document.createElement('div'); row.className = 'token-row';
    const agent = t.agent_name ? `<span class="ws-meta">${escapeHtml(t.agent_name)}</span>` : '';
    row.innerHTML = `<div class="token-main"><b>${escapeHtml(t.name)}</b>${agent}<div class="token-scopes">${scopeTags(t.scopes)}</div><span class="ws-meta">${t.last_used_at ? `最近使用 ${escapeHtml(fmtBriefTime(t.last_used_at))}` : '尚未使用'}</span></div><button class="btn btn-ghost btn-sm">撤销</button>`;
    row.querySelector('button').onclick = async () => {
      if (!confirm(`撤销令牌「${t.name}」？`)) return;
      try { await api(`/me/tokens/${t.id}`, { method: 'DELETE' }); await loadTokens(); toast('令牌已撤销'); }
      catch (e) { toast(e.message); }
    };
    body.appendChild(row);
  });
}
$('#navTokens').onclick = loadTokens;
$('#tokenCreateBtn').onclick = async () => {
  const name = $('#tokenName').value.trim();
  if (!name) { $('#tokenName').focus(); return; }
  const scopes = selectedTokenScopes();
  if (!scopes.length) { toast('至少选择一个权限'); return; }
  if (scopes.includes('*') && !confirm('创建全权限令牌？它可读写你的全部数据。')) return;
  const body = {
    name,
    scopes,
    agent_name: $('#tokenAgent').value.trim() || null,
    description: $('#tokenDesc').value.trim() || null,
  };
  try {
    const t = await api('/me/tokens', { method: 'POST', body });
    const overlay = $('#tokenRevealOverlay');
    $('#tokenRevealValue').textContent = t.token;
    $('#tokenRevealName').textContent = t.name;
    overlay.classList.add('show');
    $('#tokenRevealCopy').onclick = async () => {
      try { await navigator.clipboard.writeText(t.token); toast('已复制到剪贴板'); } catch { toast('复制失败'); }
    };
    $('#tokenRevealClose').onclick = () => { overlay.classList.remove('show'); };
    $('#tokenName').value = ''; $('#tokenAgent').value = ''; $('#tokenDesc').value = '';
    $('#tokenCreateResult').innerHTML = '';
    await loadTokens();
  } catch (e) { toast(e.message); }
};

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
let allSessions = [];
const WELCOME = () => `你好 ${me.display_name}，我是小T，你的工作助手。可以帮你查任务、记录工作、拆解需求，或理清今天要做什么。`;

function renderSessionSelect() {
  const sel = $('#sessionSelect');
  sel.innerHTML = allSessions.map((s) => {
    const d = new Date(s.last_active_at).toLocaleDateString();
    const label = (s.title || '对话') + ' · ' + d;
    return `<option value="${s.id}"${s.id === chatSession.id ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

async function switchSession(sessionId) {
  if (chatSocket) chatSocket.close();
  const s = allSessions.find((x) => x.id === sessionId);
  if (!s) return;
  chatSession = s;
  const msgs = (await api(`/chat/sessions/${sessionId}/messages`)).items || [];
  $('#msgs').innerHTML = '';
  if (!msgs.length) addMsg('assistant', WELCOME());
  msgs.forEach((m) => addMsg(m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : 'system'), m.content));
  connectWS();
}

$('#sessionSelect').onchange = (e) => switchSession(e.target.value);

async function startNewChat() {
  if (chatSocket) chatSocket.close();
  try {
    const body = { title: '工作助手' };
    if (currentProjectId) {
      const p = projects.find((x) => x.id === currentProjectId);
      body.title = p ? p.name : '工作助手';
      body.project_id = currentProjectId;
    }
    chatSession = await api('/chat/sessions', { method: 'POST', body });
    allSessions.unshift(chatSession);
    renderSessionSelect();
    $('#msgs').innerHTML = '';
    addMsg('assistant', WELCOME());
    connectWS();
  } catch (e) { toast(e.message); }
}
$('#newChatBtn').onclick = startNewChat;

async function initChat() {
  try {
    allSessions = (await api('/chat/sessions')).items || [];
    if (!allSessions.length) {
      chatSession = await api('/chat/sessions', { method: 'POST', body: { title: '工作助手' } });
      allSessions = [chatSession];
    } else {
      chatSession = allSessions[0];
    }
    renderSessionSelect();
    const msgs = (await api(`/chat/sessions/${chatSession.id}/messages`)).items || [];
    requestAnimationFrame(() => {
      $('#msgs').innerHTML = '';
      if (!msgs.length) addMsg('assistant', WELCOME());
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
const SLASH_COMMANDS = {
  '/new': () => { startNewChat(); return true; },
  '/clear': () => { $('#msgs').innerHTML = ''; addMsg('system', '已清屏（对话历史保留）'); return true; },
  '/help': () => { addMsg('system', '可用指令：/new 新对话 · /clear 清屏 · /help 帮助'); return true; },
};
function sendChat() {
  const inp = $('#chatInput'); const text = inp.value.trim(); if (!text) return;
  const cmd = SLASH_COMMANDS[text.toLowerCase().split(/\s/)[0]];
  if (cmd) { inp.value = ''; cmd(); return; }
  if (!chatSocket || chatSocket.readyState !== 1) return;
  addMsg('user', text); inp.value = ''; showTyping();
  chatSocket.send(JSON.stringify({ type: 'user_message', content: text, project_id: currentProjectId }));
}
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
document.addEventListener('click', () => document.querySelectorAll('.proj-menu.open').forEach((m) => m.classList.remove('open')));
$('#navToggle').onclick = () => $('#sidebar').classList.toggle('open');
$('#asstToggle').onclick = () => {
  const app = $('#app');
  if (app.classList.contains('asst-collapsed')) { app.classList.remove('asst-collapsed'); }
  else { $('#assistant').classList.toggle('open'); }
};
$('#collapseAsst').onclick = () => {
  const app = $('#app');
  if (window.innerWidth > 1100) { app.classList.add('asst-collapsed'); }
  else { $('#assistant').classList.remove('open'); }
};
['#planGoal', '#npGoal'].forEach((sel) => { const e = $(sel); if (e) e.addEventListener('input', () => { e.style.height = 'auto'; e.style.height = e.scrollHeight + 'px'; }); });

boot();
