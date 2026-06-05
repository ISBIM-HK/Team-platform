'use strict';

import { $, toast, escapeHtml } from './core.js';
import { _t } from './i18n.js';
import { state } from './state.js';

function showProjectHint() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay show';
  overlay.style.zIndex = '90';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '360px';
  modal.style.textAlign = 'center';
  modal.innerHTML = `
    <div class="mbody" style="padding:28px 24px">
      <div style="margin-bottom:12px;opacity:0.25"><svg width="40" height="40" viewBox="0 0 64 64" fill="none"><path fill="#1a1a1a" fill-rule="evenodd" clip-rule="evenodd" d="M8 34L56 10L42 54L31 38L8 34ZM31 38L40 26L42 54L31 38Z"/><rect x="47" y="12" width="7" height="7" rx="1.5" fill="#c8a951"/></svg></div>
      <div style="font-size:15px;font-weight:600;margin-bottom:6px">请先选择一个项目</div>
      <div style="font-size:13px;color:var(--text-2);line-height:1.6">在左侧项目列表中点击一个项目，<br>或点「+ 新建项目」创建一个新项目。<br>之后即可上传文档让 AI 助手处理。</div>
      <button class="btn btn-primary" style="margin-top:16px" id="__hint_ok">知道了</button>
    </div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  modal.querySelector('#__hint_ok').onclick = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

const MAX_CHARS = 15000;

async function parsePDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) throw new Error('PDF.js not loaded');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  return pages.join('\n\n');
}

async function parseDOCX(file) {
  const arrayBuffer = await file.arrayBuffer();
  if (!window.mammoth) throw new Error('Mammoth not loaded');
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function parseXLSX(file) {
  const arrayBuffer = await file.arrayBuffer();
  if (!window.XLSX) throw new Error('SheetJS not loaded');
  const wb = window.XLSX.read(arrayBuffer, { type: 'array' });
  const sheets = [];
  wb.SheetNames.forEach((name) => {
    const csv = window.XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    sheets.push(`## ${name}\n${csv}`);
  });
  return sheets.join('\n\n');
}

async function parseText(file) {
  return await file.text();
}

async function parseFile(file) {
  const name = file.name.toLowerCase();
  let text;
  if (name.endsWith('.pdf')) text = await parsePDF(file);
  else if (name.endsWith('.docx') || name.endsWith('.doc')) text = await parseDOCX(file);
  else if (name.endsWith('.xlsx') || name.endsWith('.xls')) text = await parseXLSX(file);
  else text = await parseText(file);

  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS) + `\n\n...(文档截断，共 ${text.length} 字，已显示前 ${MAX_CHARS} 字)`;
  }
  return text;
}

export function initFileUpload(onText) {
  const btn = $('#chatFileBtn');
  const input = $('#chatFileInput');
  if (!btn || !input) return;

  btn.onclick = () => {
    if (!state.currentProjectId) {
      showProjectHint();
      return;
    }
    input.click();
  };
  async function handleFile(file) {
    if (!state.currentProjectId) { showProjectHint(); return; }
    const allowed = ['.pdf', '.doc', '.docx', '.xlsx', '.xls', '.txt', '.md', '.csv'];
    if (!allowed.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      toast('不支持的文件格式'); return;
    }
    toast(`解析 ${file.name}…`);
    let text;
    try {
      text = await parseFile(file);
      if (!text.trim()) { toast('文档内容为空'); return; }
    } catch (e) {
      toast(`解析失败：${e.message}`); return;
    }
    showDocPreview(file.name, text, onText);
  }

  function showDocPreview(filename, text, onSend) {
    const preview = text.length > 500 ? text.slice(0, 500) + '…' : text;
    const overlay = document.createElement('div');
    overlay.className = 'overlay show';
    overlay.style.zIndex = '90';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '500px';
    modal.innerHTML = `
      <div class="mhead">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--gold)">文档上传</div>
        <h3 style="font-size:16px;margin-top:2px">📄 ${escapeHtml(filename)}</h3>
        <div style="font-size:11px;color:var(--text-3)">${text.length} 字</div>
      </div>
      <div class="mbody">
        <div style="font-size:12px;color:var(--text-2);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px;max-height:150px;overflow-y:auto;line-height:1.5;white-space:pre-line;margin-bottom:10px">${escapeHtml(preview)}</div>
        <div class="field">
          <label>附加说明（可选）</label>
          <input id="__doc_note" type="text" placeholder="如：请拆解第三章的需求…" style="width:100%">
        </div>
      </div>
      <div class="mfoot">
        <button class="btn btn-ghost" id="__doc_cancel">取消</button>
        <button class="btn btn-primary" id="__doc_send">发送给助手</button>
      </div>`;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    const noteInput = modal.querySelector('#__doc_note');
    noteInput.focus();
    const cleanup = () => overlay.remove();
    modal.querySelector('#__doc_cancel').onclick = cleanup;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
    modal.querySelector('#__doc_send').onclick = () => {
      const note = noteInput.value.trim();
      let msg = `📄 ${filename}\n\n${text}`;
      if (note) msg += `\n\n用户说明：${note}`;
      onSend(msg);
      cleanup();
    };
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') modal.querySelector('#__doc_send').click();
      if (e.key === 'Escape') cleanup();
    });
  }

  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    input.value = '';
    await handleFile(file);
  };

  // Prevent browser from opening dropped files
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  // Drag-and-drop on assistant panel
  const asst = document.getElementById('assistant');
  if (asst) {
    asst.addEventListener('dragenter', (e) => { e.preventDefault(); e.stopPropagation(); asst.classList.add('file-drag-over'); });
    asst.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; });
    asst.addEventListener('dragleave', (e) => { e.preventDefault(); if (!asst.contains(e.relatedTarget)) asst.classList.remove('file-drag-over'); });
    asst.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation(); asst.classList.remove('file-drag-over');
      const file = e.dataTransfer.files[0];
      if (file) await handleFile(file);
    });
  }
}
