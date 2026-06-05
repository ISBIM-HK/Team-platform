'use strict';

import { $, api, toast, escapeHtml, fmtBriefTime, App } from './core.js';
import { _t } from './i18n.js';
import { getScopeLabel } from './i18n.js';
import { SCOPE_KEYS, DEFAULT_TOKEN_SCOPES } from './state.js';

function renderTokenScopePicker() {
  const box = $('#tokenScopes'); if (!box) return;
  box.innerHTML = SCOPE_KEYS.map((scope) => (
    `<label class="scope-option"><input type="checkbox" value="${scope}" ${DEFAULT_TOKEN_SCOPES.includes(scope) ? 'checked' : ''}><span>${escapeHtml(getScopeLabel(scope))}</span><code>${scope}</code></label>`
  )).join('');
  const full = $('#tokenFullScope');
  const checks = Array.from(box.querySelectorAll('input[type="checkbox"]'));
  full.onchange = () => { checks.forEach((chk) => { chk.disabled = full.checked; }); };
  checks.forEach((chk) => { chk.onchange = () => { if (chk.checked) { full.checked = false; checks.forEach((c) => { c.disabled = false; }); } }; });
}

function selectedTokenScopes() {
  if ($('#tokenFullScope').checked) return ['*'];
  return Array.from(document.querySelectorAll('#tokenScopes input[type="checkbox"]:checked')).map((el) => el.value);
}

function scopeTags(scopes) {
  return (scopes || []).map((s) => `<span class="scope-tag ${s === '*' ? 'full' : ''}">${escapeHtml(s)}</span>`).join('');
}

export async function loadTokens() {
  App.showView('tokenView');
  renderTokenScopePicker();
  const body = $('#tokensBody'); body.innerHTML = `<div class="plan-hint">${_t('loading')}</div>`;
  let items;
  try { items = await api('/me/tokens'); } catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  if (!items.length) { body.innerHTML = `<div class="empty-hint">${_t('no_data')}</div>`; return; }
  body.innerHTML = '';
  items.forEach((t) => {
    const row = document.createElement('div'); row.className = 'token-row';
    const agent = t.agent_name ? `<span class="ws-meta">${escapeHtml(t.agent_name)}</span>` : '';
    row.innerHTML = `<div class="token-main"><b>${escapeHtml(t.name)}</b>${agent}<div class="token-scopes">${scopeTags(t.scopes)}</div><span class="ws-meta">${t.last_used_at ? `${_t('last_used')} ${escapeHtml(fmtBriefTime(t.last_used_at))}` : _t('never_used')}</span></div><button class="btn btn-ghost btn-sm">${_t('revoke')}</button>`;
    row.querySelector('button').onclick = async () => {
      if (!confirm(_t('revoke_confirm')(t.name))) return;
      try { await api(`/me/tokens/${t.id}`, { method: 'DELETE' }); await loadTokens(); toast(_t('token_revoked')); } catch (e) { toast(e.message); }
    };
    body.appendChild(row);
  });
}

export function initTokens() {
  $('#navTokens').onclick = loadTokens;
  $('#tokenCreateBtn').onclick = async () => {
    const name = $('#tokenName').value.trim();
    if (!name) { $('#tokenName').focus(); return; }
    const scopes = selectedTokenScopes();
    if (!scopes.length) { toast(_t('keep_one')); return; }
    if (scopes.includes('*') && !confirm(_t('confirm_full_scope'))) return;
    const body = { name, scopes, agent_name: $('#tokenAgent').value.trim() || null, description: $('#tokenDesc').value.trim() || null };
    try {
      const t = await api('/me/tokens', { method: 'POST', body });
      const overlay = $('#tokenRevealOverlay');
      $('#tokenRevealValue').textContent = t.token;
      $('#tokenRevealName').textContent = t.name;
      overlay.classList.add('show');
      $('#tokenRevealCopy').onclick = async () => { try { await navigator.clipboard.writeText(t.token); toast(_t('copy_token')); } catch { toast(_t('error_prefix')); } };
      $('#tokenRevealClose').onclick = () => { overlay.classList.remove('show'); };
      $('#tokenName').value = ''; $('#tokenAgent').value = ''; $('#tokenDesc').value = '';
      $('#tokenCreateResult').innerHTML = '';
      await loadTokens();
    } catch (e) { toast(e.message); }
  };
}
