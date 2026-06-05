'use strict';

import { $, api, toast } from './core.js';
import { _t } from './i18n.js';
import { state } from './state.js';

let pwsVersion = 1;

export async function loadProjectWorkspace() {
  const fields = ['#pwsBg', '#pwsCtx', '#pwsFocus'];
  fields.forEach((s) => { $(s).value = ''; $(s).disabled = true; });
  $('#pwsActions').style.display = 'none';
  $('#pwsReadonly').style.display = 'none';
  if (!state.currentProjectId) return;
  try {
    const ws = await api(`/projects/${state.currentProjectId}/workspace`);
    pwsVersion = ws.version;
    $('#pwsBg').value = ws.background_md;
    $('#pwsCtx').value = ws.context_md;
    $('#pwsFocus').value = ws.current_focus_md;
    $('#pwsVersion').textContent = `v${ws.version}`;
    const canEdit = state.me.is_pm || state.me.is_admin;
    if (!canEdit) {
      try {
        const members = await api(`/projects/${state.currentProjectId}/members`);
        const mine = members.find((m) => m.user_id === state.me.id);
        if (mine && mine.role === 'lead') { fields.forEach((s) => { $(s).disabled = false; }); $('#pwsActions').style.display = 'flex'; return; }
      } catch {}
      $('#pwsReadonly').style.display = 'block';
    } else {
      fields.forEach((s) => { $(s).disabled = false; });
      $('#pwsActions').style.display = 'flex';
    }
  } catch (e) { toast(e.message); }
}

export function initWorkspace() {
  $('#pwsSaveBtn').onclick = async () => {
    const btn = $('#pwsSaveBtn'); btn.disabled = true; btn.textContent = _t('ws_saving');
    try {
      const ws = await api(`/projects/${state.currentProjectId}/workspace`, {
        method: 'PATCH',
        body: { background_md: $('#pwsBg').value, context_md: $('#pwsCtx').value, current_focus_md: $('#pwsFocus').value, version: pwsVersion },
      });
      pwsVersion = ws.version;
      $('#pwsVersion').textContent = `v${ws.version}`;
      toast(_t('ws_saved'));
    } catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = _t('ws_save');
  };
}
