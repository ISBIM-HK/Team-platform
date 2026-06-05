'use strict';

import { _t } from './i18n.js';

export const state = {
  me: null,
  userMap: {},
  projects: [],
  archivedProjects: [],
  currentProjectId: null,
  allSuggestions: [],
  boardTasks: [],
  chatSocket: null,
  chatSession: null,
  allSessions: [],
};

export const STATUS_IDS = ['todo', 'in_progress', 'blocked', 'review', 'done'];
const STATUS_I18N = { todo: 's_todo', in_progress: 's_in_progress', blocked: 's_blocked', review: 's_review', done: 's_done' };

export function getStatuses() { return STATUS_IDS.map((id) => ({ id, name: _t(STATUS_I18N[id]) })); }
export function getStatusName(id) { return _t(STATUS_I18N[id]) || id; }

export const STATUS_NAME = {};
export function refreshStatusNames() { STATUS_IDS.forEach((id) => { STATUS_NAME[id] = _t(STATUS_I18N[id]); }); }

export const PRIO = { 0: ['low', ''], 1: ['normal', ''], 2: ['high', ''], 3: ['urgent', ''] };

export const NEXT_MAP = {
  todo: [['in_progress', 'start']], in_progress: [['review', 'submit_review'], ['done', 'complete'], ['blocked', 's_blocked']],
  blocked: [['in_progress', 'unblock']], review: [['done', 'complete'], ['in_progress', 'reject']], done: [['archived', 'archive_task']], archived: [['todo', 'restore']],
};

export function getNext(status) { return (NEXT_MAP[status] || []).map(([to, key]) => [to, _t(key)]); }
export function getSugLabel(type) { return _t({ decompose: 'task_decompose', create_task: 'create_task', assign: 'assign_sug' }[type] || type); }

export const DEFAULT_TOKEN_SCOPES = ['contributions:write', 'contributions:read', 'projects:read'];
export const SCOPE_KEYS = ['contributions:write', 'contributions:read', 'projects:read', 'projects:write', 'tasks:read', 'tasks:write', 'suggestions:read', 'suggestions:write', 'notifications:read', 'notifications:write', 'assistant:read', 'assistant:write', 'chat:read', 'chat:write', 'users:read', 'profile:read', 'integrations:read', 'integrations:write', 'decompose', 'brief', 'pm', 'admin', 'tokens:manage'];
