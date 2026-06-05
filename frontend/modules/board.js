'use strict';

import { $, api, toast, escapeHtml, App } from './core.js';
import { _t } from './i18n.js';
import { state, getStatuses, getStatusName, getNext, NEXT_MAP, PRIO, STATUS_NAME } from './state.js';
import { initials } from './core.js';

export async function loadBoard() {
  try { state.boardTasks = await api(`/projects/${state.currentProjectId}/tasks`); } catch (e) { toast(e.message); state.boardTasks = []; }
  const childCount = {};
  state.boardTasks.forEach((t) => { if (t.parent_task_id) childCount[t.parent_task_id] = (childCount[t.parent_task_id] || 0) + 1; });
  const board = $('#board'); board.innerHTML = '';
  for (const col of getStatuses()) {
    const items = state.boardTasks.filter((t) => t.status === col.id);
    const el = document.createElement('div'); el.className = 'col';
    el.dataset.status = col.id;
    el.innerHTML = `<div class="col-head"><span class="dot ${col.id}"></span><span class="name">${col.name}</span><span class="count">${items.length}</span></div>`;
    if (!items.length) el.insertAdjacentHTML('beforeend', `<div class="col-empty">—</div>`);
    items.forEach((t, i) => el.appendChild(card(t, i, childCount[t.id] || 0)));

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = document.querySelector('.card.dragging');
      if (!dragging) return;
      const fromStatus = dragging.dataset.status;
      const validTargets = (NEXT_MAP[fromStatus] || []).map(([s]) => s);
      if (validTargets.includes(col.id)) {
        e.dataTransfer.dropEffect = 'move'; el.classList.add('drag-over'); el.classList.remove('drag-invalid');
      } else {
        e.dataTransfer.dropEffect = 'none'; el.classList.add('drag-invalid'); el.classList.remove('drag-over');
      }
    });
    el.addEventListener('dragleave', () => { el.classList.remove('drag-over', 'drag-invalid'); });
    el.addEventListener('drop', async (e) => {
      e.preventDefault(); el.classList.remove('drag-over', 'drag-invalid');
      const taskId = e.dataTransfer.getData('text/plain'); if (!taskId) return;
      const dragging = document.querySelector('.card.dragging'); if (!dragging) return;
      const fromStatus = dragging.dataset.status;
      const validTargets = (NEXT_MAP[fromStatus] || []).map(([s]) => s);
      if (!validTargets.includes(col.id)) { toast(_t('invalid_transition')); return; }
      await move(taskId, col.id);
    });
    board.appendChild(el);
  }
  renderArchivedFold(state.boardTasks.filter((t) => t.status === 'archived'), childCount);
}

function renderArchivedFold(archived, childCount) {
  const fold = $('#archivedFold'); fold.innerHTML = '';
  if (!archived.length) return;
  const head = document.createElement('button');
  head.className = 'arch-head';
  head.innerHTML = `<span class="arch-arrow">▶</span>${_t('archived')} (${archived.length})`;
  const body = document.createElement('div'); body.className = 'arch-body';
  archived.forEach((t, i) => body.appendChild(card(t, i, childCount[t.id] || 0)));
  head.onclick = () => { head.classList.toggle('open'); body.classList.toggle('open'); };
  fold.appendChild(head); fold.appendChild(body);
}

function card(t, i, nChildren) {
  const el = document.createElement('div'); el.className = 'card'; el.style.animationDelay = (i * 0.03) + 's';
  el.dataset.taskId = t.id;
  el.dataset.status = t.status;
  const ownerName = t.owner_user_id ? (state.userMap[t.owner_user_id] || _t('members')) : null;
  const [pcls, plabel] = PRIO[t.priority] || PRIO[1];
  const isAI = (t.created_by || '').startsWith('ai_auto');
  const bits = [];
  if (ownerName) bits.push(`<span class="owner"><span class="avatar">${initials(ownerName)}</span>${escapeHtml(ownerName)}</span>`); else bits.push(`<span>${_t('unclaimed')}</span>`);
  if (t.estimated_hours) bits.push(`<span class="est">${t.estimated_hours}h</span>`);
  if (nChildren) bits.push(`<span class="subc">◧ ${nChildren} ${_t('subtasks')}</span>`);
  if (plabel) bits.push(`<span class="prio ${pcls}">${plabel}</span>`);
  if (isAI) bits.push('<span class="ai-tag">AI</span>');
  el.innerHTML = `<span class="drag-handle" draggable="true" title="drag">⠿</span><div class="ctitle">${escapeHtml(t.title)}</div>${t.description ? `<div class="cdesc">${escapeHtml(t.description)}</div>` : ''}<div class="cmeta">${bits.join('')}</div><div class="actions"></div>`;
  const actions = el.querySelector('.actions');
  const addBtn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = (e) => { e.stopPropagation(); fn(); }; actions.appendChild(b); };
  if (!t.owner_user_id) addBtn(_t('claim'), () => claim(t.id));
  getNext(t.status).forEach(([to, label]) => addBtn(label, () => move(t.id, to)));
  el.onclick = (e) => { if (!e.target.closest('.drag-handle')) openTaskDetail(t, nChildren); };

  const handle = el.querySelector('.drag-handle');
  handle.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.id);
    e.dataTransfer.setDragImage(el, 20, 20);
    requestAnimationFrame(() => el.classList.add('dragging'));
    const validTargets = (NEXT_MAP[t.status] || []).map(([s]) => s);
    document.querySelectorAll('.col').forEach((col) => { if (validTargets.includes(col.dataset.status)) col.classList.add('drop-ready'); });
  });
  handle.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    document.querySelectorAll('.col').forEach((c) => c.classList.remove('drag-over', 'drag-invalid', 'drop-ready'));
  });
  return el;
}

export async function claim(id) {
  try {
    await api(`/tasks/${id}/claim`, { method: 'POST' });
    toast(_t('claimed')); App.updateNotifBadge();
    if (state.currentProjectId) { loadBoard(); App.refreshProjMeta(); }
    api(`/tasks/${id}/impl-hint`, { method: 'POST' })
      .then((r) => { if (r && r.impl_hint && !r.skipped) { toast(_t('ai_hint')); if (state.currentProjectId) loadBoard(); if ($('#tab-plan').style.display === 'block') App.renderPlanImplHints(); } })
      .catch(() => {});
  } catch (e) { toast(e.message); }
}

export async function move(id, to) {
  try { await api(`/tasks/${id}`, { method: 'PATCH', body: { status: to } }); if (state.currentProjectId) { loadBoard(); App.refreshProjMeta(); } } catch (e) { toast(e.message); }
}

let editingTask = false;

export function openTaskDetail(t, nChildren) {
  editingTask = false;
  renderTaskDetail(t);
  $('#taskOverlay').classList.add('show');
}

function renderTaskDetail(t) {
  $('#tdStatus').textContent = STATUS_NAME[t.status] || t.status;
  const owner = t.owner_user_id ? (state.userMap[t.owner_user_id] || _t('members')) : _t('unclaimed');
  const children = state.boardTasks.filter((x) => x.parent_task_id === t.id);
  const childHtml = children.length
    ? `<div class="td-field"><div class="lbl">${_t('subtasks')} (${children.length})</div>${children.map((c) => `<div class="td-sub"><span class="st-status">${getStatusName(c.status)}</span>${escapeHtml(c.title)}${c.estimated_hours ? ` · ${c.estimated_hours}h` : ''}</div>`).join('')}</div>` : '';

  if (editingTask) {
    $('#tdTitle').innerHTML = `<input id="tdEditTitle" value="${escapeHtml(t.title)}" style="width:100%;font-size:16px;font-weight:600;border:1px solid var(--border);border-radius:var(--radius);padding:4px 8px;outline:none">`;
    $('#tdBody').innerHTML = `
      <div class="td-field"><div class="lbl">${_t('description')}</div><textarea id="tdEditDesc" rows="3" style="width:100%;font-size:13px;border:1px solid var(--border);border-radius:var(--radius);padding:6px 8px;outline:none;resize:vertical;font-family:inherit">${escapeHtml(t.description || '')}</textarea></div>
      <div class="td-field"><div class="lbl">${_t('priority_time')}</div>
        <div style="display:flex;gap:8px">
          <select id="tdEditPrio" style="padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px">
            <option value="0" ${t.priority === 0 ? 'selected' : ''}>Low</option>
            <option value="1" ${t.priority === 1 ? 'selected' : ''}>Normal</option>
            <option value="2" ${t.priority === 2 ? 'selected' : ''}>High</option>
            <option value="3" ${t.priority === 3 ? 'selected' : ''}>Urgent</option>
          </select>
          <input id="tdEditHours" type="number" step="0.5" min="0" value="${t.estimated_hours || ''}" placeholder="估时(h)" style="width:80px;padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px">
        </div>
      </div>
      ${t.impl_hint ? `<div class="td-field"><div class="lbl">${_t('ai_hint')}</div><div class="val">${escapeHtml(t.impl_hint)}</div></div>` : ''}
      ${childHtml}`;
  } else {
    $('#tdTitle').textContent = t.title;
    const hintHtml = t.impl_hint
      ? `<div class="td-field"><div class="lbl" style="display:flex;align-items:center;justify-content:space-between">${_t('ai_hint')}<button class="td-hint-btn" style="font-size:10px;color:var(--gold);cursor:pointer;background:none;border:none">${_t('regen_hint')}</button></div><div class="val">${escapeHtml(t.impl_hint)}</div></div>`
      : `<div class="td-field"><div class="lbl" style="display:flex;align-items:center;justify-content:space-between">${_t('ai_hint')}<button class="td-hint-btn" style="font-size:10px;color:var(--gold);cursor:pointer;background:none;border:none">${_t('gen_hint')}</button></div><div class="val" style="color:var(--text-3)">${_t('none')}</div></div>`;
    $('#tdBody').innerHTML = `
      ${t.description ? `<div class="td-field"><div class="lbl">${_t('description')}</div><div class="val">${escapeHtml(t.description)}</div></div>` : `<div class="td-field"><div class="lbl">${_t('description')}</div><div class="val" style="color:var(--text-3)">${_t('none')}</div></div>`}
      <div class="td-field"><div class="lbl">${_t('owner')}</div><div class="val">${escapeHtml(owner)}</div></div>
      <div class="td-field"><div class="lbl">${_t('priority_time')}</div><div class="val">${(PRIO[t.priority] || PRIO[1])[0]}${t.estimated_hours ? ` · ${t.estimated_hours}h` : ''}</div></div>
      ${hintHtml}
      ${childHtml}`;
    const hintBtn = $('#tdBody').querySelector('.td-hint-btn');
    if (hintBtn) hintBtn.onclick = async () => {
      hintBtn.disabled = true; hintBtn.textContent = _t('generating');
      try {
        const r = await api(`/tasks/${t.id}/impl-hint${t.impl_hint ? '?regenerate=true' : ''}`, { method: 'POST' });
        if (r.impl_hint && !r.skipped) { t.impl_hint = r.impl_hint; renderTaskDetail(t); }
        else { hintBtn.textContent = t.impl_hint ? _t('regen_hint') : _t('gen_hint'); hintBtn.disabled = false; }
      } catch (e) { toast(e.message); hintBtn.textContent = t.impl_hint ? _t('regen_hint') : _t('gen_hint'); hintBtn.disabled = false; }
    };
  }

  const foot = $('#tdFoot'); foot.innerHTML = '';

  if (editingTask) {
    const saveBtn = document.createElement('button'); saveBtn.className = 'btn btn-primary'; saveBtn.textContent = _t('ws_save');
    saveBtn.onclick = async () => {
      try {
        await api(`/tasks/${t.id}`, { method: 'PATCH', body: {
          title: document.getElementById('tdEditTitle').value.trim() || t.title,
          description: document.getElementById('tdEditDesc').value,
          priority: parseInt(document.getElementById('tdEditPrio').value, 10),
          estimated_hours: parseFloat(document.getElementById('tdEditHours').value) || null,
        }});
        $('#taskOverlay').classList.remove('show');
        if (state.currentProjectId) loadBoard();
      } catch (e) { toast(e.message); }
    };
    foot.appendChild(saveBtn);
    const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn btn-ghost'; cancelBtn.textContent = _t('cancel');
    cancelBtn.onclick = () => { editingTask = false; renderTaskDetail(t); };
    foot.appendChild(cancelBtn);
  } else {
    const editBtn = document.createElement('button'); editBtn.className = 'btn btn-ghost'; editBtn.textContent = _t('edit');
    editBtn.onclick = () => { editingTask = true; renderTaskDetail(t); };
    foot.appendChild(editBtn);
    const delBtn = document.createElement('button'); delBtn.className = 'btn btn-ghost'; delBtn.style.color = 'var(--danger)'; delBtn.textContent = _t('delete_btn');
    delBtn.onclick = async () => {
      if (!confirm(_t('delete_confirm')(t.title))) return;
      try { await api(`/tasks/${t.id}`, { method: 'DELETE' }); $('#taskOverlay').classList.remove('show'); if (state.currentProjectId) { loadBoard(); App.refreshProjMeta(); } } catch (e) { toast(e.message); }
    };
    foot.appendChild(delBtn);
    if (!t.owner_user_id) { const b = document.createElement('button'); b.className = 'btn btn-soft'; b.textContent = _t('claim'); b.onclick = async () => { await claim(t.id); $('#taskOverlay').classList.remove('show'); }; foot.appendChild(b); }
    getNext(t.status).forEach(([to, label]) => { const b = document.createElement('button'); b.className = 'btn btn-ghost'; b.textContent = label; b.onclick = async () => { await move(t.id, to); $('#taskOverlay').classList.remove('show'); }; foot.appendChild(b); });
    const close = document.createElement('button'); close.className = 'btn btn-primary'; close.textContent = _t('close'); close.onclick = () => $('#taskOverlay').classList.remove('show'); foot.appendChild(close);
  }
}
