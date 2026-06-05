'use strict';

import { $, api, toast, escapeHtml, App } from './core.js';
import { _t } from './i18n.js';
import { state } from './state.js';
import { initials } from './core.js';

export async function loadAdmin() {
  App.showView('adminView');
  const body = $('#adminBody'); body.innerHTML = `<div class="plan-hint">${_t('loading')}</div>`;
  let items;
  try { items = (await api('/admin/users')).items || []; } catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  body.innerHTML = '';
  items.forEach((u) => {
    const row = document.createElement('div'); row.className = 'admin-row';
    const self = u.id === state.me.id;
    row.innerHTML = `<span class="avatar">${initials(u.display_name)}</span>`
      + `<span class="ar-name"><b>${escapeHtml(u.display_name)}${self ? ` <span class="ws-meta">${_t('you')}</span>` : ''}</b><span class="ws-meta">${escapeHtml(u.email)}</span></span>`
      + `<label class="ar-role"><input type="checkbox" data-role="is_admin" ${u.is_admin ? 'checked' : ''}> admin</label>`
      + `<label class="ar-role"><input type="checkbox" data-role="is_pm" ${u.is_pm ? 'checked' : ''}> pm</label>`;
    row.querySelectorAll('input').forEach((chk) => {
      chk.onchange = async () => {
        const role = chk.dataset.role;
        try {
          const updated = await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { [role]: chk.checked } });
          u.is_admin = updated.is_admin; u.is_pm = updated.is_pm;
          if (self) { state.me = { ...state.me, is_admin: updated.is_admin, is_pm: updated.is_pm }; $('#navAdmin').style.display = state.me.is_admin ? 'flex' : 'none'; $('#navCost').style.display = state.me.is_pm ? 'flex' : 'none'; }
        } catch (e) { toast(e.message); chk.checked = !chk.checked; }
      };
    });
    body.appendChild(row);
  });
}

export function initAdmin() {
  $('#navAdmin').onclick = loadAdmin;
}
