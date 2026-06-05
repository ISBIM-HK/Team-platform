'use strict';

import { $, api, toast, escapeHtml } from './core.js';
import { App } from './core.js';
import { _t } from './i18n.js';
import { state } from './state.js';

const VIEWS = ['emptyState', 'projectView', 'suggestionsView', 'archivedView', 'notificationsView', 'tokenView', 'integrationsView', 'costView', 'adminView', 'helpView'];

export function showView(id) {
  VIEWS.forEach((v) => $('#' + v).style.display = v === id ? 'block' : 'none');
  $('#navSuggestions').classList.toggle('active-nav', id === 'suggestionsView');
  $('#navArchived').classList.toggle('active-nav', id === 'archivedView');
  $('#navNotifications').classList.toggle('active-nav', id === 'notificationsView');
  $('#navTokens').classList.toggle('active-nav', id === 'tokenView');
  $('#navIntegrations').classList.toggle('active-nav', id === 'integrationsView');
  $('#navCost').classList.toggle('active-nav', id === 'costView');
  $('#navAdmin').classList.toggle('active-nav', id === 'adminView');
  $('#navHelp').classList.toggle('active-nav', id === 'helpView');
  if (id !== 'projectView') { state.currentProjectId = null; document.querySelectorAll('.proj-item').forEach((el) => el.classList.remove('active')); }
  if (window.innerWidth <= 760) $('#sidebar').classList.remove('open');
}

export function selectProject(id) {
  state.currentProjectId = id;
  showView('projectView');
  document.querySelectorAll('.proj-item').forEach((el, i) => el.classList.toggle('active', state.projects[i] && state.projects[i].id === id));
  const p = state.projects.find((x) => x.id === id); if (!p) return;
  $('#pvName').textContent = p.name;
  $('#pvMeta').textContent = `${p.task_count} ${_t('tasks_unit')} · ${_t('completion')} ${Math.round(p.completion * 100)}%`;
  switchTab('board');
}

export function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.ws-actions .btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  ['board', 'plan', 'share', 'pwspace', 'pages', 'cycles'].forEach((t) => $(`#tab-${t}`).style.display = t === tab ? 'block' : 'none');
  if (tab === 'board') { App.loadBoard(); App.loadViewBar(); }
  else if (tab === 'share') App.loadShare();
  else if (tab === 'plan') { App.renderPlanSuggestions(); App.renderPlanImplHints(); }
  else if (tab === 'pwspace') App.loadProjectWorkspace();
  else if (tab === 'pages') App.loadPages();
  else if (tab === 'cycles') App.loadCycles();
}

let projEditMode = false;

export async function loadProjects(selectId) {
  try { state.projects = await api('/projects'); } catch (e) { toast(e.message); state.projects = []; }
  const list = $('#projectList'); list.innerHTML = '';
  state.projects.forEach((p, idx) => {
    const el = document.createElement('div');
    el.className = 'proj-item' + (p.id === state.currentProjectId ? ' active' : '') + (projEditMode ? ' edit-mode' : '');
    el.draggable = true;
    el.dataset.projId = p.id;
    el.dataset.projIdx = idx;
    el.innerHTML = `<input type="checkbox" class="proj-check" data-id="${p.id}"><span class="pdot"></span><span class="pname">${escapeHtml(p.name)}</span><span class="pcount">${p.task_count}</span>`
      + (p.name !== '未分类' ? `<button class="proj-menu-btn" title="更多">···</button><div class="proj-menu"><button data-action="archive">归档项目</button><button data-action="delete" class="danger">删除项目</button></div>` : '');
    el.querySelector('.pname').onclick = () => selectProject(p.id);
    el.querySelector('.pdot').onclick = () => selectProject(p.id);
    const menuBtn = el.querySelector('.proj-menu-btn');
    if (menuBtn) {
      menuBtn.onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.proj-menu.open').forEach((m) => m.classList.remove('open')); el.querySelector('.proj-menu').classList.toggle('open'); };
      el.querySelector('[data-action="archive"]').onclick = async (e) => {
        e.stopPropagation(); if (!confirm(`归档项目「${p.name}」？`)) return;
        try { await api(`/projects/${p.id}`, { method: 'PATCH', body: { status: 'archived' } }); toast(_t('proj_archived')); if (state.currentProjectId === p.id) { state.currentProjectId = null; showView('emptyState'); } await loadProjects(); await App.loadSuggestions(); } catch (err) { toast(err.message); }
      };
      el.querySelector('[data-action="delete"]').onclick = async (e) => {
        e.stopPropagation(); if (!confirm(`删除项目「${p.name}」？此操作不可恢复。`)) return;
        try { await api(`/projects/${p.id}`, { method: 'DELETE' }); toast(_t('proj_deleted')); if (state.currentProjectId === p.id) { state.currentProjectId = null; showView('emptyState'); } await loadProjects(); await App.loadSuggestions(); } catch (err) { toast(err.message); }
      };
    }
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', p.id);
      requestAnimationFrame(() => el.classList.add('dragging'));
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      list.querySelectorAll('.proj-item').forEach((x) => x.classList.remove('proj-drop-above', 'proj-drop-below'));
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      el.classList.toggle('proj-drop-above', e.clientY < mid);
      el.classList.toggle('proj-drop-below', e.clientY >= mid);
    });
    el.addEventListener('dragleave', () => { el.classList.remove('proj-drop-above', 'proj-drop-below'); });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('proj-drop-above', 'proj-drop-below');
      const dragId = e.dataTransfer.getData('text/plain');
      if (!dragId || dragId === p.id) return;
      const above = e.clientY < el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2;
      const items = [...list.querySelectorAll('.proj-item')];
      const dragEl = items.find((x) => x.dataset.projId === dragId);
      if (!dragEl) return;
      dragEl.remove();
      if (above) el.before(dragEl); else el.after(dragEl);
      const ids = [...list.querySelectorAll('.proj-item')].map((x) => x.dataset.projId);
      try { await api('/projects/reorder', { method: 'POST', body: { project_ids: ids } }); await loadProjects(); } catch (err) { toast(err.message); }
    });
    list.appendChild(el);
  });
  if (selectId) selectProject(selectId);
}

export async function loadArchivedProjects() {
  let all = [];
  try { all = await api('/projects?include_archived=true'); } catch (e) { toast(e.message); }
  state.archivedProjects = all.filter((p) => p.status === 'archived');
  renderArchivedProjects();
}

function renderArchivedProjects() {
  $('#archivedMeta').textContent = `${state.archivedProjects.length} ${_t('projects')}`;
  const body = $('#archivedProjectsBody'); body.innerHTML = '';
  if (!state.archivedProjects.length) { body.innerHTML = `<div class="empty-hint">${_t('no_data')}</div>`; return; }
  state.archivedProjects.forEach((p) => {
    const row = document.createElement('div'); row.className = 'admin-row';
    row.innerHTML = `<span class="pdot"></span><span class="ar-name"><b>${escapeHtml(p.name)}</b><span class="ws-meta">${p.task_count} ${_t('tasks_unit')} · ${_t('completion')} ${Math.round(p.completion * 100)}%</span></span><button class="btn btn-soft btn-sm">${_t('restore')}</button>`;
    row.querySelector('button').onclick = async () => {
      try { await api(`/projects/${p.id}`, { method: 'PATCH', body: { status: 'active' } }); toast(_t('restore')); await loadProjects(p.id); await App.loadSuggestions(); await loadArchivedProjects(); } catch (e) { toast(e.message); }
    };
    body.appendChild(row);
  });
}

export async function refreshProjMeta() {
  if (!state.currentProjectId) return;
  try {
    const p = await api(`/projects/${state.currentProjectId}`);
    const idx = state.projects.findIndex((x) => x.id === p.id);
    if (idx >= 0) state.projects[idx] = p;
    $('#pvMeta').textContent = `${p.task_count} ${_t('tasks_unit')} · ${_t('completion')} ${Math.round(p.completion * 100)}%`;
    const item = document.querySelectorAll('.proj-item')[idx];
    if (item) item.querySelector('.pcount').textContent = p.task_count;
  } catch {}
}

export async function loadUsers() {
  try { const r = await api('/users'); (Array.isArray(r) ? r : r.items || []).forEach((u) => state.userMap[u.id] = u.display_name); } catch {}
}

export function initViews() {
  document.querySelectorAll('.tab').forEach((t) => t.onclick = () => switchTab(t.dataset.tab));
  $('#pvPlanBtn').onclick = () => switchTab('plan');
  $('#pvWorkspaceBtn').onclick = () => switchTab('pwspace');
  $('#navSuggestions').onclick = () => { showView('suggestionsView'); App.renderSuggestionsView(); };
  $('#navArchived').onclick = async () => { showView('archivedView'); await loadArchivedProjects(); };

  $('#projEditToggle').onclick = () => {
    projEditMode = !projEditMode;
    $('#projBatchBar').style.display = projEditMode ? 'flex' : 'none';
    document.querySelectorAll('.proj-item').forEach((el) => el.classList.toggle('edit-mode', projEditMode));
    if (!projEditMode) document.querySelectorAll('.proj-check').forEach((c) => { c.checked = false; });
  };
  $('#projEditDone').onclick = () => { projEditMode = false; $('#projBatchBar').style.display = 'none'; document.querySelectorAll('.proj-item').forEach((el) => el.classList.remove('edit-mode')); };
  $('#projSelectAll').onclick = () => { const checks = document.querySelectorAll('.proj-check'); const allChecked = [...checks].every((c) => c.checked); checks.forEach((c) => { c.checked = !allChecked; }); };
  $('#projBatchDelete').onclick = async () => {
    const ids = [...document.querySelectorAll('.proj-check:checked')].map((c) => c.dataset.id);
    if (!ids.length) return;
    if (!confirm(`删除 ${ids.length} 个项目？此操作不可恢复。`)) return;
    for (const id of ids) { try { await api(`/projects/${id}`, { method: 'DELETE' }); } catch {} }
    projEditMode = false; $('#projBatchBar').style.display = 'none';
    if (ids.includes(state.currentProjectId)) { state.currentProjectId = null; showView('emptyState'); }
    await loadProjects(); await App.loadSuggestions();
    toast(`已删除 ${ids.length} 个项目`);
  };

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

  document.querySelectorAll('.overlay').forEach((ov) => {
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('show'); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.overlay.show').forEach((ov) => ov.classList.remove('show'));
  });
}
