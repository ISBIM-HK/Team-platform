'use strict';

import { $, toast } from './core.js';
import { _t } from './i18n.js';
import { state } from './state.js';

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
  else if (name.endsWith('.docx')) text = await parseDOCX(file);
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
      toast('请先在左侧选择一个项目');
      return;
    }
    input.click();
  };
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    input.value = '';

    toast(`解析 ${file.name}…`);
    try {
      const text = await parseFile(file);
      if (!text.trim()) { toast('文档内容为空'); return; }
      onText(`📄 ${file.name}\n\n${text}`);
    } catch (e) {
      toast(`解析失败：${e.message}`);
    }
  };
}
