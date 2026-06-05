'use strict';

import { $, api, toast, escapeHtml, inputModal } from './core.js';
import { _t } from './i18n.js';
import { state } from './state.js';

let allPages = [];
let currentPageId = null;

export async function loadPages() {
  if (!state.currentProjectId) return;
  try { allPages = await api(`/projects/${state.currentProjectId}/pages`); } catch (e) { toast(e.message); allPages = []; }
  renderTree();
  if (currentPageId) {
    const page = allPages.find((p) => p.id === currentPageId);
    if (page) renderEditor(page); else renderEditorEmpty();
  } else { renderEditorEmpty(); }
}

function renderTree() {
  const tree = $('#pageTree'); if (!tree) return;
  const roots = allPages.filter((p) => !p.parent_page_id);
  const childMap = {};
  allPages.forEach((p) => { if (p.parent_page_id) (childMap[p.parent_page_id] = childMap[p.parent_page_id] || []).push(p); });

  tree.innerHTML = `<div class="page-tree-head"><span>${_t('pages_tab')}</span><button class="btn btn-ghost btn-sm" id="newPageBtn">+</button></div>`;
  $('#newPageBtn').onclick = () => createPage(null);

  function renderItem(page, depth) {
    const children = childMap[page.id] || [];
    const el = document.createElement('div');
    el.className = 'pt-item' + (page.id === currentPageId ? ' active' : '');
    el.style.paddingLeft = (6 + depth * 16) + 'px';
    const arrow = children.length ? (page._open ? '▼' : '▶') : '';
    el.innerHTML = `<span class="arrow">${arrow}</span> ${escapeHtml(page.title)}`;
    el.onclick = (e) => {
      e.stopPropagation();
      if (children.length && e.target.classList.contains('arrow')) { page._open = !page._open; renderTree(); return; }
      currentPageId = page.id;
      renderTree();
      renderEditor(page);
    };
    tree.appendChild(el);
    if (children.length && page._open) children.forEach((c) => renderItem(c, depth + 1));
  }
  roots.forEach((r) => renderItem(r, 0));
}

function renderEditorEmpty() {
  const ed = $('#pageEditor'); if (!ed) return;
  ed.innerHTML = `<div class="plan-hint" style="padding:40px 0;text-align:center">${_t('pages_empty')}</div>`;
}

function renderEditor(page) {
  const ed = $('#pageEditor'); if (!ed) return;
  const canDelete = state.me.is_pm || state.me.is_admin;
  ed.innerHTML = `
    <h3 id="pageTitle" contenteditable="true" style="outline:none;min-height:28px">${escapeHtml(page.title)}</h3>
    <div class="page-meta">${_t('last_used')} ${page.updated_by ? '' : ''} · v${page.version}</div>
    <div class="editor-bar">
      <button class="btn btn-ghost btn-sm" id="pageSaveBtn">${_t('ws_save')}</button>
      <button class="btn btn-ghost btn-sm" id="pageAddChild">+ ${_t('subtasks')}</button>
      ${canDelete ? `<button class="btn btn-ghost btn-sm" id="pageDelBtn" style="color:var(--danger)">${_t('delete_btn')}</button>` : ''}
    </div>
    <textarea class="editor-area" id="pageContent" style="width:100%;min-height:280px;padding:10px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px;line-height:1.6;font-family:inherit;resize:vertical;outline:none">${escapeHtml(page.content_md)}</textarea>
  `;
  $('#pageSaveBtn').onclick = () => savePage(page);
  $('#pageAddChild').onclick = () => createPage(page.id);
  const delBtn = $('#pageDelBtn');
  if (delBtn) delBtn.onclick = () => deletePage(page);
}

async function savePage(page) {
  const title = $('#pageTitle').textContent.trim() || page.title;
  const content_md = $('#pageContent').value;
  try {
    const updated = await api(`/projects/${state.currentProjectId}/pages/${page.id}`, {
      method: 'PATCH', body: { title, content_md, version: page.version },
    });
    toast(_t('ws_saved'));
    await loadPages();
    currentPageId = updated.id;
    renderTree();
    const p = allPages.find((x) => x.id === updated.id);
    if (p) renderEditor(p);
  } catch (e) {
    if (e.message.includes('409') || e.message.includes('conflict')) toast(_t('invalid_transition'));
    else toast(e.message);
  }
}

async function createPage(parentId) {
  const title = await inputModal(parentId ? '新建子文档' : '新建文档', [{ label: '文档标题', placeholder: '如：技术规范、会议纪要…' }]);
  if (!title) return;
  try {
    const p = await api(`/projects/${state.currentProjectId}/pages`, {
      method: 'POST', body: { title, parent_page_id: parentId },
    });
    currentPageId = p.id;
    await loadPages();
  } catch (e) { toast(e.message); }
}

async function deletePage(page) {
  if (!confirm(_t('delete_confirm')(page.title))) return;
  try {
    await api(`/projects/${state.currentProjectId}/pages/${page.id}`, { method: 'DELETE' });
    currentPageId = null;
    await loadPages();
  } catch (e) { toast(e.message); }
}
