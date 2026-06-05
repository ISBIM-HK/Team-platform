'use strict';

export const API = '/api/v1';
export const App = {};
export const $ = (s) => document.querySelector(s);

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin',
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.title || `HTTP ${res.status}`);
  return data;
}

export function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function initials(n) { return (n || '?').trim().slice(0, 2).toUpperCase(); }

export function fmtBriefTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString();
}

export function inputModal(title, fields) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay show';
    overlay.style.zIndex = '90';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '400px';
    let html = `<div class="mhead"><h3>${escapeHtml(title)}</h3></div><div class="mbody">`;
    fields.forEach((f, i) => {
      const type = f.type || 'text';
      const val = f.default || '';
      html += `<div class="field"><label>${escapeHtml(f.label)}</label><input id="__im_${i}" type="${type}" value="${escapeHtml(val)}" placeholder="${escapeHtml(f.placeholder || '')}"></div>`;
    });
    html += `</div><div class="mfoot"><button class="btn btn-ghost" id="__im_cancel">取消</button><button class="btn btn-primary" id="__im_ok">确定</button></div>`;
    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    const first = modal.querySelector('#__im_0');
    if (first) first.focus();
    const cleanup = (result) => { overlay.remove(); resolve(result); };
    modal.querySelector('#__im_cancel').onclick = () => cleanup(null);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
    modal.querySelector('#__im_ok').onclick = () => {
      const values = fields.map((_, i) => modal.querySelector(`#__im_${i}`).value.trim());
      if (values.some((v) => !v)) return;
      cleanup(values.length === 1 ? values[0] : values);
    };
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') modal.querySelector('#__im_ok').click();
      if (e.key === 'Escape') cleanup(null);
    });
  });
}
