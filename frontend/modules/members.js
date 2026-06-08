'use strict';

import { $, api, toast, escapeHtml, initials, loadingHint, dropdownMultiSelect } from './core.js';
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
      const leadCount = members.filter(x => x.role === 'lead').length;
      const isSelf = m.user_id === state.me.id;
      const isLastLead = isLead && leadCount <= 1;

      const toggle = document.createElement('button'); toggle.className = 'btn btn-ghost btn-sm';
      toggle.textContent = isLead ? _t('set_member') : _t('set_lead');
      toggle.onclick = async () => {
        if (isLead && isLastLead) { toast(_t('transfer_lead_first')); return; }
        try { await api(`/projects/${pid}/members/${m.user_id}`, { method: 'PATCH', body: { role: isLead ? 'member' : 'lead' } }); openMembers(pid); } catch (e) { toast(e.message); }
      };
      const rm = document.createElement('button'); rm.className = 'btn btn-ghost btn-sm'; rm.textContent = _t('remove');
      rm.onclick = async () => {
        if (isLastLead) { toast(_t('transfer_lead_first')); return; }
        if (isSelf && !confirm(_t('remove_self_confirm'))) return;
        try { await api(`/projects/${pid}/members/${m.user_id}`, { method: 'DELETE' }); openMembers(pid); } catch (e) { toast(e.message); }
      };
      row.appendChild(toggle); row.appendChild(rm);
    }
    body.appendChild(row);
  });
  if (canManage) {
    const candidates = Object.entries(state.userMap).filter(([id]) => !memberIds.has(id));
    let groups = [];
    try { groups = await api('/admin/groups'); } catch { /* non-admin */ }

    if (candidates.length || groups.length) {
      const grid = document.createElement('div');
      grid.className = 'member-invite-rows';

      if (candidates.length) {
        const row = document.createElement('div');
        row.className = 'member-invite-row';
        const label = document.createElement('div');
        label.className = 'member-invite-label';
        label.textContent = _t('add_member');
        const dms = dropdownMultiSelect(_t('add_member'), candidates.map(([id, name]) => ({ value: id, label: name })));
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary btn-sm';
        btn.textContent = _t('add_btn');
        btn.onclick = async () => {
          const checked = dms.getSelected();
          if (!checked.length) return;
          try { for (const uid of checked) { await api(`/projects/${pid}/members`, { method: 'POST', body: { user_id: uid } }); } openMembers(pid); } catch (e) { toast(e.message); }
        };
        row.appendChild(label); row.appendChild(dms); row.appendChild(btn);
        grid.appendChild(row);
      }

      if (groups.length) {
        function flattenGroups(grps, parentId = null, depth = 0) {
          const children = grps.filter(g => (g.parent_group_id || null) === parentId);
          let result = [];
          for (const g of children) {
            result.push({ value: g.id, label: g.name, sub: g.member_count, depth });
            result = result.concat(flattenGroups(grps, g.id, depth + 1));
          }
          return result;
        }
        const row = document.createElement('div');
        row.className = 'member-invite-row';
        const label = document.createElement('div');
        label.className = 'member-invite-label';
        label.textContent = _t('invite_by_group');
        const gdms = dropdownMultiSelect(_t('invite_by_group'), flattenGroups(groups), { indent: true });
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary btn-sm';
        btn.textContent = _t('invite_groups_btn');
        btn.onclick = async () => {
          const checked = gdms.getSelected();
          if (!checked.length) { toast(_t('select_groups')); return; }
          try { await api(`/projects/${pid}/members/invite-groups`, { method: 'POST', body: { group_ids: checked } }); openMembers(pid); } catch (e) { toast(e.message); }
        };
        row.appendChild(label); row.appendChild(gdms); row.appendChild(btn);
        grid.appendChild(row);
      }

      addRow.appendChild(grid);
    } else {
      addRow.innerHTML = `<span class="ws-meta">${_t('no_more_members')}</span>`;
    }
  }
}

export function initMembers() {
  $('#pvMembersBtn').onclick = () => { if (state.currentProjectId) openMembers(state.currentProjectId); };
  $('#membersClose').onclick = () => $('#membersOverlay').classList.remove('show');
}
