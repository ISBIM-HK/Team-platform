'use strict';
import { $, api, toast, escapeHtml, App, initials, loadingHint, inputModal, dropdownMultiSelect } from './core.js';
import { _t } from './i18n.js';
import { state } from './state.js';

let selectedGroupId = null;

// ── Roles pane ──

async function loadRoles() {
  const body = $('#adminBody'); body.innerHTML = loadingHint(_t('loading'));
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

// ── Groups pane ──

function buildTree(groups, parentId = null) {
  const children = groups.filter(g => (g.parent_group_id || null) === parentId);
  if (!children.length) return '';
  return children.map(g => {
    const sub = buildTree(groups, g.id);
    const hasChildren = sub !== '';
    const sel = g.id === selectedGroupId ? ' selected' : '';
    return `<div class="group-node-wrap" data-id="${g.id}">
      <div class="group-node${sel}" data-id="${g.id}">
        <span class="expand-icon">${hasChildren ? '▸' : '·'}</span>
        <span>${escapeHtml(g.name)}</span>
        <span class="ws-meta group-count">${g.member_count}</span>
      </div>
      ${hasChildren ? `<div class="group-children">${sub}</div>` : ''}
    </div>`;
  }).join('');
}

async function loadGroups() {
  const tree = $('#groupTree');
  tree.innerHTML = loadingHint(_t('loading'));
  let groups;
  try { groups = await api('/admin/groups'); } catch (e) { tree.innerHTML = escapeHtml(e.message); return; }
  tree.innerHTML = buildTree(groups) || `<span class="ws-meta">${_t('no_data')}</span>`;
  tree.querySelectorAll('.group-node').forEach(node => {
    node.onclick = (e) => {
      e.stopPropagation();
      selectedGroupId = node.dataset.id;
      tree.querySelectorAll('.group-node').forEach(n => n.classList.remove('selected'));
      node.classList.add('selected');
      loadGroupDetail(node.dataset.id, groups);
    };
    node.oncontextmenu = (e) => {
      e.preventDefault();
      showGroupMenu(e, node.dataset.id, groups);
    };
  });
}

async function loadGroupDetail(groupId, groups) {
  const detail = $('#groupDetail');
  const group = groups.find(g => g.id === groupId);
  if (!group) return;
  detail.innerHTML = loadingHint(_t('loading'));
  let members;
  try { members = await api(`/admin/groups/${groupId}/members`); } catch (e) { detail.innerHTML = escapeHtml(e.message); return; }

  const allUsers = Object.entries(state.userMap);
  const memberIds = new Set(members.map(m => m.user_id));
  const candidates = allUsers.filter(([id]) => !memberIds.has(id));

  let html = `<h3 style="margin:0 0 12px">${escapeHtml(group.name)}</h3>`;
  if (group.description) html += `<p class="ws-meta" style="margin:0 0 12px">${escapeHtml(group.description)}</p>`;

  if (members.length) {
    html += members.map(m =>
      `<div class="group-member-row">
        <span class="avatar">${initials(m.display_name)}</span>
        <span class="gm-name">${escapeHtml(m.display_name)}</span>
        <button class="btn btn-ghost btn-sm gm-rm" data-uid="${m.user_id}">${_t('remove')}</button>
      </div>`
    ).join('');
  } else {
    html += `<p class="ws-meta">${_t('group_no_members')}</p>`;
  }

  html += `<div style="margin-top:16px"><button class="btn btn-ghost btn-sm" id="addSubGroupBtn">${_t('group_add_sub')}</button></div>`;

  detail.innerHTML = html;

  detail.querySelectorAll('.gm-rm').forEach(btn => {
    btn.onclick = async () => {
      try { await api(`/admin/groups/${groupId}/members/${btn.dataset.uid}`, { method: 'DELETE' }); loadGroups(); loadGroupDetail(groupId, await api('/admin/groups')); } catch (e) { toast(e.message); }
    };
  });

  if (candidates.length) {
    const addWrap = document.createElement('div');
    addWrap.style.cssText = 'margin-top:12px;display:flex;gap:6px;align-items:flex-start;';
    const dms = dropdownMultiSelect(_t('group_add_member'), candidates.map(([id, name]) => ({ value: id, label: name })));
    dms.style.flex = '1';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary btn-sm';
    addBtn.style.flexShrink = '0';
    addBtn.textContent = _t('add_btn');
    addBtn.onclick = async () => {
      const checked = dms.getSelected();
      if (!checked.length) return;
      try {
        for (const uid of checked) { await api(`/admin/groups/${groupId}/members`, { method: 'POST', body: { user_id: uid } }); }
        loadGroups(); loadGroupDetail(groupId, await api('/admin/groups'));
      } catch (e) { toast(e.message); }
    };
    addWrap.appendChild(dms); addWrap.appendChild(addBtn);
    detail.querySelector('#addSubGroupBtn').parentElement.before(addWrap);
  }
  const subBtn = $('#addSubGroupBtn');
  if (subBtn) {
    subBtn.onclick = async () => {
      const name = await inputModal(_t('group_name_prompt'), [{ label: _t('group_name_prompt'), placeholder: '' }]);
      if (!name) return;
      try { await api('/admin/groups', { method: 'POST', body: { name, parent_group_id: groupId } }); toast(_t('group_created')); loadGroups(); } catch (e) { toast(e.message); }
    };
  }
}

function showGroupMenu(e, groupId, groups) {
  const group = groups.find(g => g.id === groupId);
  if (!group) return;
  const existing = document.querySelector('.group-ctx-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'group-ctx-menu';
  menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:100;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:4px;box-shadow:var(--shadow-lg);font-size:13px;`;
  menu.innerHTML = `
    <div class="group-ctx-item" data-action="rename" style="padding:6px 12px;cursor:pointer;border-radius:4px;">${_t('group_rename')}</div>
    <div class="group-ctx-item" data-action="delete" style="padding:6px 12px;cursor:pointer;border-radius:4px;color:var(--danger);">${_t('delete')}</div>
  `;
  document.body.appendChild(menu);
  menu.querySelectorAll('.group-ctx-item').forEach(item => {
    item.onmouseenter = () => item.style.background = 'var(--surface-2)';
    item.onmouseleave = () => item.style.background = '';
    item.onclick = async () => {
      menu.remove();
      if (item.dataset.action === 'rename') {
        const name = await inputModal(_t('group_name_prompt'), [{ label: _t('group_name_prompt'), default: group.name }]);
        if (!name || name === group.name) return;
        try { await api(`/admin/groups/${groupId}`, { method: 'PATCH', body: { name } }); loadGroups(); } catch (e) { toast(e.message); }
      } else if (item.dataset.action === 'delete') {
        if (!confirm(`${_t('delete')} "${group.name}"?`)) return;
        try { await api(`/admin/groups/${groupId}`, { method: 'DELETE' }); toast(_t('deleted')); selectedGroupId = null; $('#groupDetail').innerHTML = `<span class="ws-meta">${_t('group_select_hint')}</span>`; loadGroups(); } catch (e) { toast(e.message); }
      }
    };
  });
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}

// ── Init ──

export async function loadAdmin() {
  App.showView('adminView');
  loadRoles();
}

export function initAdmin() {
  $('#navAdmin').onclick = loadAdmin;

  $('#adminTabRoles').onclick = () => {
    $('#adminTabRoles').classList.add('active'); $('#adminTabGroups').classList.remove('active');
    $('#adminRolesPane').style.display = ''; $('#adminGroupsPane').style.display = 'none';
    loadRoles();
  };
  $('#adminTabGroups').onclick = () => {
    $('#adminTabGroups').classList.add('active'); $('#adminTabRoles').classList.remove('active');
    $('#adminGroupsPane').style.display = ''; $('#adminRolesPane').style.display = 'none';
    loadGroups();
  };

  $('#addRootGroupBtn').onclick = async () => {
    const name = await inputModal(_t('group_name_prompt'), [{ label: _t('group_name_prompt'), placeholder: '' }]);
    if (!name) return;
    try { await api('/admin/groups', { method: 'POST', body: { name } }); toast(_t('group_created')); loadGroups(); } catch (e) { toast(e.message); }
  };
}
