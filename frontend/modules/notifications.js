'use strict';

import { $, api, toast, escapeHtml, fmtBriefTime, API, App, loadingHint } from './core.js';
import { _t, currentLang } from './i18n.js';
import { state } from './state.js';

let notifSSE = null;

export async function updateNotifBadge() {
  try {
    const c = await api('/me/notifications/unread-count');
    const b = $('#notifBadge'); b.style.display = c.unread ? 'inline-grid' : 'none'; b.textContent = c.unread;
  } catch {}
}

export function connectNotifSSE() {
  if (notifSSE) { notifSSE.close(); notifSSE = null; }
  setTimeout(() => {
    if (!state.me) return;
    notifSSE = new EventSource(API + '/me/notifications/stream');
    notifSSE.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === 'notification') { updateNotifBadge(); toast(d.title || _t('notifications')); }
      } catch {}
    };
    notifSSE.onerror = () => {
      if (notifSSE) { notifSSE.close(); notifSSE = null; }
      if (state.me) setTimeout(connectNotifSSE, 60000);
    };
  }, 3000);
}

export function cleanupSSE() {
  if (notifSSE) { notifSSE.close(); notifSSE = null; }
}

export async function loadNotifications() {
  App.showView('notificationsView');
  const body = $('#notificationsBody'); body.innerHTML = loadingHint(_t('loading'));
  let items; try { items = (await api('/me/notifications')).items || []; } catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  $('#notifMeta').textContent = `${items.length}`;
  if (!items.length) { body.innerHTML = `<div class="empty-hint">${_t('no_notifs')}</div>`; return; }
  body.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="btn btn-ghost btn-sm" id="clearAllNotifs">${_t('cancel')} All</button></div>`;
  $('#clearAllNotifs').onclick = async () => {
    if (!confirm('Clear all notifications?')) return;
    try { await api('/me/notifications', { method: 'DELETE' }); loadNotifications(); updateNotifBadge(); } catch (e) { toast(e.message); }
  };
  items.forEach((n) => {
    const el = document.createElement('div'); el.className = 'notif' + (n.read_at ? ' read' : '');
    const nTitles = (n.source_ref || {}).titles || {};
    const nTitle = nTitles[currentLang] || n.title;
    el.innerHTML = `<div class="ntext">${escapeHtml(nTitle)}</div><div class="nmeta">${escapeHtml(fmtBriefTime(n.created_at))} · ${n.kind}${n.read_at ? ' · ' + _t('read') : ''}</div>`;
    el.style.cursor = 'pointer';
    el.onclick = async () => {
      if (!n.read_at) {
        try { await api(`/me/notifications/${n.id}/read`, { method: 'POST' }); el.classList.add('read'); n.read_at = true; updateNotifBadge(); } catch {}
      }
      openNotifDetail(n);
    };
    body.appendChild(el);
  });
}

function openNotifDetail(n) {
  const ref = n.source_ref || {};
  const titles = ref.titles || {};
  const bodies = ref.bodies || {};
  const localTitle = titles[currentLang] || n.title;
  const bodyText = bodies[currentLang] || (n.body && n.body.trim()) || '';
  const hiddenKeys = new Set(['titles', 'bodies']);
  const refDisplay = Object.entries(ref).filter(([k]) => !hiddenKeys.has(k) && typeof k === 'string' && typeof ref[k] !== 'object').map(([k, v]) => `<div class="td-field"><div class="lbl">${escapeHtml(k)}</div><div class="val">${escapeHtml(String(v))}</div></div>`).join('');
  $('#tdStatus').textContent = n.kind;
  $('#tdTitle').textContent = localTitle;
  $('#tdBody').innerHTML = `
    ${bodyText ? `<div class="td-field"><div class="lbl">${_t('description')}</div><div class="val">${escapeHtml(bodyText)}</div></div>` : ''}
    <div class="td-field"><div class="lbl">Time</div><div class="val">${escapeHtml(fmtBriefTime(n.created_at))}</div></div>
    ${refDisplay}`;
  const foot = $('#tdFoot'); foot.innerHTML = '';
  const delBtn = document.createElement('button'); delBtn.className = 'btn btn-ghost'; delBtn.textContent = _t('remove');
  delBtn.onclick = async () => {
    try { await api(`/me/notifications/${n.id}`, { method: 'DELETE' }); $('#taskOverlay').classList.remove('show'); loadNotifications(); updateNotifBadge(); } catch (e) { toast(e.message); }
  };
  foot.appendChild(delBtn);
  const closeBtn = document.createElement('button'); closeBtn.className = 'btn btn-primary'; closeBtn.textContent = _t('close');
  closeBtn.onclick = () => $('#taskOverlay').classList.remove('show');
  foot.appendChild(closeBtn);
  $('#taskOverlay').classList.add('show');
}

export function initNotifications() {
  $('#navNotifications').onclick = loadNotifications;
}
