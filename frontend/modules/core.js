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

export function logoLoader({ size = 24, label = '', className = '' } = {}) {
  const text = label ? `<span class="logo-loader-label">${escapeHtml(label)}</span>` : '';
  return `<span class="logo-loader ${className}" role="status" aria-label="${escapeHtml(label || 'Loading')}">
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path class="logo-loader-outline" pathLength="1" d="M8 34L56 10L42 54L31 38L8 34ZM31 38L40 26L42 54L31 38Z"/>
      <g class="logo-loader-wing logo-loader-wing-a">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M8 34L56 10L42 54L31 38L8 34ZM31 38L40 26L42 54L31 38Z"/>
      </g>
      <rect class="logo-loader-node" x="47" y="12" width="7" height="7" rx="1.5"/>
    </svg>
    ${text}
  </span>`;
}

export function loadingHint(label) {
  return `<div class="plan-hint loading-hint">${logoLoader({ size: 22, label })}</div>`;
}

export function dropdownMultiSelect(placeholder, items, { indent } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'dms';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'dms-trigger';
  const triggerText = document.createElement('span');
  triggerText.textContent = placeholder;
  const arrow = document.createElement('span');
  arrow.className = 'dms-arrow';
  arrow.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#c8a951" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  trigger.appendChild(triggerText);
  trigger.appendChild(arrow);
  const panel = document.createElement('div');
  panel.className = 'dms-panel';
  panel.innerHTML = items.map(item => {
    const pad = indent && item.depth ? item.depth * 18 : 0;
    const sub = item.sub ? ` <span class="ws-meta">(${item.sub})</span>` : '';
    return `<label class="dms-item" style="padding-left:${pad}px">
      <input type="checkbox" value="${escapeHtml(item.value)}"> ${escapeHtml(item.label)}${sub}
    </label>`;
  }).join('');
  trigger.onclick = (e) => {
    e.stopPropagation();
    const isOpen = panel.classList.toggle('open');
    wrap.classList.toggle('open', isOpen);
    if (isOpen) {
      const rect = trigger.getBoundingClientRect();
      panel.style.left = rect.left + 'px';
      panel.style.width = rect.width + 'px';
      const spaceBelow = window.innerHeight - rect.bottom - 10;
      const spaceAbove = rect.top - 10;
      if (spaceBelow >= 280 || spaceBelow >= spaceAbove) {
        panel.style.top = rect.bottom + 4 + 'px';
        panel.style.bottom = '';
        panel.style.maxHeight = Math.min(280, spaceBelow) + 'px';
      } else {
        panel.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
        panel.style.top = '';
        panel.style.maxHeight = Math.min(280, spaceAbove) + 'px';
      }
    }
  };
  const closePanel = () => { panel.classList.remove('open'); wrap.classList.remove('open'); };
  panel.onclick = (e) => { e.stopPropagation(); };
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target) && !panel.contains(e.target)) closePanel(); });
  wrap.appendChild(trigger);
  document.body.appendChild(panel);
  wrap.getSelected = () => [...panel.querySelectorAll('input:checked')].map(c => c.value);
  panel.addEventListener('change', () => {
    const count = panel.querySelectorAll('input:checked').length;
    triggerText.textContent = count ? `${placeholder} (${count})` : placeholder;
  });
  return wrap;
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
