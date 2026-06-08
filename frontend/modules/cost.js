'use strict';

import { $, api, escapeHtml, App, loadingHint } from './core.js';
import { _t } from './i18n.js';

export function initCost() {
  $('#navCost').onclick = async () => {
    App.showView('costView');
    const body = $('#costBody'); body.innerHTML = loadingHint(_t('loading'));
    try {
      const d = await api('/pm/llm-usage');
      const rows = d.by_trigger.map((t) => `<div class="cost-row"><span class="ctrigger">${t.trigger}</span><span class="cnums">${t.calls} ${_t('calls')} · ${t.tokens_in + t.tokens_out} tokens</span><span class="ccost">$${t.cost_usd.toFixed(4)}</span></div>`).join('');
      const umRows = (d.by_user_model || []).map((u) => `<div class="cost-row"><span class="ctrigger">${escapeHtml(u.user_name)}</span><span class="cnums" style="flex:1">${escapeHtml(u.model)} · ${u.calls} ${_t('calls')} · ${u.tokens_in + u.tokens_out} tokens</span><span class="ccost">$${u.cost_usd.toFixed(4)}</span></div>`).join('');
      body.innerHTML = `<div class="cost-total"><div class="big">$${d.total_cost_usd.toFixed(4)}</div><div class="sub">${d.total_calls} ${_t('calls')} · ${d.total_tokens_in + d.total_tokens_out} tokens · ${d.since.slice(0, 10)}</div></div>`
        + `<div class="section-title" style="font-size:14px;margin:16px 0 8px">${_t('by_trigger')}</div><div class="cost-breakdown">${rows || '<div class="plan-hint">' + _t('no_calls_today') + '</div>'}</div>`
        + `<div class="section-title" style="font-size:14px;margin:16px 0 8px">${_t('by_user_model')}</div><div class="cost-breakdown">${umRows || '<div class="plan-hint">' + _t('no_data') + '</div>'}</div>`;
    } catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; }
  };
}
