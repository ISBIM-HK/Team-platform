'use strict';

import { $, api, toast, App, logoLoader, loadingHint, escapeHtml } from './core.js';
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
  typingEl.innerHTML = logoLoader({ size: 24, className: 'logo-loader-typing' });
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

const SLASH_SUGGESTIONS = [
  { cmd: '/new', desc: '新建对话' },
  { cmd: '/clear', desc: '清屏（对话历史保留）' },
  { cmd: '/help', desc: '查看可用指令' },
  { cmd: '我有哪些任务', desc: '查看个人任务列表' },
  { cmd: '项目进度怎么样', desc: '查看当前项目进度' },
  { cmd: '总结一下群聊', desc: '总结 Telegram 群聊消息并提取任务' },
  { cmd: '看看我最近的邮件', desc: '查询企业微信邮件摘要' },
  { cmd: '有哪些群聊', desc: '列出已收录的 Telegram 群聊' },
  { cmd: '帮我拆解这个需求', desc: '将目标拆解为子任务' },
];

let slashActiveIdx = -1;

function showSlashMenu(filter) {
  const menu = $('#slashMenu');
  const q = filter.toLowerCase();
  const items = SLASH_SUGGESTIONS.filter(s => s.cmd.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q));
  if (!items.length) { menu.style.display = 'none'; return; }
  slashActiveIdx = 0;
  menu.innerHTML = items.map((s, i) =>
    `<div class="slash-item${i === 0 ? ' active' : ''}" data-idx="${i}" data-cmd="${s.cmd}">` +
    `<span class="slash-item-cmd">${s.cmd}</span>` +
    `<span class="slash-item-desc">${s.desc}</span></div>`
  ).join('');
  menu.style.display = 'block';
  menu.querySelectorAll('.slash-item').forEach(el => {
    el.onmouseenter = () => { slashActiveIdx = +el.dataset.idx; updateSlashActive(menu); };
    el.onclick = () => { pickSlash(el.dataset.cmd); };
  });
}

function updateSlashActive(menu) {
  menu.querySelectorAll('.slash-item').forEach((el, i) => el.classList.toggle('active', i === slashActiveIdx));
}

function pickSlash(cmd) {
  const inp = $('#chatInput');
  inp.value = cmd.startsWith('/') ? cmd : cmd;
  $('#slashMenu').style.display = 'none';
  inp.focus();
  if (!cmd.startsWith('/')) { sendChat(); }
}

function hideSlashMenu() { $('#slashMenu').style.display = 'none'; slashActiveIdx = -1; }

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
  const chatInp = $('#chatInput');
  chatInp.addEventListener('keydown', (e) => {
    const menu = $('#slashMenu');
    if (menu.style.display !== 'none') {
      const items = menu.querySelectorAll('.slash-item');
      if (e.key === 'ArrowDown') { e.preventDefault(); slashActiveIdx = Math.min(slashActiveIdx + 1, items.length - 1); updateSlashActive(menu); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); slashActiveIdx = Math.max(slashActiveIdx - 1, 0); updateSlashActive(menu); return; }
      if (e.key === 'Enter' && slashActiveIdx >= 0 && items[slashActiveIdx]) { e.preventDefault(); pickSlash(items[slashActiveIdx].dataset.cmd); return; }
      if (e.key === 'Escape') { hideSlashMenu(); return; }
    }
    if (e.key === 'Enter') sendChat();
  });
  chatInp.addEventListener('input', () => {
    const v = chatInp.value;
    if (v === '/') { showSlashMenu(''); }
    else if (v.startsWith('/')) { showSlashMenu(v); }
    else { hideSlashMenu(); }
  });
  chatInp.addEventListener('blur', () => { setTimeout(hideSlashMenu, 150); });
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
  const box = $('#awSkills'); box.innerHTML = loadingHint(_t('loading'));
  let items; try { items = (await api('/me/assistant/skills')).items || []; } catch (e) { box.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
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
