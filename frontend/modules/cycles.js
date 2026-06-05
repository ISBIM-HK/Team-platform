'use strict';

import { $, api, toast, escapeHtml, fmtBriefTime, inputModal } from './core.js';
import { _t } from './i18n.js';
import { state, getStatusName } from './state.js';

let allCycles = [];
let selectedCycleId = null;

export async function loadCycles() {
  if (!state.currentProjectId) return;
  const body = $('#cyclesBody'); if (!body) return;
  try { allCycles = await api(`/projects/${state.currentProjectId}/cycles`); } catch (e) { toast(e.message); allCycles = []; }
  renderCycles(body);
}

function renderCycles(body) {
  const canManage = state.me.is_pm || state.me.is_admin;

  body.innerHTML = `
    ${canManage ? `<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="btn btn-primary btn-sm" id="newCycleBtn">+ ${_t('cycles_tab')}</button></div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div id="cycleList"></div>
      <div id="cycleDetail"></div>
    </div>
  `;

  const newBtn = $('#newCycleBtn');
  if (newBtn) newBtn.onclick = createCycle;

  renderCycleList();
  if (selectedCycleId) loadCycleDetail(selectedCycleId);
  else if (allCycles.length) { selectedCycleId = allCycles[0].id; loadCycleDetail(selectedCycleId); }
  else $('#cycleDetail').innerHTML = `<div class="plan-hint">${_t('no_data')}</div>`;
}

function renderCycleList() {
  const list = $('#cycleList'); if (!list) return;
  if (!allCycles.length) { list.innerHTML = `<div class="plan-hint">${_t('no_data')}</div>`; return; }
  list.innerHTML = '';

  allCycles.forEach((c) => {
    const isActive = c.status === 'active';
    const pct = c.completion_pct || 0;
    const statusLabel = { planned: _t('s_todo'), active: _t('s_in_progress'), completed: _t('s_done'), archived: _t('archived_tasks') }[c.status] || c.status;
    const statusCls = { active: 'active', completed: 'completed', planned: 'planned' }[c.status] || 'planned';
    const card = document.createElement('div');
    card.className = 'cycle-card' + (isActive ? ' active-cycle' : '') + (c.id === selectedCycleId ? ' selected' : '');
    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <b style="font-size:14px">${escapeHtml(c.name)}</b>
        <span class="integ-status ${statusCls}" style="font-size:10px">${statusLabel}</span>
      </div>
      <div style="font-size:10px;color:var(--text-2);margin-bottom:6px">${c.start_date} → ${c.end_date}</div>
      <div class="cycle-bar"><i style="width:${pct}%"></i></div>
    `;
    card.style.cursor = 'pointer';
    card.onclick = () => { selectedCycleId = c.id; renderCycleList(); loadCycleDetail(c.id); };
    list.appendChild(card);
  });
}

async function loadCycleDetail(cycleId) {
  const detail = $('#cycleDetail'); if (!detail) return;
  detail.innerHTML = `<div class="plan-hint">${_t('loading')}</div>`;
  let cycle;
  try { cycle = await api(`/projects/${state.currentProjectId}/cycles/${cycleId}`); } catch (e) { detail.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }

  const stats = cycle.stats || {};
  const tasks = cycle.tasks || [];
  const canManage = state.me.is_pm || state.me.is_admin;
  const isOpen = cycle.status === 'active' || cycle.status === 'planned';

  let taskHtml = tasks.map((t) => {
    const stColor = { todo: 'var(--text-3)', in_progress: 'var(--gold)', blocked: 'var(--warn)', review: '#f59e0b', done: 'var(--ok)' }[t.status] || 'var(--text-3)';
    return `<div class="cd-task"><span class="st" style="background:${stColor}"></span><span class="name">${escapeHtml(t.title)}</span>${t.owner_user_id && state.userMap[t.owner_user_id] ? `<span class="av">${escapeHtml((state.userMap[t.owner_user_id] || '?').slice(0, 2).toUpperCase())}</span>` : ''}</div>`;
  }).join('');

  if (canManage && isOpen) taskHtml += `<div style="font-size:11px;color:var(--gold);padding:6px 2px;cursor:pointer" id="addCycleTask">+ ${_t('add_tasks')}</div>`;

  detail.innerHTML = `
    <div style="font-size:14px;font-weight:600;margin-bottom:8px">${escapeHtml(cycle.name)}</div>
    <div style="display:grid;grid-template-columns:1fr 180px;gap:10px">
      <div class="cd-tasks">${taskHtml || `<div class="plan-hint">${_t('no_data')}</div>`}</div>
      <div class="cd-summary" style="border:1px solid var(--border);border-radius:var(--radius);padding:10px;background:var(--surface-2)">
        <div style="font-size:12px;font-weight:600;margin-bottom:6px">${_t('completion_rate')}</div>
        <div class="cd-stat"><span>${_t('tasks_unit')}</span><span class="val">${stats.total || 0}</span></div>
        <div class="cd-stat"><span>${_t('s_done')}</span><span class="val" style="color:var(--ok)">${stats.completed || 0}</span></div>
        <div class="cd-stat"><span>${_t('s_in_progress')}</span><span class="val" style="color:var(--gold)">${stats.in_progress || 0}</span></div>
        <div class="cd-stat"><span>${_t('s_todo')}</span><span class="val">${stats.todo || 0}</span></div>
        <div class="cd-stat"><span>${_t('s_blocked')}</span><span class="val" style="color:var(--warn)">${stats.blocked || 0}</span></div>
        <div class="cd-stat"><span style="font-weight:600">${_t('completion')}</span><span class="val" style="font-weight:700">${stats.completion_pct || 0}%</span></div>
      </div>
    </div>
    ${canManage && cycle.status === 'active' ? `<div style="margin-top:10px;display:flex;gap:6px"><button class="btn btn-ghost btn-sm" id="closeCycleBtn">${_t('complete')}</button></div>` : ''}
  `;

  const addBtn = $('#addCycleTask');
  if (addBtn) addBtn.onclick = () => addTaskToCycle(cycleId);
  const closeBtn = $('#closeCycleBtn');
  if (closeBtn) closeBtn.onclick = () => closeCycle(cycleId);
}

async function createCycle() {
  const result = await inputModal('新建周期', [
    { label: '名称', placeholder: '如：施工图阶段' },
    { label: '开始日期', type: 'date', default: new Date().toISOString().slice(0, 10) },
    { label: '结束日期', type: 'date' },
  ]);
  if (!result) return;
  const [name, start, end] = result;
  try {
    const c = await api(`/projects/${state.currentProjectId}/cycles`, {
      method: 'POST', body: { name, start_date: start, end_date: end, status: 'planned' },
    });
    selectedCycleId = c.id;
    await loadCycles();
  } catch (e) { toast(e.message); }
}

async function addTaskToCycle(cycleId) {
  let tasks;
  try { tasks = await api(`/projects/${state.currentProjectId}/tasks`); } catch { return; }
  const cycleTasks = (await api(`/projects/${state.currentProjectId}/cycles/${cycleId}`)).tasks || [];
  const cycleTaskIds = new Set(cycleTasks.map((t) => t.id));
  const available = tasks.filter((t) => !cycleTaskIds.has(t.id) && t.status !== 'archived');
  if (!available.length) { toast(_t('no_data')); return; }

  const names = available.map((t, i) => `${i + 1}. ${t.title}`).join('\n');
  const choice = prompt(`${_t('add_tasks')}:\n${names}\n\n${_t('token_name')} (1-${available.length}):`);
  if (!choice) return;
  const idx = parseInt(choice, 10) - 1;
  if (idx < 0 || idx >= available.length) return;

  try {
    await api(`/projects/${state.currentProjectId}/cycles/${cycleId}/tasks`, {
      method: 'POST', body: { task_id: available[idx].id },
    });
    await loadCycleDetail(cycleId);
  } catch (e) { toast(e.message); }
}

async function closeCycle(cycleId) {
  if (!confirm(_t('complete') + '?')) return;
  try {
    const result = await api(`/projects/${state.currentProjectId}/cycles/${cycleId}/close`, { method: 'POST' });
    toast(`${_t('s_done')} · ${result.completed_count || 0} ${_t('tasks_unit')}`);
    await loadCycles();
  } catch (e) { toast(e.message); }
}
