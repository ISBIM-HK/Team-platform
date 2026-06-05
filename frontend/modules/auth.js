'use strict';

import { $, api } from './core.js';
import { state } from './state.js';
import { initStarfield } from './starfield.js';

export function initAuth(onBoot) {
  $('#ssoEntryBtn').onclick = () => {
    $('#login').style.display = 'none';
    $('#ssoLogin').style.display = 'block';
    initStarfield();
    const saved = localStorage.getItem('remembered_email');
    if (saved) { $('#email').value = saved; $('#rememberEmail').checked = true; $('#password').focus(); }
    else { $('#email').focus(); }
  };
  $('#ssoBackBtn').onclick = () => {
    $('#ssoLogin').style.display = 'none';
    $('#login').style.display = 'grid';
    $('#loginErr').textContent = '';
  };
  $('#loginBtn').onclick = async () => {
    const email = $('#email').value.trim(), password = $('#password').value;
    $('#loginErr').textContent = '';
    if (!email || !password) { $('#loginErr').textContent = '请输入邮箱和密码'; return; }
    const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = '验证中…';
    try {
      await api('/auth/proxy-login', { method: 'POST', body: { email, password } });
      if ($('#rememberEmail').checked) localStorage.setItem('remembered_email', email);
      else localStorage.removeItem('remembered_email');
      await onBoot();
    } catch (e) { $('#loginErr').textContent = e.message; }
    btn.disabled = false; btn.textContent = '登 录';
  };
  $('#password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#loginBtn').click(); });
  $('#pwToggle').onclick = () => {
    const pw = $('#password'), isHidden = pw.type === 'password';
    pw.type = isHidden ? 'text' : 'password';
    $('#eyeOpen').style.display = isHidden ? 'none' : 'block';
    $('#eyeClosed').style.display = isHidden ? 'block' : 'none';
  };
  $('#logoutBtn').onclick = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    if (state.chatSocket) state.chatSocket.close();
    location.reload();
  };
}
