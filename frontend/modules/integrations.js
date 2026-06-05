'use strict';

import { $, api, toast, App } from './core.js';
import { _t } from './i18n.js';

function _renderIntegCard(items, provider, statusEl, metaEl, syncBtn) {
  const integ = items.find((i) => i.provider === provider);
  if (integ) {
    statusEl.textContent = _t('integ_connected');
    statusEl.className = 'integ-status ' + integ.status;
    if (syncBtn) syncBtn.style.display = '';
    const parts = [];
    if (integ.last_synced_at) parts.push(`${_t('integ_last_sync')}: ${new Date(integ.last_synced_at).toLocaleString()}`);
    if (integ.last_error) parts.push(`Error: ${integ.last_error}`);
    if (integ.consecutive_failures) parts.push(`Failures: ${integ.consecutive_failures}`);
    metaEl.textContent = parts.join(' · ') || integ.status;
  } else {
    statusEl.textContent = _t('integ_no_integ');
    statusEl.className = 'integ-status disabled';
    if (syncBtn) syncBtn.style.display = 'none';
    metaEl.textContent = '';
  }
}

export async function loadIntegrations() {
  try {
    const items = await api('/integrations');
    _renderIntegCard(items, 'gitlab', $('#integGitlabStatus'), $('#integGitlabMeta'), $('#integGitlabSync'));
    _renderIntegCard(items, 'github', $('#integGithubStatus'), $('#integGithubMeta'), $('#integGithubSync'));
    _renderIntegCard(items, 'dingtalk', $('#integDingtalkStatus'), $('#integDingtalkMeta'), null);
    _renderIntegCard(items, 'wecom_mail', $('#integWecomStatus'), $('#integWecomMeta'), $('#integWecomSync'));
  } catch (e) { toast(e.message); }
}

export function initIntegrations() {
  $('#navIntegrations').onclick = () => { App.showView('integrationsView'); loadIntegrations(); };

  // GitLab
  $('#integGitlabConnect').onclick = async () => {
    const url = $('#integGitlabUrl').value.trim(), pat = $('#integGitlabPat').value.trim();
    if (!url || !pat) { toast(_t('integ_url') + ' + PAT'); return; }
    const btn = $('#integGitlabConnect'); btn.disabled = true; btn.textContent = _t('loading');
    try { await api('/integrations/gitlab/connect', { method: 'POST', body: { base_url: url, pat } }); toast(_t('integ_connected')); $('#integGitlabPat').value = ''; loadIntegrations(); } catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = _t('integ_connect');
  };
  $('#integGitlabSync').onclick = async () => {
    const btn = $('#integGitlabSync'); btn.disabled = true; btn.textContent = _t('integ_syncing');
    try { const r = await api('/integrations/gitlab/sync-now', { method: 'POST' }); toast(_t('integ_synced')(r.synced)); loadIntegrations(); } catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = _t('integ_sync');
  };

  // GitHub
  $('#integGithubConnect').onclick = async () => {
    const pat = $('#integGithubPat').value.trim();
    if (!pat) { toast('PAT required'); return; }
    const btn = $('#integGithubConnect'); btn.disabled = true; btn.textContent = _t('loading');
    try { await api('/integrations/github/connect', { method: 'POST', body: { pat } }); toast(_t('integ_connected')); $('#integGithubPat').value = ''; loadIntegrations(); } catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = _t('integ_connect');
  };
  $('#integGithubSync').onclick = async () => {
    const btn = $('#integGithubSync'); btn.disabled = true; btn.textContent = _t('integ_syncing');
    try { const r = await api('/integrations/github/sync-now', { method: 'POST' }); toast(_t('integ_synced')(r.synced)); loadIntegrations(); } catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = _t('integ_sync');
  };

  // DingTalk
  $('#integDtConnect').onclick = async () => {
    const appKey = $('#integDtAppKey').value.trim(), appSecret = $('#integDtAppSecret').value.trim();
    if (!appKey || !appSecret) { toast('AppKey + AppSecret required'); return; }
    const btn = $('#integDtConnect'); btn.disabled = true; btn.textContent = _t('loading');
    try { await api('/integrations/dingtalk/connect', { method: 'POST', body: { app_key: appKey, app_secret: appSecret } }); toast(_t('integ_connected')); $('#integDtAppSecret').value = ''; loadIntegrations(); } catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = _t('integ_connect');
  };

  // WeCom Mail
  $('#integWecomConnect').onclick = async () => {
    const em = $('#integWecomEmail').value.trim(), pwd = $('#integWecomPwd').value.trim();
    if (!em || !pwd) { toast('Email + Password required'); return; }
    const btn = $('#integWecomConnect'); btn.disabled = true; btn.textContent = _t('loading');
    try { await api('/integrations/wecom-mail/connect', { method: 'POST', body: { email: em, password: pwd } }); toast(_t('integ_connected')); $('#integWecomPwd').value = ''; loadIntegrations(); } catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = _t('integ_connect');
  };
  $('#integWecomSync').onclick = async () => {
    const btn = $('#integWecomSync'); btn.disabled = true; btn.textContent = _t('integ_syncing');
    try { const r = await api('/integrations/wecom-mail/sync-now', { method: 'POST' }); toast(_t('integ_synced')(r.synced)); loadIntegrations(); } catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = _t('integ_sync');
  };
}
