'use strict';

import { $, api, toast, escapeHtml, initials, loadingHint } from './core.js';
import { _t } from './i18n.js';
import { state } from './state.js';

export async function openMembers(pid) {
  $('#membersOverlay').classList.add('show');
  const body = $('#membersBody'); const addRow = $('#membersAddRow');
  body.innerHTML = loadingHint(_t('loading')); addRow.innerHTML = '';
  let members;
  try { members = await api(`/projects/${pid}/members`); } catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  const myRole = (members.find((m) => m.user_id === state.me.id) || {}).role;
  const canManage = myRole === 'lead' || state.me.is_pm || state.me.is_admin;
  $('#membersTitle').textContent = `${_t('members')} · ${members.length}`;
  $('#membersHint').textContent = canManage ? _t('members_hint_lead') : _t('members_hint_member');
  body.innerHTML = '';
  const memberIds = new Set(members.map((m) => m.user_id));
  members.forEach((m) => {
    const isLead = m.role === 'lead';
    const row = document.createElement('div'); row.className = 'members-row';
    row.innerHTML = `<span class="avatar">${initials(m.name)}</span>`
      + `<span class="mr-name"><b>${escapeHtml(m.name)}${m.user_id === state.me.id ? ` <span class="ws-meta">${_t('you')}</span>` : ''}</b></span>`
      + `<span class="mr-role ${isLead ? '' : 'member'}">${isLead ? 'lead' : 'member'}</span>`;
    if (canManage) {
      const toggle = document.createElement('button'); toggle.className = 'btn btn-ghost btn-sm';
      toggle.textContent = isLead ? _t('set_member') : _t('set_lead');
      toggle.onclick = async () => {
        try { await api(`/projects/${pid}/members/${m.user_id}`, { method: 'PATCH', body: { role: isLead ? 'member' : 'lead' } }); openMembers(pid); } catch (e) { toast(e.message); }
      };
      const rm = document.createElement('button'); rm.className = 'btn btn-ghost btn-sm'; rm.textContent = _t('remove');
      rm.onclick = async () => { try { await api(`/projects/${pid}/members/${m.user_id}`, { method: 'DELETE' }); openMembers(pid); } catch (e) { toast(e.message); } };
      row.appendChild(toggle); row.appendChild(rm);
    }
    body.appendChild(row);
  });
  if (canManage) {
    const candidates = Object.entries(state.userMap).filter(([id]) => !memberIds.has(id));
    if (candidates.length) {
      const wrap = document.createElement('div'); wrap.className = 'members-add';
      const sel = document.createElement('select');
      sel.innerHTML = `<option value="">${_t('add_member')}</option>` + candidates.map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join('');
      const btn = document.createElement('button'); btn.className = 'btn btn-primary btn-sm'; btn.textContent = _t('add_btn');
      btn.onclick = async () => { if (!sel.value) return; try { await api(`/projects/${pid}/members`, { method: 'POST', body: { user_id: sel.value } }); openMembers(pid); } catch (e) { toast(e.message); } };
      wrap.appendChild(sel); wrap.appendChild(btn);
      addRow.appendChild(wrap);
    } else {
      addRow.innerHTML = `<span class="ws-meta">${_t('no_more_members')}</span>`;
    }
  }
}

export function initMembers() {
  $('#pvMembersBtn').onclick = () => { if (state.currentProjectId) openMembers(state.currentProjectId); };
  $('#membersClose').onclick = () => $('#membersOverlay').classList.remove('show');
}
