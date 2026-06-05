'use strict';

import { $, escapeHtml, App } from './core.js';

let loaded = false;

function renderMd(md) {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^\| (.+)$/gm, (_, row) => {
      const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
      return '<tr>' + cells.map((c) => `<td>${c}</td>`).join('') + '</tr>';
    })
    .replace(/(<tr>.*<\/tr>\n?)+/g, (block) => `<table class="help-table">${block}</table>`)
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[huptl])/gm, '')
    .replace(/<p><\/p>/g, '');
}

async function loadHelp() {
  App.showView('helpView');
  if (loaded) return;
  const body = $('#helpBody');
  try {
    const resp = await fetch('/docs/user-guide.md');
    if (!resp.ok) throw new Error('Not found');
    const md = await resp.text();
    body.innerHTML = `<div class="help-md">${renderMd(md)}</div>`;
    loaded = true;
  } catch {
    body.innerHTML = '<div class="help-md"><p>使用指南加载失败。</p></div>';
  }
}

export function initHelp() {
  $('#navHelp').onclick = loadHelp;
}
