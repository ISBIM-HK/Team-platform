'use strict';

import { $, api, toast, escapeHtml, App } from './core.js';
import { _t } from './i18n.js';
import { state, getSugLabel } from './state.js';

function sugCard(s, onDone) {
  const ref = s.target_ref || {}; const text = ref.project_name || ref.title || (getSugLabel(s.suggestion_type));
  const el = document.createElement('div'); el.className = 'sug';
  const n = (ref.subtasks || []).length;
  el.innerHTML = `<div class="stype">${getSugLabel(s.suggestion_type)} · ${Math.round(s.confidence * 100)}%${n ? ` · ${n} 子任务` : ''}</div><div class="stext">${escapeHtml(text)}</div><div class="sration">${escapeHtml(s.rationale || '')}</div><div class="sact"><button class="btn btn-primary btn-sm">${_t('accept')}</button><button class="btn btn-ghost btn-sm">${_t('reject_sug')}</button></div>`;
  const [acc, rej] = el.querySelectorAll('button');
  acc.onclick = async () => { try { const r = await api(`/suggestions/${s.id}/accept`, { method: 'POST' }); toast(_t('created_tasks')(r.created_tasks.length)); await App.loadProjects(); await loadSuggestions(); App.updateNotifBadge(); onDone && onDone(); } catch (e) { toast(e.message); } };
  rej.onclick = async () => { try { await api(`/suggestions/${s.id}/reject`, { method: 'POST', body: { reason: 'rejected' } }); await loadSuggestions(); onDone && onDone(); } catch (e) { toast(e.message); } };
  return el;
}

export async function loadSuggestions() {
  try { state.allSuggestions = (await api('/suggestions?status=pending')).items || []; } catch { state.allSuggestions = []; }
  const badge = $('#sugBadge'); badge.style.display = state.allSuggestions.length ? 'inline-grid' : 'none'; badge.textContent = state.allSuggestions.length;
  if ($('#suggestionsView').style.display === 'block') renderSuggestionsView();
  if ($('#tab-plan').style.display === 'block') renderPlanSuggestions();
}

export function renderSuggestionsView() {
  $('#sugMeta').textContent = `${state.allSuggestions.length} ${_t('pending_count')}`;
  const body = $('#suggestionsBody'); body.innerHTML = '';
  if (!state.allSuggestions.length) { body.innerHTML = `<div class="empty-hint">${_t('no_suggestions')}</div>`; return; }
  state.allSuggestions.forEach((s) => body.appendChild(sugCard(s, renderSuggestionsView)));
}

export function renderPlanSuggestions() {
  const mine = state.allSuggestions.filter((s) => (s.target_ref || {}).project_id === state.currentProjectId);
  const body = $('#planSuggestions'); body.innerHTML = '';
  if (!mine.length) { body.innerHTML = `<div class="plan-hint">${_t('no_proj_suggestions')}</div>`; return; }
  mine.forEach((s) => body.appendChild(sugCard(s, () => { renderPlanSuggestions(); App.loadBoard(); App.refreshProjMeta(); })));
}

export async function renderPlanImplHints() {
  const body = $('#planImplHints'); if (!body) return;
  let tasks; try { tasks = await api(`/projects/${state.currentProjectId}/tasks`); } catch { tasks = []; }
  const parents = new Set(tasks.filter((t) => t.parent_task_id).map((t) => t.parent_task_id));
  const mine = tasks.filter((t) => t.owner_user_id === state.me.id && !parents.has(t.id));
  if (!mine.length) { body.innerHTML = `<div class="plan-hint">${_t('claim_hint')}</div>`; return; }
  body.innerHTML = '';
  mine.forEach((t) => {
    const el = document.createElement('div'); el.className = 'ih-card';
    const hint = t.impl_hint ? `<div class="ih-text">${escapeHtml(t.impl_hint)}</div>` : `<div class="plan-hint">${_t('claim_hint')}</div>`;
    el.innerHTML = `<div class="ih-head"><span class="ih-title">${escapeHtml(t.title)}</span><button class="btn btn-ghost btn-sm">${t.impl_hint ? _t('regen_hint') : _t('gen_hint')}</button></div>${hint}`;
    el.querySelector('button').onclick = async (e) => {
      const btn = e.target; btn.disabled = true; btn.textContent = _t('generating');
      try {
        const r = await api(`/tasks/${t.id}/impl-hint${t.impl_hint ? '?regenerate=true' : ''}`, { method: 'POST' });
        if (r.impl_hint && !r.skipped) renderPlanImplHints();
        else { btn.disabled = false; btn.textContent = t.impl_hint ? _t('regen_hint') : _t('gen_hint'); }
      } catch (err) { btn.disabled = false; btn.textContent = _t('gen_hint'); toast(err.message); }
    };
    body.appendChild(el);
  });
}

let currentSug = null, pendingProjectName = null, editableSubtasks = [];

function openPlan(resp, { eyebrow, projectName }) {
  currentSug = resp.suggestion_id; pendingProjectName = projectName || null;
  const plan = resp.plan || {};
  editableSubtasks = (plan.subtasks || []).map((st) => ({ ...st, _enabled: true }));
  $('#planEyebrow').textContent = eyebrow || _t('decompose_title');
  $('#planTitle').textContent = plan.title || '';
  $('#planRationale').textContent = plan.description || resp.message || '';
  renderPlanSubtasks();
  $('#planOverlay').classList.add('show');
}

function renderPlanSubtasks() {
  const enabled = editableSubtasks.filter((s) => s._enabled);
  $('#planConf').textContent = enabled.length + ` ${_t('subtasks')}`;
  const body = $('#planBody'); body.innerHTML = '';
  editableSubtasks.forEach((st, i) => {
    const r = document.createElement('div'); r.className = 'subtask' + (st._enabled ? '' : ' disabled');
    r.style.animationDelay = (i * 0.03) + 's';
    if (!st._enabled) r.style.opacity = '0.4';
    r.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <input type="checkbox" class="st-check" ${st._enabled ? 'checked' : ''} style="accent-color:var(--gold);cursor:pointer">
        <span class="idx">${i + 1}</span>
      </div>
      <div class="st-body" style="flex:1;min-width:0">
        <input class="st-title-input" value="${escapeHtml(st.title)}" style="width:100%;font-size:13px;font-weight:500;border:1px solid var(--border);border-radius:var(--radius-sm);padding:4px 6px;outline:none;background:var(--surface)">
        <textarea class="st-desc-input" rows="2" placeholder="${_t('description')}…" style="width:100%;font-size:12px;margin-top:4px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:4px 6px;outline:none;resize:vertical;font-family:inherit;background:var(--surface)">${escapeHtml(st.description || '')}</textarea>
        <div style="display:flex;gap:6px;margin-top:4px;align-items:center">
          <input class="st-hours-input" type="number" step="0.5" min="0" value="${st.estimated_hours || ''}" placeholder="估时(h)" style="width:70px;font-size:11px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:3px 5px;outline:none;background:var(--surface)">
          ${st.suggested_owner_hint ? `<span style="font-size:11px;color:var(--text-3)">${escapeHtml(st.suggested_owner_hint)}</span>` : ''}
          <button class="st-del" style="margin-left:auto;font-size:11px;color:var(--danger);cursor:pointer;background:none;border:none">移除</button>
        </div>
      </div>`;
    const check = r.querySelector('.st-check');
    check.onchange = () => { st._enabled = check.checked; renderPlanSubtasks(); };
    r.querySelector('.st-title-input').oninput = (e) => { st.title = e.target.value; };
    r.querySelector('.st-desc-input').oninput = (e) => { st.description = e.target.value; };
    r.querySelector('.st-hours-input').oninput = (e) => { st.estimated_hours = parseFloat(e.target.value) || null; };
    r.querySelector('.st-del').onclick = () => { editableSubtasks.splice(i, 1); renderPlanSubtasks(); };
    body.appendChild(r);
  });
  const addRow = document.createElement('div');
  addRow.style.cssText = 'padding:8px 0;';
  addRow.innerHTML = `<button class="btn btn-ghost btn-sm" id="planAddSt">+ ${_t('add_tasks')}</button>`;
  body.appendChild(addRow);
  document.getElementById('planAddSt').onclick = () => {
    editableSubtasks.push({ title: '', description: '', estimated_hours: null, _enabled: true });
    renderPlanSubtasks();
    const inputs = body.querySelectorAll('.st-title-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  };
}

export function initDecompose() {
  $('#newProjectBtn').onclick = () => { $('#npGoal').value = ''; $('#npName').value = ''; $('#projectOverlay').classList.add('show'); };
  $('#npClose').onclick = $('#npCancel').onclick = () => $('#projectOverlay').classList.remove('show');
  $('#npDecomposeBtn').onclick = async () => {
    const goal = $('#npGoal').value.trim(); if (!goal) { $('#npGoal').focus(); return; }
    const btn = $('#npDecomposeBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' + _t('decomposing');
    try { const r = await api('/decompose', { method: 'POST', body: { goal } }); $('#projectOverlay').classList.remove('show'); openPlan(r, { eyebrow: _t('new_proj_eyebrow'), projectName: r.plan.title }); }
    catch (e) { toast(e.message); } finally { btn.disabled = false; btn.textContent = _t('ai_decompose'); }
  };
  $('#npManualBtn').onclick = async () => {
    const name = $('#npName').value.trim(); if (!name) { $('#npName').focus(); return; }
    try { const p = await api('/projects', { method: 'POST', body: { name } }); $('#projectOverlay').classList.remove('show'); await App.loadProjects(p.id); toast(_t('project_created')); }
    catch (e) { toast(e.message); }
  };
  $('#planDecomposeBtn').onclick = async () => {
    const goal = $('#planGoal').value.trim(); if (!goal || !state.currentProjectId) { $('#planGoal').focus(); return; }
    const btn = $('#planDecomposeBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try { const r = await api('/decompose', { method: 'POST', body: { goal, project_id: state.currentProjectId } }); $('#planGoal').value = ''; openPlan(r, { eyebrow: _t('decompose_title'), projectName: null }); }
    catch (e) { toast(e.message); } finally { btn.disabled = false; btn.textContent = _t('decompose'); }
  };
  $('#planReject').onclick = async () => { $('#planOverlay').classList.remove('show'); if (currentSug) { try { await api(`/suggestions/${currentSug}/reject`, { method: 'POST', body: { reason: 'dismissed' } }); } catch {} } loadSuggestions(); };
  $('#planAccept').onclick = async () => {
    if (!currentSug) return;
    try {
      const filtered = editableSubtasks.filter((s) => s._enabled && s.title.trim());
      const override = { subtasks: filtered.map((s) => ({ title: s.title.trim(), description: s.description || '', estimated_hours: s.estimated_hours, suggested_owner_hint: s.suggested_owner_hint || null })) };
      const r = await api(`/suggestions/${currentSug}/accept`, { method: 'POST', body: override });
      toast(_t('created_tasks')(r.created_tasks.length)); $('#planOverlay').classList.remove('show');
      const selName = pendingProjectName;
      await App.loadProjects(); await loadSuggestions();
      if (selName) { const np = state.projects.find((p) => p.name === selName); if (np) App.selectProject(np.id); }
      else if (state.currentProjectId) App.selectProject(state.currentProjectId);
    } catch (e) { toast(e.message); }
  };
}
