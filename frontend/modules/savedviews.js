'use strict';

import { $, api, toast, escapeHtml, inputModal, App } from './core.js';
import { _t } from './i18n.js';
import { state } from './state.js';

let myViews = [];
let activeViewId = null;

export async function loadViewBar() {
  const bar = $('#viewBar'); if (!bar) return;
  try { myViews = await api('/me/views'); } catch { myViews = []; }
  if (!myViews.length && !activeViewId) { bar.innerHTML = ''; return; }

  bar.innerHTML = '';
  if (activeViewId) {
    const reset = document.createElement('span');
    reset.className = 'view-chip';
    reset.textContent = '× ' + _t('board');
    reset.onclick = () => { activeViewId = null; App.loadBoard(); loadViewBar(); };
    bar.appendChild(reset);
  }

  myViews.forEach((v) => {
    const chip = document.createElement('span');
    chip.className = 'view-chip' + (activeViewId === v.id ? ' active' : '');
    chip.textContent = v.name;
    chip.onclick = () => applyView(v);
    bar.appendChild(chip);
  });

  const saveChip = document.createElement('span');
  saveChip.className = 'view-chip save';
  saveChip.textContent = '+ ' + _t('ws_save');
  saveChip.onclick = saveCurrentView;
  bar.appendChild(saveChip);
}

async function applyView(view) {
  activeViewId = view.id;
  loadViewBar();
  try {
    const tasks = await api(`/views/${view.id}/tasks`);
    state.boardTasks = Array.isArray(tasks) ? tasks : (tasks.items || []);
    App.loadBoard();
  } catch (e) { toast(e.message); }
}

async function saveCurrentView() {
  const name = await inputModal('保存视图', [{ label: '视图名称', placeholder: '如：我的逾期任务' }]);
  if (!name) return;
  try {
    await api('/me/views', { method: 'POST', body: {
      name,
      project_id: state.currentProjectId,
      config: { filters: {}, sort: [{ field: 'created_at', dir: 'desc' }], group_by: 'status' },
    }});
    toast(_t('project_created'));
    await loadViewBar();
  } catch (e) { toast(e.message); }
}
