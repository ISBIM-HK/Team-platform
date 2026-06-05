'use strict';

import { $, api, toast, App } from './core.js';
import { _t } from './i18n.js';
import { state } from './state.js';

let typingEl = null;

function addMsg(role, text) {
  const m = document.createElement('div'); m.className = 'msg ' + role;
  m.textContent = text; $('#msgs').appendChild(m); $('#msgs').scrollTop = $('#msgs').scrollHeight;
  return m;
}

function showTyping() {
  typingEl = document.createElement('div'); typingEl.className = 'msg assistant typing-msg';
  typingEl.innerHTML = `<div class="logo-anim">
    <svg width="24" height="24" viewBox="0 0 64 64" fill="none">
      <path class="logo-part-a" d="M8 34L56 10L40 26L31 38Z" fill="#c8a951"/>
      <path class="logo-part-b" d="M8 34L31 38L42 54Z" fill="#c8a951"/>
      <rect class="logo-dot" x="47" y="12" width="7" height="7" rx="1.5" fill="#c8a951"/>
    </svg>
  </div>`;
  $('#msgs').appendChild(typingEl); $('#msgs').scrollTop = $('#msgs').scrollHeight;
}
function removeTyping() { if (typingEl) { typingEl.remove(); typingEl = null; } }

const WELCOME = () => _t('welcome')(state.me.display_name);

function fmtSessionTime(isoStr) {
  const raw = String(isoStr);
  const dt = new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z');
  return `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

function renderSessionSelect() {
  const sel = $('#sessionSelect');
  sel.innerHTML = state.allSessions.map((s) => {
    const ts = fmtSessionTime(s.created_at);
    const title = (s.title && s.title.trim()) ? s.title : _t('new_chat');
    return `<option value="${s.id}"${s.id === state.chatSession.id ? ' selected' : ''}>${title} · ${ts}</option>`;
  }).join('');
}

async function switchSession(sessionId) {
  if (state.chatSocket) state.chatSocket.close();
  const s = state.allSessions.find((x) => x.id === sessionId);
  if (!s) return;
  state.chatSession = s;
  const msgs = (await api(`/chat/sessions/${sessionId}/messages`)).items || [];
  $('#msgs').innerHTML = '';
  if (!msgs.length) addMsg('assistant', WELCOME());
  msgs.forEach((m) => addMsg(m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : 'system'), m.content));
  connectWS();
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  state.chatSocket = new WebSocket(`${proto}://${location.host}/ws/chat/${state.chatSession.id}`);
  state.chatSocket.onmessage = (ev) => {
    const d = JSON.parse(ev.data);
    if (d.type === 'assistant_done') {
      removeTyping(); addMsg('assistant', d.content || ''); App.loadProjects(); App.loadSuggestions();
      if (state.currentProjectId) { App.loadBoard(); App.refreshProjMeta(); }
      api('/chat/sessions').then((r) => { state.allSessions = r.items || []; renderSessionSelect(); }).catch(() => {});
    }
    else if (d.type === 'error') { removeTyping(); addMsg('system', _t('error_prefix') + (d.message || '')); }
    else if (d.type === 'aborted') removeTyping();
  };
  state.chatSocket.onclose = () => {};
  state.chatSocket.onopen = () => {};
}

async function startNewChat() {
  if (state.chatSocket) state.chatSocket.close();
  try {
    const body = { title: '' };
    if (state.currentProjectId) {
      body.project_id = state.currentProjectId;
    }
    state.chatSession = await api('/chat/sessions', { method: 'POST', body });
    state.allSessions.unshift(state.chatSession);
    renderSessionSelect();
    $('#msgs').innerHTML = '';
    addMsg('assistant', WELCOME());
    connectWS();
  } catch (e) { toast(e.message); }
}

const SLASH_COMMANDS = {
  '/new': () => { startNewChat(); return true; },
  '/clear': () => { $('#msgs').innerHTML = ''; addMsg('system', '已清屏（对话历史保留）'); return true; },
  '/help': () => { addMsg('system', '可用指令：/new 新对话 · /clear 清屏 · /help 帮助'); return true; },
};

function sendText(text) {
  if (!text || !state.chatSocket || state.chatSocket.readyState !== 1) return;
  addMsg('user', text); showTyping();
  state.chatSocket.send(JSON.stringify({ type: 'user_message', content: text, project_id: state.currentProjectId }));
}

function sendChat() {
  const inp = $('#chatInput'); const text = inp.value.trim(); if (!text) return;
  const cmd = SLASH_COMMANDS[text.toLowerCase().split(/\s/)[0]];
  if (cmd) { inp.value = ''; cmd(); return; }
  inp.value = ''; sendText(text);
}

export { sendText };

export async function initChat() {
  try {
    state.allSessions = (await api('/chat/sessions')).items || [];
    if (!state.allSessions.length) {
      state.chatSession = await api('/chat/sessions', { method: 'POST', body: { title: '' } });
      state.allSessions = [state.chatSession];
    } else {
      state.chatSession = state.allSessions[0];
    }
    renderSessionSelect();
    const msgs = (await api(`/chat/sessions/${state.chatSession.id}/messages`)).items || [];
    requestAnimationFrame(() => {
      $('#msgs').innerHTML = '';
      if (!msgs.length) addMsg('assistant', WELCOME());
      msgs.forEach((m) => addMsg(m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : 'system'), m.content));
    });
    connectWS();
  } catch (e) { addMsg('system', _t('error_prefix') + e.message); }

  $('#sessionSelect').onchange = (e) => switchSession(e.target.value);
  $('#sessionDelBtn').onclick = async () => {
    if (!state.chatSession || state.allSessions.length <= 1) { toast(_t('keep_one')); return; }
    if (!confirm(_t('del_confirm'))) return;
    try {
      await api(`/chat/sessions/${state.chatSession.id}`, { method: 'DELETE' });
      state.allSessions = state.allSessions.filter((s) => s.id !== state.chatSession.id);
      if (state.allSessions.length) { await switchSession(state.allSessions[0].id); }
      else { await startNewChat(); }
      renderSessionSelect();
    } catch (e) { toast(e.message); }
  };
  $('#newChatBtn').onclick = startNewChat;
  $('#chatSend').onclick = sendChat;
  $('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  initModelQuickSelect();
}

// model quick-select in header
function initModelQuickSelect() {
  const sel = $('#aModelQuick');
  if (!sel) return;
  sel.onchange = async () => {
    try {
      await api('/me/assistant', { method: 'PATCH', body: { llm_model: sel.value || null } });
      const modalSel = $('#awModelSelect');
      if (modalSel) modalSel.value = sel.value;
      toast(sel.value ? sel.options[sel.selectedIndex].text : '默认');
    } catch (e) { toast(e.message); }
  };
  api('/me/assistant').then((w) => { sel.value = w.llm_model || ''; }).catch(() => {});
}

// assistant settings
export function initAssistantSettings() {
  $('#asstSettingsBtn').onclick = async () => {
    try {
      const w = await api('/me/assistant');
      $('#awPersona').value = w.persona_md || '';
      $('#awMemory').value = w.memory_md || '';
      $('#awProfile').value = w.profile_md || '';
      const modelSel = $('#awModelSelect');
      if (modelSel) modelSel.value = w.llm_model || '';
      const quickSel = $('#aModelQuick');
      if (quickSel) quickSel.value = w.llm_model || '';
      resetSkillForm(); renderSkills();
      $('#asstSettingsOverlay').classList.add('show');
    } catch (e) { toast(e.message); }
  };
  $('#awCancel').onclick = () => $('#asstSettingsOverlay').classList.remove('show');
  $('#awSave').onclick = async () => {
    try {
      const modelVal = $('#awModelSelect') ? $('#awModelSelect').value : null;
      await api('/me/assistant', { method: 'PATCH', body: { persona_md: $('#awPersona').value, memory_md: $('#awMemory').value, profile_md: $('#awProfile').value, llm_model: modelVal || null } });
      $('#asstSettingsOverlay').classList.remove('show'); toast(_t('settings_saved'));
    } catch (e) { toast(e.message); }
  };
  $('#awSkillSave').onclick = async () => {
    const name = $('#awSkillName').value.trim(); if (!name) { $('#awSkillName').focus(); return; }
    const body = { name, description: $('#awSkillDesc').value.trim(), instruction_md: $('#awSkillInstr').value };
    try {
      if (awEditingSkill) await api(`/me/assistant/skills/${awEditingSkill}`, { method: 'PATCH', body });
      else await api('/me/assistant/skills', { method: 'POST', body });
      resetSkillForm(); renderSkills();
    } catch (e) { toast(e.message); }
  };
}

let awEditingSkill = null;
function resetSkillForm() { awEditingSkill = null; $('#awSkillName').value = ''; $('#awSkillDesc').value = ''; $('#awSkillInstr').value = ''; $('#awSkillSave').textContent = _t('add_skill'); }
async function renderSkills() {
  const box = $('#awSkills'); box.innerHTML = '<div class="plan-hint">' + _t('loading') + '</div>';
  let items; try { items = (await api('/me/assistant/skills')).items || []; } catch (e) { box.innerHTML = `<div class="plan-hint">${e.message}</div>`; return; }
  if (!items.length) { box.innerHTML = `<div class="plan-hint">${_t('no_skills')}</div>`; return; }
  box.innerHTML = '';
  items.forEach((s) => {
    const row = document.createElement('div'); row.className = 'aw-skill-row';
    row.innerHTML = `<label class="aw-sk-on"><input type="checkbox" ${s.enabled ? 'checked' : ''}><b>${s.name}</b></label><span class="ws-meta aw-sk-desc">${s.description || ''}</span><button class="btn btn-ghost btn-sm">${_t('edit')}</button><button class="btn btn-ghost btn-sm">${_t('delete_btn')}</button>`;
    const chk = row.querySelector('input');
    const [editBtn, delBtn] = row.querySelectorAll('button');
    chk.onchange = async () => { try { await api(`/me/assistant/skills/${s.id}`, { method: 'PATCH', body: { enabled: chk.checked } }); } catch (e) { toast(e.message); chk.checked = !chk.checked; } };
    editBtn.onclick = () => { awEditingSkill = s.id; $('#awSkillName').value = s.name; $('#awSkillDesc').value = s.description || ''; $('#awSkillInstr').value = s.instruction_md || ''; $('#awSkillSave').textContent = _t('save_edit'); $('#awSkillName').focus(); };
    delBtn.onclick = async () => { try { await api(`/me/assistant/skills/${s.id}`, { method: 'DELETE' }); if (awEditingSkill === s.id) resetSkillForm(); renderSkills(); } catch (e) { toast(e.message); } };
    box.appendChild(row);
  });
}
