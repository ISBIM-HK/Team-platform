'use strict';

import { $, api, toast, escapeHtml, fmtBriefTime, App } from './core.js';
import { _t, currentLang } from './i18n.js';
import { state, getStatuses, getStatusName } from './state.js';
import { initials } from './core.js';

function briefSections(b) {
  const list = (title, items, cls) => items && items.length
    ? `<div class="brief-sec ${cls}"><div class="brief-sec-t">${title}</div><ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : '';
  const hl = { en: ['Highlights', 'Blockers & Risks', 'Next Steps'], 'zh-CN': ['进展亮点', '阻塞与风险', '下一步'], 'zh-HK': ['進展亮點', '阻塞與風險', '下一步'] };
  const titles = hl[currentLang] || hl['zh-CN'];
  return `<div class="brief-summary">${escapeHtml(b.summary)}</div>`
    + list(titles[0], b.highlights, 'hl')
    + list(titles[1], b.risks, 'risk')
    + list(titles[2], b.next_steps, 'next');
}

export async function loadShare() {
  const body = $('#shareBody'); body.innerHTML = '<div class="plan-hint">' + _t('loading') + '</div>';

  let s, activeCycle = null, recentPages = [];
  try { s = await api(`/projects/${state.currentProjectId}/share`); } catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  try {
    const cycles = await api(`/projects/${state.currentProjectId}/cycles`);
    activeCycle = cycles.find((c) => c.status === 'active') || null;
    if (activeCycle) {
      try { activeCycle = await api(`/projects/${state.currentProjectId}/cycles/${activeCycle.id}`); } catch {}
    }
  } catch {}
  try {
    const pages = await api(`/projects/${state.currentProjectId}/pages`);
    recentPages = pages.sort((a, b) => b.updated_at > a.updated_at ? 1 : -1).slice(0, 3);
  } catch {}

  const p = s.project, pct = Math.round(p.completion * 100);
  const chips = getStatuses().map((c) => `<span class="chip">${c.name} ${s.status_counts[c.id] || 0}</span>`).join('');

  let html = '';

  // ─── Active cycle section ───
  if (activeCycle) {
    const stats = activeCycle.stats || {};
    const cPct = stats.completion_pct || 0;
    const daysLeft = Math.max(0, Math.ceil((new Date(activeCycle.end_date) - new Date()) / 86400000));
    html += `<div class="share-cycle">
      <div class="share-cycle-head">
        <span class="share-cycle-dot"></span>
        <b>${escapeHtml(activeCycle.name)}</b>
        <span class="ws-meta">${activeCycle.start_date} → ${activeCycle.end_date}</span>
        <span class="ws-meta" style="margin-left:auto">${_t('completion')} ${cPct}% · ${daysLeft} 天</span>
      </div>
      <div class="progress-bar" style="margin:8px 0 4px"><i style="width:${cPct}%"></i></div>
      <div class="share-cycle-stats">
        <span>${_t('s_done')} <b>${stats.completed || 0}</b></span>
        <span>${_t('s_in_progress')} <b>${stats.in_progress || 0}</b></span>
        <span>${_t('s_blocked')} <b>${stats.blocked || 0}</b></span>
        <span>${_t('s_todo')} <b>${stats.todo || 0}</b></span>
      </div>
    </div>`;
  }

  // ─── Project stats + AI brief row ───
  const hasBrief = !!s.brief;
  const briefBodyHtml = hasBrief ? briefSections(s.brief) : `<div class="plan-hint">${_t('gen_brief_hint')}</div>`;
  const metaHtml = hasBrief ? `${_t('last_generated')} ${escapeHtml(fmtBriefTime(s.brief_generated_at))}` : '';

  html += `<div class="share-row">
    <div class="share-summary">
      <div class="big">${pct}%</div>
      <div class="ws-meta">${_t('completion_rate')} · ${p.done_count}/${p.task_count} ${_t('tasks_unit')}</div>
      <div class="progress-bar"><i style="width:${pct}%"></i></div>
      <div class="status-chips">${chips}</div>
    </div>
    <div class="brief-card" id="briefCard">
      <div class="brief-head"><span class="section-title" style="font-size:15px">${_t('ai_brief')}</span><span id="briefMeta" style="font-size:12px;color:var(--text-3);margin-left:auto;margin-right:8px">${metaHtml}</span><button class="btn btn-soft btn-sm" id="briefGenBtn">${hasBrief ? _t('regen_brief') : _t('gen_brief')}</button></div>
      <div class="brief-body" id="briefBody">${briefBodyHtml}</div>
    </div>
  </div>`;

  // ─── Recent docs ───
  if (recentPages.length) {
    html += `<div class="share-docs">
      <div class="section-title" style="font-size:14px;margin-bottom:8px">${_t('pages_tab')}</div>
      ${recentPages.map((pg) => `<div class="share-doc-row">
        <span class="share-doc-icon">📄</span>
        <span class="share-doc-title">${escapeHtml(pg.title)}</span>
        <span class="ws-meta" style="margin-left:auto">${escapeHtml(fmtBriefTime(pg.updated_at))}</span>
      </div>`).join('')}
    </div>`;
  }

  // ─── Task flow (grouped by status, clickable) ───
  const statusOrder = ['in_progress', 'review', 'blocked', 'todo', 'done', 'archived'];
  const statusColors = { todo: 'var(--text-3)', in_progress: 'var(--gold)', blocked: 'var(--warn)', review: '#f59e0b', done: 'var(--ok)', archived: 'var(--text-3)' };
  const byStatus = {};
  s.tasks.forEach((t) => { (byStatus[t.status] = byStatus[t.status] || []).push(t); });

  let flowHtml = '';
  statusOrder.forEach((st) => {
    const tasks = byStatus[st];
    if (!tasks || !tasks.length) return;
    flowHtml += `<div class="share-status-group">
      <div class="share-group-head" data-group="${st}">
        <span class="dot" style="background:${statusColors[st] || 'var(--text-3)'}"></span>
        <span>${getStatusName(st)}</span>
        <span class="ws-meta">${tasks.length}</span>
        <span class="arch-arrow" style="margin-left:auto;font-size:9px">▼</span>
      </div>
      <div class="share-group-body" data-group-body="${st}">
        ${tasks.map((t) => `<div class="share-task clickable" data-task-id="${t.id}">
          <span>${escapeHtml(t.title)}</span>
          ${t.estimated_hours ? `<span class="ws-meta">${t.estimated_hours}h</span>` : ''}
          ${t.owner_user_id ? `<span class="avatar" style="margin-left:auto">${initials(state.userMap[t.owner_user_id] || '·')}</span>` : ''}
        </div>`).join('')}
      </div>
    </div>`;
  });

  html += `<div class="section-title" style="font-size:14px;margin-bottom:8px">${_t('task_flow')}</div>
    <div class="share-flow">${flowHtml || '<div class="plan-hint">' + _t('no_tasks_yet') + '</div>'}</div>`;

  body.innerHTML = html;
  $('#briefGenBtn').onclick = generateBrief;

  // Click task → open detail
  body.querySelectorAll('.share-task.clickable').forEach((el) => {
    el.style.cursor = 'pointer';
    el.onclick = () => {
      const t = s.tasks.find((x) => x.id === el.dataset.taskId);
      if (t) App.openTaskDetail(t, 0);
    };
  });

  // Toggle status groups
  body.querySelectorAll('.share-group-head').forEach((head) => {
    head.style.cursor = 'pointer';
    head.onclick = () => {
      const gb = body.querySelector(`[data-group-body="${head.dataset.group}"]`);
      const arrow = head.querySelector('.arch-arrow');
      if (gb.style.display === 'none') { gb.style.display = ''; arrow.textContent = '▼'; }
      else { gb.style.display = 'none'; arrow.textContent = '▶'; }
    };
  });
}

async function generateBrief() {
  const btn = $('#briefGenBtn'), bb = $('#briefBody');
  btn.disabled = true; btn.textContent = _t('generating');
  bb.innerHTML = '<div class="plan-hint">' + _t('generating') + '</div>';
  try {
    const b = await api(`/projects/${state.currentProjectId}/brief`, { method: 'POST' });
    bb.innerHTML = briefSections(b);
    const meta = $('#briefMeta'); if (meta) meta.textContent = _t('just_generated');
    btn.textContent = _t('regen_brief');
  } catch (e) {
    bb.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`;
    btn.textContent = _t('gen_brief');
  }
  btn.disabled = false;
}
