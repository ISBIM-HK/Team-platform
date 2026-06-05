'use strict';

import { $, api, App } from './modules/core.js';
import { applyLang, initLangSwitcher, currentLang, setLang } from './modules/i18n.js';
import { state, refreshStatusNames } from './modules/state.js';
import { initials } from './modules/core.js';
import { _t } from './modules/i18n.js';
import { initAuth } from './modules/auth.js';
import { initViews, showView, selectProject, loadProjects, loadUsers, refreshProjMeta } from './modules/views.js';
import { loadBoard, openTaskDetail } from './modules/board.js';
import { loadShare } from './modules/share.js';
import { loadProjectWorkspace, initWorkspace } from './modules/workspace.js';
import { loadSuggestions, renderSuggestionsView, renderPlanSuggestions, renderPlanImplHints, initDecompose } from './modules/suggestions.js';
import { initChat } from './modules/chat.js';
import { initAssistantSettings } from './modules/chat.js';
import { updateNotifBadge, connectNotifSSE, cleanupSSE, initNotifications } from './modules/notifications.js';
import { initIntegrations } from './modules/integrations.js';
import { initTokens } from './modules/tokens.js';
import { initAdmin } from './modules/admin.js';
import { initMembers } from './modules/members.js';
import { initCost } from './modules/cost.js';
import { initHelp } from './modules/help.js';
import { loadViewBar } from './modules/savedviews.js';
import { loadPages } from './modules/pages.js';
import { loadCycles } from './modules/cycles.js';

// register cross-module functions into App registry
App.loadBoard = loadBoard;
App.openTaskDetail = openTaskDetail;
App.loadShare = loadShare;
App.loadProjectWorkspace = loadProjectWorkspace;
App.loadViewBar = loadViewBar;
App.loadPages = loadPages;
App.loadCycles = loadCycles;
App.loadProjects = loadProjects;
App.loadSuggestions = loadSuggestions;
App.renderSuggestionsView = renderSuggestionsView;
App.renderPlanSuggestions = renderPlanSuggestions;
App.renderPlanImplHints = renderPlanImplHints;
App.updateNotifBadge = updateNotifBadge;
App.refreshProjMeta = refreshProjMeta;
App.showView = showView;
App.selectProject = selectProject;

async function boot() {
  try { state.me = await api('/auth/me'); } catch {
    $('#ssoLogin').style.display = 'none'; $('#login').style.display = 'grid'; $('#app').classList.remove('active'); return;
  }
  $('#login').style.display = 'none'; $('#ssoLogin').style.display = 'none'; $('#app').classList.add('active');
  $('#whoName').textContent = state.me.display_name; $('#meAvatar').textContent = initials(state.me.display_name);
  $('#pmPill').style.display = state.me.is_pm ? 'inline' : 'none';
  $('#navCost').style.display = state.me.is_pm ? 'flex' : 'none';
  $('#navAdmin').style.display = state.me.is_admin ? 'flex' : 'none';
  applyLang(refreshStatusNames);
  await loadUsers(); await loadProjects(); await loadSuggestions(); updateNotifBadge(); connectNotifSSE(); await initChat();
}

// init all modules
initAuth(boot);
initViews();
initWorkspace();
initDecompose();
initAssistantSettings();
initNotifications();
initIntegrations();
initTokens();
initAdmin();
initMembers();
initCost();
initHelp();
initLangSwitcher(() => {
  applyLang(refreshStatusNames);
  if (state.currentProjectId) loadBoard();
});

window.addEventListener('beforeunload', () => {
  cleanupSSE();
  if (state.chatSocket) state.chatSocket.close();
});

applyLang(refreshStatusNames);
boot();
