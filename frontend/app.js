'use strict';

const API = '/api/v1';
const $ = (s) => document.querySelector(s);

// ─── i18n ───
const I18N = {
  'zh-CN': {
    // login
    login_title: 'Team Platform', login_sub: '使用企业账号安全登录', sso_btn: '企业账号登录（SSO）', sso_hint: '通过 JarvisBIM 身份验证登录',
    // sidebar
    projects: '项目', new_project: '＋ 新建项目', suggestions: '待处理建议', archived: '已归档', notifications: '通知',
    tokens: '访问令牌', admin: '团队管理', cost: 'LLM 成本',
    // project view
    board: '看板', share: '进度分享', members: '成员', ai_plan: 'AI 方案', proj_info: '项目信息',
    tasks_unit: '个任务', completion: '完成', archive_proj: '归档项目', delete_proj: '删除项目',
    // kanban statuses
    s_todo: '待办', s_in_progress: '进行中', s_blocked: '阻塞', s_review: '评审', s_done: '完成',
    unclaimed: '未认领', claim: '认领', start: '开始', submit_review: '提交评审', complete: '完成',
    unblock: '解除阻塞', reject: '退回', archive_task: '归档', restore: '恢复',
    subtasks: '子任务', archived_tasks: '已归档',
    // task detail
    description: '描述', none: '（无）', owner: '负责人', priority_time: '优先级 · 估时', ai_hint: 'AI 实现思路', close: '关闭',
    // share
    completion_rate: '完成度', task_flow: '任务流程', ai_brief: 'AI 进展简报', gen_brief: '生成简报', regen_brief: '重新生成',
    generating: '生成中…', just_generated: '刚刚生成', last_generated: '上次生成于',
    no_tasks_yet: '还没有任务。', gen_brief_hint: '点「生成简报」让 AI 汇总任务进展与成员投送的工作痕迹。',
    // suggestions
    pending_count: '条待处理', no_suggestions: '没有待处理的建议。', accept: '接受', reject_sug: '拒绝',
    task_decompose: '任务拆解', create_task: '创建任务', assign_sug: '分配建议',
    created_tasks: (n) => `已创建 ${n} 个任务`,
    // decompose
    add_tasks: '向本项目补充任务', decompose: '拆解', decomposing: '拆解中…',
    decompose_title: '拆解建议 · 待确认', confirm_accept: '接受并创建', dismiss: '忽略',
    my_tasks_hints: '我的任务 · AI 实现思路', proj_suggestions: '本项目的 AI 建议',
    no_proj_suggestions: '本项目暂无待处理 AI 建议。补充拆解后会出现在这里。',
    claim_hint: '认领任务后，AI 会在这里给出实现思路。', gen_hint: '生成思路', regen_hint: '重新生成',
    // new project modal
    new_proj_eyebrow: '新建项目', new_proj_goal_sub: '用一个目标，让 AI 拆成项目',
    new_proj_goal_hint: '描述你要做的事，AI 提议项目名 + 子任务；你确认后创建。',
    goal_placeholder: '例如：做一个客户工单自动分类的功能…', manual_name_placeholder: '手建空项目：直接填项目名',
    or_text: '或', cancel: '取消', create_empty: '建空项目', ai_decompose: 'AI 拆解 →',
    project_created: '项目已创建',
    // members modal
    members_title: '项目成员', members_hint_lead: 'lead 可加/移成员、改角色；成员只能查看。',
    members_hint_member: '你是项目成员，可查看名单。', set_member: '设为成员', set_lead: '设为 lead', remove: '移除',
    add_member: '添加成员…', add_btn: '添加', no_more_members: '没有可添加的成员了', you: '（你）',
    // assistant
    assistant: '个人助手', online: '在线', offline: '离线', settings: '助手设置',
    chat_placeholder: '问我，或让我记录工作…', new_chat: '新对话',
    del_session: '删除此对话', del_confirm: '删除当前对话？', keep_one: '至少保留一个对话',
    // assistant settings
    settings_eyebrow: '助手设置', settings_title: '人格 · 记忆 · 画像',
    settings_hint: '人格决定助手风格；记忆/画像由助手在对话中自动积累，你也可手动编辑。仅你可见。',
    persona: '人格（SOUL）', memory: '记忆（MEMORY）', profile: '关于我（USER 画像）',
    skills: '技能（指令包）· 启用的会注入助手', add_skill: '添加技能', save_edit: '保存修改',
    settings_saved: '助手设置已保存',
    // workspace
    ws_bg: '项目背景', ws_ctx: '上下文', ws_focus: '当前重点', ws_save: '保存', ws_saving: '保存中…',
    ws_readonly: '只读 — 项目 lead 或 PM 可编辑', ws_saved: '工作区已保存',
    // tokens
    token_name: '名称', token_agent: 'Agent', token_note: '备注', token_scopes: '权限范围',
    full_scope: '全权限 (*)', full_scope_hint: '可读写你的全部数据，只给可信客户端。',
    create_token: '创建令牌', token_created: '令牌已创建',
    token_reveal_hint: '请立即复制。关闭此窗口后令牌不再显示，只能删除重建。',
    copy_token: '复制令牌', saved_close: '我已保存，关闭', revoke: '撤销',
    revoke_confirm: (name) => `撤销令牌「${name}」？`, token_revoked: '令牌已撤销',
    never_used: '尚未使用', last_used: '最近使用',
    confirm_full_scope: '创建全权限令牌？它可读写你的全部数据。',
    // cost
    cost_title: 'LLM 成本', cost_today: '今日(UTC) · 团队', calls: '次调用',
    by_trigger: '按触发类型', by_user_model: '按用户 · 模型', no_calls_today: '今日还没有 LLM 调用。',
    // admin
    admin_title: '团队管理', set_roles: '设置成员角色(admin / pm)',
    // notifications
    notif_title: '通知', read: '已读', no_notifs: '还没有通知。',
    // empty state
    empty_title: '选一个项目开始', empty_desc: '从左侧选项目，或点「＋ 新建项目」让 AI 把一个目标拆成分好工的子任务。',
    // misc
    loading: '加载中…', no_data: '无数据', error_prefix: '出错：', archived_label: '已归档',
    archive_confirm: (name) => `归档项目「${name}」？`, delete_confirm: (name) => `删除项目「${name}」？此操作不可恢复。`,
    proj_archived: '已归档', proj_deleted: '已删除', claimed: '已认领',
    invalid_transition: '不允许的状态转换',
    welcome: (name) => `你好 ${name}，我是小T，你的工作助手。可以帮你查任务、记录工作、拆解需求，或理清今天要做什么。`,
  },
  'zh-HK': {
    login_title: 'Team Platform', login_sub: '使用企業賬號安全登錄', sso_btn: '企業賬號登錄（SSO）', sso_hint: '透過 JarvisBIM 身份驗證登錄',
    projects: '項目', new_project: '＋ 新建項目', suggestions: '待處理建議', archived: '已歸檔', notifications: '通知',
    tokens: '訪問令牌', admin: '團隊管理', cost: 'LLM 成本',
    board: '看板', share: '進度分享', members: '成員', ai_plan: 'AI 方案', proj_info: '項目資訊',
    tasks_unit: '個任務', completion: '完成', archive_proj: '歸檔項目', delete_proj: '刪除項目',
    s_todo: '待辦', s_in_progress: '進行中', s_blocked: '阻塞', s_review: '評審', s_done: '完成',
    unclaimed: '未認領', claim: '認領', start: '開始', submit_review: '提交評審', complete: '完成',
    unblock: '解除阻塞', reject: '退回', archive_task: '歸檔', restore: '恢復',
    subtasks: '子任務', archived_tasks: '已歸檔',
    description: '描述', none: '（無）', owner: '負責人', priority_time: '優先級 · 估時', ai_hint: 'AI 實現思路', close: '關閉',
    completion_rate: '完成度', task_flow: '任務流程', ai_brief: 'AI 進展簡報', gen_brief: '生成簡報', regen_brief: '重新生成',
    generating: '生成中…', just_generated: '剛剛生成', last_generated: '上次生成於',
    no_tasks_yet: '還沒有任務。', gen_brief_hint: '點「生成簡報」讓 AI 匯總任務進展與成員投送的工作痕跡。',
    pending_count: '條待處理', no_suggestions: '沒有待處理的建議。', accept: '接受', reject_sug: '拒絕',
    task_decompose: '任務拆解', create_task: '創建任務', assign_sug: '分配建議',
    created_tasks: (n) => `已創建 ${n} 個任務`,
    add_tasks: '向本項目補充任務', decompose: '拆解', decomposing: '拆解中…',
    new_proj_eyebrow: '新建項目', new_proj_goal_sub: '用一個目標，讓 AI 拆成項目',
    new_proj_goal_hint: '描述你要做的事，AI 提議項目名 + 子任務；你確認後創建。',
    goal_placeholder: '例如：做一個客戶工單自動分類的功能…', manual_name_placeholder: '手建空項目：直接填項目名',
    or_text: '或', cancel: '取消', create_empty: '建空項目', ai_decompose: 'AI 拆解 →',
    project_created: '項目已創建',
    members_title: '項目成員', members_hint_lead: 'lead 可加/移成員、改角色；成員只能查看。',
    members_hint_member: '你是項目成員，可查看名單。', set_member: '設為成員', set_lead: '設為 lead', remove: '移除',
    add_member: '添加成員…', add_btn: '添加', no_more_members: '沒有可添加的成員了', you: '（你）',
    assistant: '個人助手', online: '在線', offline: '離線', settings: '助手設定',
    chat_placeholder: '問我，或讓我記錄工作…', new_chat: '新對話',
    del_session: '刪除此對話', del_confirm: '刪除當前對話？', keep_one: '至少保留一個對話',
    settings_eyebrow: '助手設定', settings_title: '人格 · 記憶 · 畫像',
    settings_hint: '人格決定助手風格；記憶/畫像由助手在對話中自動積累，你也可手動編輯。僅你可見。',
    persona: '人格（SOUL）', memory: '記憶（MEMORY）', profile: '關於我（USER 畫像）',
    skills: '技能（指令包）· 啟用的會注入助手', add_skill: '添加技能', save_edit: '儲存修改',
    settings_saved: '助手設定已儲存',
    ws_bg: '項目背景', ws_ctx: '上下文', ws_focus: '當前重點', ws_save: '儲存', ws_saving: '儲存中…',
    ws_readonly: '唯讀 — 項目 lead 或 PM 可編輯', ws_saved: '工作區已儲存',
    cost_title: 'LLM 成本', cost_today: '今日(UTC) · 團隊', calls: '次調用',
    by_trigger: '按觸發類型', by_user_model: '按用戶 · 模型', no_calls_today: '今日還沒有 LLM 調用。',
    admin_title: '團隊管理', set_roles: '設置成員角色(admin / pm)',
    notif_title: '通知', read: '已讀', no_notifs: '還沒有通知。',
    empty_title: '選一個項目開始', empty_desc: '從左側選項目，或點「＋ 新建項目」讓 AI 把目標拆成子任務。',
    loading: '載入中…', no_data: '無資料', error_prefix: '出錯：',
    archive_confirm: (name) => `歸檔項目「${name}」？`, delete_confirm: (name) => `刪除項目「${name}」？此操作不可恢復。`,
    proj_archived: '已歸檔', proj_deleted: '已刪除', claimed: '已認領',
    invalid_transition: '不允許的狀態轉換',
    decompose_title: '拆解建議 · 待確認', confirm_accept: '接受並創建', dismiss: '忽略',
    my_tasks_hints: '我的任務 · AI 實現思路', proj_suggestions: '本項目的 AI 建議',
    no_proj_suggestions: '本項目暫無待處理 AI 建議。補充拆解後會出現在這裡。',
    claim_hint: '認領任務後，AI 會在這裡給出實現思路。', gen_hint: '生成思路', regen_hint: '重新生成',
    token_name: '名稱', token_agent: 'Agent', token_note: '備註', token_scopes: '權限範圍',
    full_scope: '全權限 (*)', full_scope_hint: '可讀寫你的全部資料，只給可信客戶端。',
    create_token: '創建令牌', token_created: '令牌已創建',
    token_reveal_hint: '請立即複製。關閉此窗口後令牌不再顯示，只能刪除重建。',
    copy_token: '複製令牌', saved_close: '我已保存，關閉', revoke: '撤銷',
    revoke_confirm: (name) => `撤銷令牌「${name}」？`, token_revoked: '令牌已撤銷',
    never_used: '尚未使用', last_used: '最近使用',
    confirm_full_scope: '創建全權限令牌？它可讀寫你的全部資料。',
    welcome: (name) => `你好 ${name}，我是小T，你的工作助手。可以幫你查任務、記錄工作、拆解需求，或理清今天要做什麼。`,
  },
  'en': {
    login_title: 'Team Platform', login_sub: 'Sign in with your enterprise account', sso_btn: 'Enterprise Login (SSO)', sso_hint: 'Authenticate via JarvisBIM',
    projects: 'Projects', new_project: '+ New Project', suggestions: 'Pending Suggestions', archived: 'Archived', notifications: 'Notifications',
    tokens: 'Access Tokens', admin: 'Team Admin', cost: 'LLM Cost',
    board: 'Board', share: 'Progress', members: 'Members', ai_plan: 'AI Plan', proj_info: 'Project Info',
    tasks_unit: 'tasks', completion: 'done', archive_proj: 'Archive Project', delete_proj: 'Delete Project',
    s_todo: 'To Do', s_in_progress: 'In Progress', s_blocked: 'Blocked', s_review: 'Review', s_done: 'Done',
    unclaimed: 'Unclaimed', claim: 'Claim', start: 'Start', submit_review: 'Submit Review', complete: 'Complete',
    unblock: 'Unblock', reject: 'Return', archive_task: 'Archive', restore: 'Restore',
    subtasks: 'subtasks', archived_tasks: 'Archived',
    description: 'Description', none: '(none)', owner: 'Owner', priority_time: 'Priority / Est.', ai_hint: 'AI Impl. Hint', close: 'Close',
    completion_rate: 'Completion', task_flow: 'Task Flow', ai_brief: 'AI Progress Brief', gen_brief: 'Generate Brief', regen_brief: 'Regenerate',
    generating: 'Generating…', just_generated: 'Just generated', last_generated: 'Last generated at',
    no_tasks_yet: 'No tasks yet.', gen_brief_hint: 'Click "Generate Brief" to let AI summarize task progress and team contributions.',
    pending_count: 'pending', no_suggestions: 'No pending suggestions.', accept: 'Accept', reject_sug: 'Reject',
    task_decompose: 'Decompose', create_task: 'Create Task', assign_sug: 'Assignment',
    created_tasks: (n) => `Created ${n} tasks`,
    add_tasks: 'Add tasks to project', decompose: 'Decompose', decomposing: 'Decomposing…',
    new_proj_eyebrow: 'New Project', new_proj_goal_sub: 'Describe a goal, let AI break it down',
    new_proj_goal_hint: 'Describe what you want to do. AI will propose a project name + subtasks; you confirm to create.',
    goal_placeholder: 'e.g. Build an auto-classification system for customer tickets…', manual_name_placeholder: 'Create empty project: enter name directly',
    or_text: 'or', cancel: 'Cancel', create_empty: 'Create Empty', ai_decompose: 'AI Decompose →',
    project_created: 'Project created',
    members_title: 'Project Members', members_hint_lead: 'Lead can add/remove members and change roles; members can only view.',
    members_hint_member: 'You are a project member. View only.', set_member: 'Set Member', set_lead: 'Set Lead', remove: 'Remove',
    add_member: 'Add member…', add_btn: 'Add', no_more_members: 'No more members to add', you: '(you)',
    assistant: 'Assistant', online: 'Online', offline: 'Offline', settings: 'Settings',
    chat_placeholder: 'Ask me, or log your work…', new_chat: 'New chat',
    del_session: 'Delete chat', del_confirm: 'Delete this conversation?', keep_one: 'Must keep at least one conversation',
    settings_eyebrow: 'Assistant Settings', settings_title: 'Persona · Memory · Profile',
    settings_hint: 'Persona sets the assistant style; memory/profile accumulate from conversations. You can also edit manually. Only visible to you.',
    persona: 'Persona (SOUL)', memory: 'Memory (MEMORY)', profile: 'About Me (USER Profile)',
    skills: 'Skills (instruction packs) · enabled ones injected into assistant', add_skill: 'Add Skill', save_edit: 'Save Changes',
    settings_saved: 'Assistant settings saved',
    ws_bg: 'Background', ws_ctx: 'Context', ws_focus: 'Current Focus', ws_save: 'Save', ws_saving: 'Saving…',
    ws_readonly: 'Read-only — project lead or PM can edit', ws_saved: 'Workspace saved',
    cost_title: 'LLM Cost', cost_today: 'Today (UTC) · Team', calls: 'calls',
    by_trigger: 'By Trigger', by_user_model: 'By User · Model', no_calls_today: 'No LLM calls today.',
    admin_title: 'Team Admin', set_roles: 'Set member roles (admin / pm)',
    notif_title: 'Notifications', read: 'Read', no_notifs: 'No notifications yet.',
    empty_title: 'Pick a project', empty_desc: 'Select a project from the left, or click "+ New Project" to let AI decompose a goal into tasks.',
    loading: 'Loading…', no_data: 'No data', error_prefix: 'Error: ',
    archive_confirm: (name) => `Archive project "${name}"?`, delete_confirm: (name) => `Delete project "${name}"? This cannot be undone.`,
    proj_archived: 'Archived', proj_deleted: 'Deleted', claimed: 'Claimed',
    invalid_transition: 'Invalid status transition',
    decompose_title: 'Decompose Suggestion · Pending', confirm_accept: 'Accept & Create', dismiss: 'Dismiss',
    my_tasks_hints: 'My Tasks · AI Implementation Hints', proj_suggestions: 'AI Suggestions for this Project',
    no_proj_suggestions: 'No pending AI suggestions for this project. They will appear after decomposition.',
    claim_hint: 'Claim a task and AI will provide implementation hints here.', gen_hint: 'Generate Hint', regen_hint: 'Regenerate',
    token_name: 'Name', token_agent: 'Agent', token_note: 'Note', token_scopes: 'Scopes',
    full_scope: 'Full Access (*)', full_scope_hint: 'Full read/write access to all your data. Only grant to trusted clients.',
    create_token: 'Create Token', token_created: 'Token Created',
    token_reveal_hint: 'Copy now. After closing this dialog, the token will never be shown again.',
    copy_token: 'Copy Token', saved_close: 'I\'ve saved it, close', revoke: 'Revoke',
    revoke_confirm: (name) => `Revoke token "${name}"?`, token_revoked: 'Token revoked',
    never_used: 'Never used', last_used: 'Last used',
    confirm_full_scope: 'Create full-access token? It can read/write all your data.',
    welcome: (name) => `Hi ${name}, I'm XiaoT, your work assistant. I can help with tasks, logging work, decomposing requirements, or planning your day.`,
  },
};
let currentLang = localStorage.getItem('lang') || 'zh-CN';
function _t(key) { return (I18N[currentLang] || I18N['zh-CN'])[key] || key; }
function applyLang() {
  refreshStatusNames();
  const L = I18N[currentLang] || I18N['zh-CN'];
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (L[key]) el.textContent = L[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (L[key]) el.placeholder = L[key];
  });
  document.querySelectorAll('#langMenu button').forEach((b) => {
    b.classList.toggle('active', b.dataset.lang === currentLang);
  });
}
$('#langTrigger').onclick = (e) => {
  e.stopPropagation();
  $('#langMenu').classList.toggle('open');
};
document.querySelectorAll('#langMenu button').forEach((b) => {
  b.onclick = (e) => {
    e.stopPropagation();
    currentLang = b.dataset.lang;
    localStorage.setItem('lang', currentLang);
    applyLang();
    if (currentProjectId) loadBoard();
    $('#langMenu').classList.remove('open');
  };
});
document.addEventListener('click', () => $('#langMenu').classList.remove('open'));

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin',
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.title || `HTTP ${res.status}`);
  return data;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function initials(n) { return (n || '?').trim().slice(0, 2).toUpperCase(); }

// ─── state ───
let me = null, userMap = {}, projects = [], archivedProjects = [], currentProjectId = null, allSuggestions = [], boardTasks = [];
let chatSocket = null, chatSession = null;

const STATUS_IDS = ['todo', 'in_progress', 'blocked', 'review', 'done'];
const STATUS_I18N = { todo: 's_todo', in_progress: 's_in_progress', blocked: 's_blocked', review: 's_review', done: 's_done' };
function getStatuses() { return STATUS_IDS.map((id) => ({ id, name: _t(STATUS_I18N[id]) })); }
function getStatusName(id) { return t(STATUS_I18N[id]) || id; }
const STATUSES = STATUS_IDS.map((id) => ({ id, name: id }));
const STATUS_NAME = {};
function refreshStatusNames() { STATUS_IDS.forEach((id) => { STATUS_NAME[id] = _t(STATUS_I18N[id]); }); }
const PRIO_I18N = { 2: 'high', 3: 'urgent' };
const PRIO = { 0: ['low', ''], 1: ['normal', ''], 2: ['high', ''], 3: ['urgent', ''] };
const NEXT_MAP = {
  todo: [['in_progress', 'start']], in_progress: [['review', 'submit_review'], ['done', 'complete'], ['blocked', 's_blocked']],
  blocked: [['in_progress', 'unblock']], review: [['done', 'complete'], ['in_progress', 'reject']], done: [['archived', 'archive_task']], archived: [['todo', 'restore']],
};
function getNext(status) { return (NEXT_MAP[status] || []).map(([to, key]) => [to, _t(key)]); }
const NEXT = NEXT_MAP;
function getSugLabel(type) { return _t({ decompose: 'task_decompose', create_task: 'create_task', assign: 'assign_sug' }[type] || type); }
const DEFAULT_TOKEN_SCOPES = ['contributions:write', 'contributions:read', 'projects:read'];
const SCOPE_I18N = {
  'zh-CN': { 'contributions:write': '投送工作', 'contributions:read': '查看投送', 'projects:read': '查看项目', 'projects:write': '管理项目', 'tasks:read': '查看任务', 'tasks:write': '管理任务', 'suggestions:read': '查看建议', 'suggestions:write': '处理建议', 'notifications:read': '查看通知', 'notifications:write': '标记通知', 'assistant:read': '读取助手', 'assistant:write': '修改助手', 'chat:read': '读取聊天', 'chat:write': '发送聊天', 'users:read': '查看成员', 'profile:read': '读取资料', 'integrations:read': '查看集成', 'integrations:write': '管理集成', decompose: 'AI 拆解', brief: '生成简报', pm: 'PM 观测', admin: '管理后台', 'tokens:manage': '管理令牌' },
  'zh-HK': { 'contributions:write': '投送工作', 'contributions:read': '查看投送', 'projects:read': '查看項目', 'projects:write': '管理項目', 'tasks:read': '查看任務', 'tasks:write': '管理任務', 'suggestions:read': '查看建議', 'suggestions:write': '處理建議', 'notifications:read': '查看通知', 'notifications:write': '標記通知', 'assistant:read': '讀取助手', 'assistant:write': '修改助手', 'chat:read': '讀取聊天', 'chat:write': '發送聊天', 'users:read': '查看成員', 'profile:read': '讀取資料', 'integrations:read': '查看集成', 'integrations:write': '管理集成', decompose: 'AI 拆解', brief: '生成簡報', pm: 'PM 觀測', admin: '管理後台', 'tokens:manage': '管理令牌' },
  en: { 'contributions:write': 'Push Work', 'contributions:read': 'View Work', 'projects:read': 'View Projects', 'projects:write': 'Manage Projects', 'tasks:read': 'View Tasks', 'tasks:write': 'Manage Tasks', 'suggestions:read': 'View Suggestions', 'suggestions:write': 'Handle Suggestions', 'notifications:read': 'View Notifications', 'notifications:write': 'Mark Notifications', 'assistant:read': 'Read Assistant', 'assistant:write': 'Edit Assistant', 'chat:read': 'Read Chat', 'chat:write': 'Send Chat', 'users:read': 'View Members', 'profile:read': 'Read Profile', 'integrations:read': 'View Integrations', 'integrations:write': 'Manage Integrations', decompose: 'AI Decompose', brief: 'Generate Brief', pm: 'PM Observe', admin: 'Admin', 'tokens:manage': 'Manage Tokens' },
};
function getScopeLabel(scope) { return (SCOPE_I18N[currentLang] || SCOPE_I18N['zh-CN'])[scope] || scope; }
const SCOPE_KEYS = ['contributions:write', 'contributions:read', 'projects:read', 'projects:write', 'tasks:read', 'tasks:write', 'suggestions:read', 'suggestions:write', 'notifications:read', 'notifications:write', 'assistant:read', 'assistant:write', 'chat:read', 'chat:write', 'users:read', 'profile:read', 'integrations:read', 'integrations:write', 'decompose', 'brief', 'pm', 'admin', 'tokens:manage'];
const TOKEN_SCOPE_OPTIONS = SCOPE_KEYS.map((k) => [k, getScopeLabel(k)]);

// ─── starfield + mouse-triggered connections ───
function initStarfield() {
  const canvas = $('#starfield'); if (!canvas) return;
  if (canvas.dataset.init) return; canvas.dataset.init = '1';
  const ctx = canvas.getContext('2d');
  let w, h, stars;
  const mouse = { x: -9999, y: -9999 };
  const MOUSE_R = 200, LINK_R = 150;

  function resize() {
    w = canvas.width = canvas.parentElement.clientWidth;
    h = canvas.height = canvas.parentElement.clientHeight;
  }

  function create() {
    const count = Math.floor((w * h) / 6000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: Math.random() < 0.12 ? Math.random() * 2 + 1.8 : Math.random() * 1.2 + 0.4,
      base: Math.random() * 0.45 + 0.15,
      phase: Math.random() * Math.PI * 2,
      freq: Math.random() * 0.015 + 0.004,
    }));
  }

  let t = 0;
  function draw() {
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < stars.length; i++) {
      const a = stars[i];
      a.x += a.vx; a.y += a.vy;
      if (a.x < 0) a.x += w; if (a.x > w) a.x -= w;
      if (a.y < 0) a.y += h; if (a.y > h) a.y -= h;

      // twinkle
      const flicker = a.base + (1 - a.base) * (0.5 + 0.5 * Math.sin(t * a.freq + a.phase));

      // mouse proximity glow
      const mdx = a.x - mouse.x, mdy = a.y - mouse.y;
      const md = Math.sqrt(mdx * mdx + mdy * mdy);
      const boost = md < MOUSE_R ? (1 - md / MOUSE_R) * 0.5 : 0;
      const alpha = Math.min(flicker + boost, 1);

      // draw star
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r * (1 + boost * 0.6), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200, 220, 240, ' + alpha + ')';
      ctx.fill();

      // mouse → star lines
      if (md < MOUSE_R) {
        ctx.beginPath();
        ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(a.x, a.y);
        ctx.strokeStyle = 'rgba(60, 200, 235, ' + (1 - md / MOUSE_R) * 0.75 + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // star ↔ star lines near mouse
      if (md < MOUSE_R * 1.3) {
        for (let j = i + 1; j < stars.length; j++) {
          const b = stars[j];
          const bd = Math.sqrt((b.x - mouse.x) ** 2 + (b.y - mouse.y) ** 2);
          if (bd > MOUSE_R * 1.3) continue;
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK_R) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = 'rgba(60, 200, 235, ' + (1 - d / LINK_R) * 0.55 + ')';
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }
    }

    t++;
    requestAnimationFrame(draw);
  }

  const wrap = canvas.parentElement;
  wrap.addEventListener('mousemove', (e) => {
    const r = wrap.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  });
  wrap.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });
  window.addEventListener('resize', () => { resize(); create(); });
  resize(); create(); draw();
}

// ─── auth ───
// SSO entry → JarvisBIM auth page
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
    await boot();
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
$('#logoutBtn').onclick = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch {} if (chatSocket) chatSocket.close(); location.reload(); };

// ─── boot ───
async function boot() {
  try { me = await api('/auth/me'); } catch { $('#ssoLogin').style.display = 'none'; $('#login').style.display = 'grid'; $('#app').classList.remove('active'); return; }
  $('#login').style.display = 'none'; $('#ssoLogin').style.display = 'none'; $('#app').classList.add('active');
  $('#whoName').textContent = me.display_name; $('#meAvatar').textContent = initials(me.display_name);
  $('#pmPill').style.display = me.is_pm ? 'inline' : 'none';
  $('#navCost').style.display = me.is_pm ? 'flex' : 'none';
  $('#navAdmin').style.display = me.is_admin ? 'flex' : 'none';
  applyLang();
  await loadUsers(); await loadProjects(); await loadSuggestions(); updateNotifBadge(); connectNotifSSE(); await initChat();
}
async function loadUsers() { try { const r = await api('/users'); (Array.isArray(r) ? r : r.items || []).forEach((u) => userMap[u.id] = u.display_name); } catch {} }

// ─── center view switching ───
const VIEWS = ['emptyState', 'projectView', 'suggestionsView', 'archivedView', 'notificationsView', 'tokenView', 'costView', 'adminView'];
function showView(id) {
  VIEWS.forEach((v) => $('#' + v).style.display = v === id ? 'block' : 'none');
  $('#navSuggestions').classList.toggle('active-nav', id === 'suggestionsView');
  $('#navArchived').classList.toggle('active-nav', id === 'archivedView');
  $('#navNotifications').classList.toggle('active-nav', id === 'notificationsView');
  $('#navTokens').classList.toggle('active-nav', id === 'tokenView');
  $('#navCost').classList.toggle('active-nav', id === 'costView');
  $('#navAdmin').classList.toggle('active-nav', id === 'adminView');
  if (id !== 'projectView') { currentProjectId = null; document.querySelectorAll('.proj-item').forEach((el) => el.classList.remove('active')); }
  if (window.innerWidth <= 760) $('#sidebar').classList.remove('open');
}

// ─── projects (sidebar) ───
async function loadProjects(selectId) {
  try { projects = await api('/projects'); } catch (e) { toast(e.message); projects = []; }
  const list = $('#projectList'); list.innerHTML = '';
  projects.forEach((p) => {
    const el = document.createElement('div');
    el.className = 'proj-item' + (p.id === currentProjectId ? ' active' : '');
    el.innerHTML = `<span class="pdot"></span><span class="pname">${escapeHtml(p.name)}</span><span class="pcount">${p.task_count}</span>`
      + (p.name !== '未分类' ? `<button class="proj-menu-btn" title="更多">···</button><div class="proj-menu"><button data-action="archive">归档项目</button><button data-action="delete" class="danger">删除项目</button></div>` : '');
    el.querySelector('.pname').onclick = () => selectProject(p.id);
    el.querySelector('.pdot').onclick = () => selectProject(p.id);
    const menuBtn = el.querySelector('.proj-menu-btn');
    if (menuBtn) {
      menuBtn.onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.proj-menu.open').forEach((m) => m.classList.remove('open')); el.querySelector('.proj-menu').classList.toggle('open'); };
      el.querySelector('[data-action="archive"]').onclick = async (e) => {
        e.stopPropagation(); if (!confirm(`归档项目「${p.name}」？`)) return;
        try { await api(`/projects/${p.id}`, { method: 'PATCH', body: { status: 'archived' } }); toast(_t('proj_archived')); if (currentProjectId === p.id) { currentProjectId = null; showView('emptyState'); } await loadProjects(); await loadSuggestions(); } catch (err) { toast(err.message); }
      };
      el.querySelector('[data-action="delete"]').onclick = async (e) => {
        e.stopPropagation(); if (!confirm(`删除项目「${p.name}」？此操作不可恢复。`)) return;
        try { await api(`/projects/${p.id}`, { method: 'DELETE' }); toast(_t('proj_deleted')); if (currentProjectId === p.id) { currentProjectId = null; showView('emptyState'); } await loadProjects(); await loadSuggestions(); } catch (err) { toast(err.message); }
      };
    }
    list.appendChild(el);
  });
  if (selectId) selectProject(selectId);
}
async function loadArchivedProjects() {
  let all = [];
  try { all = await api('/projects?include_archived=true'); } catch (e) { toast(e.message); }
  archivedProjects = all.filter((p) => p.status === 'archived');
  renderArchivedProjects();
}
function renderArchivedProjects() {
  $('#archivedMeta').textContent = `${archivedProjects.length} ${_t('projects')}`;
  const body = $('#archivedProjectsBody'); body.innerHTML = '';
  if (!archivedProjects.length) { body.innerHTML = `<div class="empty-hint">${_t('no_data')}</div>`; return; }
  archivedProjects.forEach((p) => {
    const row = document.createElement('div'); row.className = 'admin-row';
    row.innerHTML = `<span class="pdot"></span><span class="ar-name"><b>${escapeHtml(p.name)}</b><span class="ws-meta">${p.task_count} ${_t('tasks_unit')} · ${_t('completion')} ${Math.round(p.completion * 100)}%</span></span><button class="btn btn-soft btn-sm">${_t('restore')}</button>`;
    row.querySelector('button').onclick = async () => {
      try {
        await api(`/projects/${p.id}`, { method: 'PATCH', body: { status: 'active' } });
        toast(_t('restore'));
        await loadProjects(p.id);
        await loadSuggestions();
        await loadArchivedProjects();
      } catch (e) { toast(e.message); }
    };
    body.appendChild(row);
  });
}
function selectProject(id) {
  currentProjectId = id;
  showView('projectView');
  document.querySelectorAll('.proj-item').forEach((el, i) => el.classList.toggle('active', projects[i] && projects[i].id === id));
  const p = projects.find((x) => x.id === id); if (!p) return;
  $('#pvName').textContent = p.name;
  $('#pvMeta').textContent = `${p.task_count} ${_t('tasks_unit')} · ${_t('completion')} ${Math.round(p.completion * 100)}%`;
  switchTab('board');
}
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.ws-actions .btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  ['board', 'plan', 'share', 'pwspace'].forEach((t) => $(`#tab-${t}`).style.display = t === tab ? 'block' : 'none');
  if (tab === 'board') loadBoard();
  else if (tab === 'share') loadShare();
  else if (tab === 'plan') { renderPlanSuggestions(); renderPlanImplHints(); }
  else if (tab === 'pwspace') loadProjectWorkspace();
}
document.querySelectorAll('.tab').forEach((t) => t.onclick = () => switchTab(t.dataset.tab));
$('#pvPlanBtn').onclick = () => switchTab('plan');
$('#pvWorkspaceBtn').onclick = () => switchTab('pwspace');

// ─── board ───
async function loadBoard() {
  try { boardTasks = await api(`/projects/${currentProjectId}/tasks`); } catch (e) { toast(e.message); boardTasks = []; }
  const childCount = {};
  boardTasks.forEach((t) => { if (t.parent_task_id) childCount[t.parent_task_id] = (childCount[t.parent_task_id] || 0) + 1; });
  const board = $('#board'); board.innerHTML = '';
  for (const col of getStatuses()) {
    const items = boardTasks.filter((t) => t.status === col.id);
    const el = document.createElement('div'); el.className = 'col';
    el.dataset.status = col.id;
    el.innerHTML = `<div class="col-head"><span class="dot ${col.id}"></span><span class="name">${col.name}</span><span class="count">${items.length}</span></div>`;
    if (!items.length) el.insertAdjacentHTML('beforeend', `<div class="col-empty">—</div>`);
    items.forEach((t, i) => el.appendChild(card(t, i, childCount[t.id] || 0)));

    // drop target
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      const taskId = e.dataTransfer.types.includes('text/plain');
      if (!taskId) return;
      const dragging = document.querySelector('.card.dragging');
      if (!dragging) return;
      const fromStatus = dragging.dataset.status;
      const validTargets = (NEXT[fromStatus] || []).map(([s]) => s);
      if (validTargets.includes(col.id)) {
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
        el.classList.remove('drag-invalid');
      } else {
        e.dataTransfer.dropEffect = 'none';
        el.classList.add('drag-invalid');
        el.classList.remove('drag-over');
      }
    });
    el.addEventListener('dragleave', () => { el.classList.remove('drag-over', 'drag-invalid'); });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('drag-over', 'drag-invalid');
      const taskId = e.dataTransfer.getData('text/plain');
      if (!taskId) return;
      const dragging = document.querySelector('.card.dragging');
      if (!dragging) return;
      const fromStatus = dragging.dataset.status;
      const validTargets = (NEXT[fromStatus] || []).map(([s]) => s);
      if (!validTargets.includes(col.id)) { toast(_t('invalid_transition')); return; }
      await move(taskId, col.id);
    });

    board.appendChild(el);
  }
  renderArchivedFold(boardTasks.filter((t) => t.status === 'archived'), childCount);
}
function renderArchivedFold(archived, childCount) {
  const fold = $('#archivedFold'); fold.innerHTML = '';
  if (!archived.length) return;
  const head = document.createElement('button');
  head.className = 'arch-head';
  head.innerHTML = `<span class="arch-arrow">▶</span>${_t('archived')} (${archived.length})`;
  const body = document.createElement('div'); body.className = 'arch-body';
  archived.forEach((t, i) => body.appendChild(card(t, i, childCount[t.id] || 0)));
  head.onclick = () => { head.classList.toggle('open'); body.classList.toggle('open'); };
  fold.appendChild(head); fold.appendChild(body);
}
function card(t, i, nChildren) {
  const el = document.createElement('div'); el.className = 'card'; el.style.animationDelay = (i * 0.03) + 's';
  el.dataset.taskId = t.id;
  el.dataset.status = t.status;
  const isAI = (t.created_by || '').startsWith('ai_auto');
  const ownerName = t.owner_user_id ? (userMap[t.owner_user_id] || _t('members')) : null;
  const [pcls, plabel] = PRIO[t.priority] || PRIO[1];
  const bits = [];
  if (ownerName) bits.push(`<span class="owner"><span class="avatar">${initials(ownerName)}</span>${escapeHtml(ownerName)}</span>`); else bits.push(`<span>${_t('unclaimed')}</span>`);
  if (t.estimated_hours) bits.push(`<span class="est">${t.estimated_hours}h</span>`);
  if (nChildren) bits.push(`<span class="subc">◧ ${nChildren} ${_t('subtasks')}</span>`);
  if (plabel) bits.push(`<span class="prio ${pcls}">${plabel}</span>`);
  if (isAI) bits.push('<span class="ai-tag">AI</span>');
  el.innerHTML = `<span class="drag-handle" draggable="true" title="drag">⠿</span><div class="ctitle">${escapeHtml(t.title)}</div>${t.description ? `<div class="cdesc">${escapeHtml(t.description)}</div>` : ''}<div class="cmeta">${bits.join('')}</div><div class="actions"></div>`;
  const actions = el.querySelector('.actions');
  const addBtn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = (e) => { e.stopPropagation(); fn(); }; actions.appendChild(b); };
  if (!t.owner_user_id) addBtn(_t('claim'), () => claim(t.id));
  getNext(t.status).forEach(([to, label]) => addBtn(label, () => move(t.id, to)));
  el.onclick = (e) => { if (!e.target.closest('.drag-handle')) openTaskDetail(t, nChildren); };

  // drag events on handle
  const handle = el.querySelector('.drag-handle');
  handle.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.id);
    e.dataTransfer.setDragImage(el, 20, 20);
    requestAnimationFrame(() => el.classList.add('dragging'));
    const validTargets = (NEXT[t.status] || []).map(([s]) => s);
    document.querySelectorAll('.col').forEach((col) => {
      if (validTargets.includes(col.dataset.status)) col.classList.add('drop-ready');
    });
  });
  handle.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    document.querySelectorAll('.col').forEach((c) => c.classList.remove('drag-over', 'drag-invalid', 'drop-ready'));
  });
  return el;
}
async function claim(id) {
  try {
    await api(`/tasks/${id}/claim`, { method: 'POST' });
    toast(_t('claimed')); updateNotifBadge(); loadBoard(); refreshProjMeta();
    // auto AI implementation hint for the claimed leaf task (附录 I.2) — async, refresh when ready
    api(`/tasks/${id}/impl-hint`, { method: 'POST' })
      .then((r) => { if (r && r.impl_hint && !r.skipped) { toast(_t('ai_hint')); loadBoard(); if ($('#tab-plan').style.display === 'block') renderPlanImplHints(); } })
      .catch(() => {});
  } catch (e) { toast(e.message); }
}
async function move(id, to) { try { await api(`/tasks/${id}`, { method: 'PATCH', body: { status: to } }); loadBoard(); refreshProjMeta(); } catch (e) { toast(e.message); } }
async function refreshProjMeta() { try { const p = await api(`/projects/${currentProjectId}`); const idx = projects.findIndex((x) => x.id === p.id); if (idx >= 0) projects[idx] = p; $('#pvMeta').textContent = `${p.task_count} ${_t('tasks_unit')} · ${_t('completion')} ${Math.round(p.completion * 100)}%`; const item = document.querySelectorAll('.proj-item')[idx]; if (item) item.querySelector('.pcount').textContent = p.task_count; } catch {} }

// ─── task detail ───
function openTaskDetail(t, nChildren) {
  $('#tdStatus').textContent = STATUS_NAME[t.status] || t.status;
  $('#tdTitle').textContent = t.title;
  const owner = t.owner_user_id ? (userMap[t.owner_user_id] || _t('members')) : _t('unclaimed');
  const children = boardTasks.filter((x) => x.parent_task_id === t.id);
  const childHtml = children.length
    ? `<div class="td-field"><div class="lbl">${_t('subtasks')} (${children.length})</div>${children.map((c) => `<div class="td-sub"><span class="st-status">${getStatusName(c.status)}</span>${escapeHtml(c.title)}${c.estimated_hours ? ` · ${c.estimated_hours}h` : ''}</div>`).join('')}</div>` : '';
  $('#tdBody').innerHTML = `
    ${t.description ? `<div class="td-field"><div class="lbl">${_t('description')}</div><div class="val">${escapeHtml(t.description)}</div></div>` : `<div class="td-field"><div class="lbl">${_t('description')}</div><div class="val" style="color:var(--text-3)">${_t('none')}</div></div>`}
    <div class="td-field"><div class="lbl">${_t('owner')}</div><div class="val">${escapeHtml(owner)}</div></div>
    <div class="td-field"><div class="lbl">${_t('priority_time')}</div><div class="val">${(PRIO[t.priority] || PRIO[1])[0]}${t.estimated_hours ? ` · ${t.estimated_hours}h` : ''}</div></div>
    ${t.impl_hint ? `<div class="td-field"><div class="lbl">${_t('ai_hint')}</div><div class="val">${escapeHtml(t.impl_hint)}</div></div>` : ''}
    ${childHtml}`;
  const foot = $('#tdFoot'); foot.innerHTML = '';
  if (!t.owner_user_id) { const b = document.createElement('button'); b.className = 'btn btn-soft'; b.textContent = _t('claim'); b.onclick = async () => { await claim(t.id); $('#taskOverlay').classList.remove('show'); }; foot.appendChild(b); }
  getNext(t.status).forEach(([to, label]) => { const b = document.createElement('button'); b.className = 'btn btn-ghost'; b.textContent = label; b.onclick = async () => { await move(t.id, to); $('#taskOverlay').classList.remove('show'); }; foot.appendChild(b); });
  const close = document.createElement('button'); close.className = 'btn btn-primary'; close.textContent = _t('close'); close.onclick = () => $('#taskOverlay').classList.remove('show'); foot.appendChild(close);
  $('#taskOverlay').classList.add('show');
}

// ─── share ───
function briefSections(b) {
  const list = (title, items, cls) => items && items.length
    ? `<div class="brief-sec ${cls}"><div class="brief-sec-t">${title}</div><ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : '';
  const hl = {en: ['Highlights', 'Blockers & Risks', 'Next Steps'], 'zh-CN': ['进展亮点', '阻塞与风险', '下一步'], 'zh-HK': ['進展亮點', '阻塞與風險', '下一步']};
  const titles = hl[currentLang] || hl['zh-CN'];
  return `<div class="brief-summary">${escapeHtml(b.summary)}</div>`
    + list(titles[0], b.highlights, 'hl')
    + list(titles[1], b.risks, 'risk')
    + list(titles[2], b.next_steps, 'next');
}
function fmtBriefTime(iso) { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString(); }

async function loadShare() {
  const body = $('#shareBody'); body.innerHTML = '<div class="plan-hint">'+_t('loading')+'</div>';
  let s; try { s = await api(`/projects/${currentProjectId}/share`); } catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  const p = s.project, pct = Math.round(p.completion * 100);
  const chips = getStatuses().map((c) => `<span class="chip">${c.name} ${s.status_counts[c.id] || 0}</span>`).join('');
  const byParent = {}, roots = [];
  s.tasks.forEach((t) => { if (t.parent_task_id) (byParent[t.parent_task_id] = byParent[t.parent_task_id] || []).push(t); else roots.push(t); });
  const row = (t, child) => `<div class="share-task ${child ? 'child' : ''}"><span class="st-status">${getStatusName(t.status)}</span><span>${escapeHtml(t.title)}</span>${t.owner_user_id ? `<span class="avatar" style="margin-left:auto">${initials(userMap[t.owner_user_id] || '·')}</span>` : ''}</div>`;
  let flow = ''; roots.forEach((r) => { flow += row(r, false); (byParent[r.id] || []).forEach((ch) => flow += row(ch, true)); });
  const hasBrief = !!s.brief;
  const briefBodyHtml = hasBrief ? briefSections(s.brief) : `<div class="plan-hint">${_t('gen_brief_hint')}</div>`;
  const metaHtml = hasBrief ? `${_t('last_generated')} ${escapeHtml(fmtBriefTime(s.brief_generated_at))}` : '';
  body.innerHTML = `<div class="share-summary"><div class="big">${pct}%</div><div class="ws-meta">${_t('completion_rate')} · ${p.done_count}/${p.task_count} ${_t('tasks_unit')}</div><div class="progress-bar"><i style="width:${pct}%"></i></div><div class="status-chips">${chips}</div></div>`
    + `<div class="brief-card" id="briefCard"><div class="brief-head"><span class="section-title" style="font-size:15px">${_t('ai_brief')}</span><span id="briefMeta" style="font-size:12px;color:var(--text-3);margin-left:auto;margin-right:8px">${metaHtml}</span><button class="btn btn-soft btn-sm" id="briefGenBtn">${hasBrief ? _t('regen_brief') : _t('gen_brief')}</button></div><div class="brief-body" id="briefBody">${briefBodyHtml}</div></div>`
    + `<div class="section-title" style="font-size:15px;margin-bottom:10px">${_t('task_flow')}</div><div class="share-flow">${flow || '<div class="plan-hint">'+_t('no_tasks_yet')+'</div>'}</div>`;
  $('#briefGenBtn').onclick = generateBrief;
}

async function generateBrief() {
  const btn = $('#briefGenBtn'), bb = $('#briefBody');
  btn.disabled = true; btn.textContent = _t('generating');
  bb.innerHTML = '<div class="plan-hint">'+_t('generating')+'</div>';
  try {
    const b = await api(`/projects/${currentProjectId}/brief`, { method: 'POST' });
    bb.innerHTML = briefSections(b);
    const meta = $('#briefMeta'); if (meta) meta.textContent = _t('just_generated');
    btn.textContent = _t('regen_brief');
  } catch (e) {
    bb.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`;
    btn.textContent = _t('gen_brief');
  }
  btn.disabled = false;
}

// ─── project workspace tab ───
let pwsVersion = 1;
async function loadProjectWorkspace() {
  const fields = ['#pwsBg', '#pwsCtx', '#pwsFocus'];
  fields.forEach((s) => { $(s).value = ''; $(s).disabled = true; });
  $('#pwsActions').style.display = 'none';
  $('#pwsReadonly').style.display = 'none';
  if (!currentProjectId) return;
  try {
    const ws = await api(`/projects/${currentProjectId}/workspace`);
    pwsVersion = ws.version;
    $('#pwsBg').value = ws.background_md;
    $('#pwsCtx').value = ws.context_md;
    $('#pwsFocus').value = ws.current_focus_md;
    $('#pwsVersion').textContent = `v${ws.version}`;
    // check if user can edit (lead/pm/admin)
    const canEdit = me.is_pm || me.is_admin;
    if (!canEdit) {
      try {
        const members = await api(`/projects/${currentProjectId}/members`);
        const mine = members.find((m) => m.user_id === me.id);
        if (mine && mine.role === 'lead') { fields.forEach((s) => { $(s).disabled = false; }); $('#pwsActions').style.display = 'flex'; return; }
      } catch {}
      $('#pwsReadonly').style.display = 'block';
    } else {
      fields.forEach((s) => { $(s).disabled = false; });
      $('#pwsActions').style.display = 'flex';
    }
  } catch (e) { toast(e.message); }
}
$('#pwsSaveBtn').onclick = async () => {
  const btn = $('#pwsSaveBtn'); btn.disabled = true; btn.textContent = '保存中…';
  try {
    const ws = await api(`/projects/${currentProjectId}/workspace`, {
      method: 'PATCH',
      body: {
        background_md: $('#pwsBg').value,
        context_md: $('#pwsCtx').value,
        current_focus_md: $('#pwsFocus').value,
        version: pwsVersion,
      },
    });
    pwsVersion = ws.version;
    $('#pwsVersion').textContent = `v${ws.version}`;
    toast(_t('ws_saved'));
  } catch (e) { toast(e.message); }
  btn.disabled = false; btn.textContent = '保存';
};

// ─── suggestions (shared renderer) ───
function sugCard(s, onDone) {
  const ref = s.target_ref || {}; const text = ref.project_name || ref.title || (getSugLabel(s.suggestion_type));
  const el = document.createElement('div'); el.className = 'sug';
  const n = (ref.subtasks || []).length;
  el.innerHTML = `<div class="stype">${getSugLabel(s.suggestion_type)} · ${Math.round(s.confidence * 100)}%${n ? ` · ${n} 子任务` : ''}</div><div class="stext">${escapeHtml(text)}</div><div class="sration">${escapeHtml(s.rationale || '')}</div><div class="sact"><button class="btn btn-primary btn-sm">'+_t('accept')+'</button><button class="btn btn-ghost btn-sm">'+_t('reject_sug')+'</button></div>`;
  const [acc, rej] = el.querySelectorAll('button');
  acc.onclick = async () => { try { const r = await api(`/suggestions/${s.id}/accept`, { method: 'POST' }); toast(`已创建 ${r.created_tasks.length} 个任务`); await loadProjects(); await loadSuggestions(); updateNotifBadge(); onDone && onDone(); } catch (e) { toast(e.message); } };
  rej.onclick = async () => { try { await api(`/suggestions/${s.id}/reject`, { method: 'POST', body: { reason: 'rejected' } }); await loadSuggestions(); onDone && onDone(); } catch (e) { toast(e.message); } };
  return el;
}
async function loadSuggestions() {
  try { allSuggestions = (await api('/suggestions?status=pending')).items || []; } catch { allSuggestions = []; }
  const badge = $('#sugBadge'); badge.style.display = allSuggestions.length ? 'inline-grid' : 'none'; badge.textContent = allSuggestions.length;
  if ($('#suggestionsView').style.display === 'block') renderSuggestionsView();
  if ($('#tab-plan').style.display === 'block') renderPlanSuggestions();
}
function renderSuggestionsView() {
  $('#sugMeta').textContent = `${allSuggestions.length} ${_t('pending_count')}`;
  const body = $('#suggestionsBody'); body.innerHTML = '';
  if (!allSuggestions.length) { body.innerHTML = `<div class="empty-hint">${_t('no_suggestions')}</div>`; return; }
  allSuggestions.forEach((s) => body.appendChild(sugCard(s, renderSuggestionsView)));
}
$('#navSuggestions').onclick = () => { showView('suggestionsView'); renderSuggestionsView(); };
$('#navArchived').onclick = async () => { showView('archivedView'); await loadArchivedProjects(); };

function renderPlanSuggestions() {
  const mine = allSuggestions.filter((s) => (s.target_ref || {}).project_id === currentProjectId);
  const body = $('#planSuggestions'); body.innerHTML = '';
  if (!mine.length) { body.innerHTML = `<div class="plan-hint">${_t('no_proj_suggestions')}</div>`; return; }
  mine.forEach((s) => body.appendChild(sugCard(s, () => { renderPlanSuggestions(); loadBoard(); refreshProjMeta(); })));
}

// my claimed (leaf) tasks + their AI implementation hints (附录 I.2)
async function renderPlanImplHints() {
  const body = $('#planImplHints'); if (!body) return;
  let tasks; try { tasks = await api(`/projects/${currentProjectId}/tasks`); } catch { tasks = []; }
  const parents = new Set(tasks.filter((t) => t.parent_task_id).map((t) => t.parent_task_id));
  const mine = tasks.filter((t) => t.owner_user_id === me.id && !parents.has(t.id)); // my leaf tasks
  if (!mine.length) { body.innerHTML = `<div class="plan-hint">${_t('claim_hint')}</div>`; return; }
  body.innerHTML = '';
  mine.forEach((t) => {
    const el = document.createElement('div'); el.className = 'ih-card';
    const hint = t.impl_hint ? `<div class="ih-text">${escapeHtml(t.impl_hint)}</div>` : '<div class="plan-hint">还没有思路，点右侧生成。</div>';
    el.innerHTML = `<div class="ih-head"><span class="ih-title">${escapeHtml(t.title)}</span><button class="btn btn-ghost btn-sm">${t.impl_hint ? '重新生成' : '生成思路'}</button></div>${hint}`;
    el.querySelector('button').onclick = async (e) => {
      const btn = e.target; btn.disabled = true; btn.textContent = '生成中…';
      try {
        const r = await api(`/tasks/${t.id}/impl-hint${t.impl_hint ? '?regenerate=true' : ''}`, { method: 'POST' });
        if (r.impl_hint && !r.skipped) renderPlanImplHints();
        else { btn.disabled = false; btn.textContent = t.impl_hint ? '重新生成' : '生成思路'; toast(r.skipped === 'not_leaf' ? '父任务不生成思路' : '已跳过'); }
      } catch (err) { btn.disabled = false; btn.textContent = '生成思路'; toast(err.message); }
    };
    body.appendChild(el);
  });
}

// ─── notifications inbox (附录 I.3, separate from AI suggestions) ───
async function updateNotifBadge() {
  try {
    const c = await api('/me/notifications/unread-count');
    const b = $('#notifBadge'); b.style.display = c.unread ? 'inline-grid' : 'none'; b.textContent = c.unread;
  } catch {}
}
let notifSSE = null;
function connectNotifSSE() {
  if (notifSSE) { notifSSE.close(); notifSSE = null; }
  // delay SSE to avoid blocking initial page load API calls
  setTimeout(() => {
    if (!me) return;
    notifSSE = new EventSource(API + '/me/notifications/stream');
    notifSSE.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === 'notification') {
          updateNotifBadge();
          toast(d.title || _t('notifications'));
        }
      } catch {}
    };
    notifSSE.onerror = () => {
      if (notifSSE) { notifSSE.close(); notifSSE = null; }
      if (me) setTimeout(connectNotifSSE, 60000);
    };
  }, 3000);
}
window.addEventListener('beforeunload', () => {
  if (notifSSE) { notifSSE.close(); notifSSE = null; }
  if (chatSocket) chatSocket.close();
});
async function loadNotifications() {
  showView('notificationsView');
  const body = $('#notificationsBody'); body.innerHTML = `<div class="plan-hint">${_t('loading')}</div>`;
  let items; try { items = (await api('/me/notifications')).items || []; } catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  $('#notifMeta').textContent = `${items.length}`;
  if (!items.length) { body.innerHTML = `<div class="empty-hint">${_t('no_notifs')}</div>`; return; }
  body.innerHTML = '';
  items.forEach((n) => {
    const el = document.createElement('div'); el.className = 'notif' + (n.read_at ? ' read' : '');
    const hasBody = n.body && n.body.trim();
    el.innerHTML = `<div class="ntext">${escapeHtml(n.title)}</div>${hasBody ? `<div class="nbody" style="display:none">${escapeHtml(n.body)}</div>` : ''}<div class="nmeta">${escapeHtml(fmtBriefTime(n.created_at))}${n.read_at ? ' · '+_t('read') : ''}${n.kind === 'teammate_message' ? ' · teammate' : ''}</div>`;
    el.style.cursor = 'pointer';
    el.onclick = async () => {
      const bd = el.querySelector('.nbody');
      if (bd) bd.style.display = bd.style.display === 'none' ? 'block' : 'none';
      if (!n.read_at) {
        try { await api(`/me/notifications/${n.id}/read`, { method: 'POST' }); el.classList.add('read'); n.read_at = true; el.querySelector('.nmeta').textContent += ' · '+_t('read'); updateNotifBadge(); } catch {}
      }
    };
    body.appendChild(el);
  });
}
$('#navNotifications').onclick = loadNotifications;

// ─── personal access tokens ───
function renderTokenScopePicker() {
  const box = $('#tokenScopes');
  if (!box) return;
  box.innerHTML = SCOPE_KEYS.map((scope) => (
    `<label class="scope-option"><input type="checkbox" value="${scope}" ${DEFAULT_TOKEN_SCOPES.includes(scope) ? 'checked' : ''}><span>${escapeHtml(getScopeLabel(scope))}</span><code>${scope}</code></label>`
  )).join('');
  const full = $('#tokenFullScope');
  const checks = Array.from(box.querySelectorAll('input[type="checkbox"]'));
  full.onchange = () => {
    checks.forEach((chk) => { chk.disabled = full.checked; });
  };
  checks.forEach((chk) => {
    chk.onchange = () => {
      if (chk.checked) {
        full.checked = false;
        checks.forEach((c) => { c.disabled = false; });
      }
    };
  });
  // no ready flag — allow re-render on language change
}
function selectedTokenScopes() {
  if ($('#tokenFullScope').checked) return ['*'];
  return Array.from(document.querySelectorAll('#tokenScopes input[type="checkbox"]:checked')).map((el) => el.value);
}
function scopeTags(scopes) {
  return (scopes || []).map((s) => `<span class="scope-tag ${s === '*' ? 'full' : ''}">${escapeHtml(s)}</span>`).join('');
}
async function loadTokens() {
  showView('tokenView');
  renderTokenScopePicker();
  const body = $('#tokensBody'); body.innerHTML = `<div class="plan-hint">${_t('loading')}</div>`;
  let items;
  try { items = await api('/me/tokens'); }
  catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  if (!items.length) { body.innerHTML = `<div class="empty-hint">${_t('no_data')}</div>`; return; }
  body.innerHTML = '';
  items.forEach((t) => {
    const row = document.createElement('div'); row.className = 'token-row';
    const agent = t.agent_name ? `<span class="ws-meta">${escapeHtml(t.agent_name)}</span>` : '';
    row.innerHTML = `<div class="token-main"><b>${escapeHtml(t.name)}</b>${agent}<div class="token-scopes">${scopeTags(t.scopes)}</div><span class="ws-meta">${t.last_used_at ? `${_t('last_used')} ${escapeHtml(fmtBriefTime(t.last_used_at))}` : _t('never_used')}</span></div><button class="btn btn-ghost btn-sm">${_t('revoke')}</button>`;
    row.querySelector('button').onclick = async () => {
      if (!confirm(_t('revoke_confirm')(t.name))) return;
      try { await api(`/me/tokens/${t.id}`, { method: 'DELETE' }); await loadTokens(); toast(_t('token_revoked')); }
      catch (e) { toast(e.message); }
    };
    body.appendChild(row);
  });
}
$('#navTokens').onclick = loadTokens;
$('#tokenCreateBtn').onclick = async () => {
  const name = $('#tokenName').value.trim();
  if (!name) { $('#tokenName').focus(); return; }
  const scopes = selectedTokenScopes();
  if (!scopes.length) { toast(_t('keep_one')); return; }
  if (scopes.includes('*') && !confirm(_t('confirm_full_scope'))) return;
  const body = {
    name,
    scopes,
    agent_name: $('#tokenAgent').value.trim() || null,
    description: $('#tokenDesc').value.trim() || null,
  };
  try {
    const t = await api('/me/tokens', { method: 'POST', body });
    const overlay = $('#tokenRevealOverlay');
    $('#tokenRevealValue').textContent = t.token;
    $('#tokenRevealName').textContent = t.name;
    overlay.classList.add('show');
    $('#tokenRevealCopy').onclick = async () => {
      try { await navigator.clipboard.writeText(t.token); toast(_t('copy_token')); } catch { toast(_t('error_prefix')); }
    };
    $('#tokenRevealClose').onclick = () => { overlay.classList.remove('show'); };
    $('#tokenName').value = ''; $('#tokenAgent').value = ''; $('#tokenDesc').value = '';
    $('#tokenCreateResult').innerHTML = '';
    await loadTokens();
  } catch (e) { toast(e.message); }
};

// ─── cost view ───
$('#navCost').onclick = async () => {
  showView('costView');
  const body = $('#costBody'); body.innerHTML = '<div class="plan-hint">'+_t('loading')+'</div>';
  try {
    const d = await api('/pm/llm-usage');
    const rows = d.by_trigger.map((t) => `<div class="cost-row"><span class="ctrigger">${t.trigger}</span><span class="cnums">${t.calls} 次 · ${t.tokens_in + t.tokens_out} tokens</span><span class="ccost">$${t.cost_usd.toFixed(4)}</span></div>`).join('');
    const umRows = (d.by_user_model || []).map((u) => `<div class="cost-row"><span class="ctrigger">${escapeHtml(u.user_name)}</span><span class="cnums" style="flex:1">${escapeHtml(u.model)} · ${u.calls} 次 · ${u.tokens_in + u.tokens_out} tokens</span><span class="ccost">$${u.cost_usd.toFixed(4)}</span></div>`).join('');
    body.innerHTML = `<div class="cost-total"><div class="big">$${d.total_cost_usd.toFixed(4)}</div><div class="sub">${d.total_calls} ${_t('calls')} · ${d.total_tokens_in + d.total_tokens_out} tokens · ${d.since.slice(0, 10)}</div></div>`
      + `<div class="section-title" style="font-size:14px;margin:16px 0 8px">${_t('by_trigger')}</div><div class="cost-breakdown">${rows || '<div class="plan-hint">'+_t('no_calls_today')+'</div>'}</div>`
      + `<div class="section-title" style="font-size:14px;margin:16px 0 8px">${_t('by_user_model')}</div><div class="cost-breakdown">${umRows || '<div class="plan-hint">'+_t('no_data')+'</div>'}</div>`;
  } catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; }
};

// ─── admin: team management (附录 L, admin-only) ───
$('#navAdmin').onclick = loadAdmin;
async function loadAdmin() {
  showView('adminView');
  const body = $('#adminBody'); body.innerHTML = `<div class="plan-hint">${_t('loading')}</div>`;
  let items;
  try { items = (await api('/admin/users')).items || []; }
  catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  body.innerHTML = '';
  items.forEach((u) => {
    const row = document.createElement('div'); row.className = 'admin-row';
    const self = u.id === me.id;
    row.innerHTML = `<span class="avatar">${initials(u.display_name)}</span>`
      + `<span class="ar-name"><b>${escapeHtml(u.display_name)}${self ? ` <span class="ws-meta">${_t('you')}</span>` : ''}</b><span class="ws-meta">${escapeHtml(u.email)}</span></span>`
      + `<label class="ar-role"><input type="checkbox" data-role="is_admin" ${u.is_admin ? 'checked' : ''}> admin</label>`
      + `<label class="ar-role"><input type="checkbox" data-role="is_pm" ${u.is_pm ? 'checked' : ''}> pm</label>`;
    row.querySelectorAll('input').forEach((chk) => {
      chk.onchange = async () => {
        const role = chk.dataset.role;
        try {
          const updated = await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { [role]: chk.checked } });
          u.is_admin = updated.is_admin; u.is_pm = updated.is_pm;
          if (self) { me = { ...me, is_admin: updated.is_admin, is_pm: updated.is_pm }; $('#navAdmin').style.display = me.is_admin ? 'flex' : 'none'; $('#navCost').style.display = me.is_pm ? 'flex' : 'none'; }
        } catch (e) { toast(e.message); chk.checked = !chk.checked; }
      };
    });
    body.appendChild(row);
  });
}

// ─── project members (附录 K) ───
$('#pvMembersBtn').onclick = () => { if (currentProjectId) openMembers(currentProjectId); };
$('#membersClose').onclick = () => $('#membersOverlay').classList.remove('show');
async function openMembers(pid) {
  $('#membersOverlay').classList.add('show');
  const body = $('#membersBody'); const addRow = $('#membersAddRow');
  body.innerHTML = '<div class="plan-hint">'+_t('loading')+'</div>'; addRow.innerHTML = '';
  let members;
  try { members = await api(`/projects/${pid}/members`); }
  catch (e) { body.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  const myRole = (members.find((m) => m.user_id === me.id) || {}).role;
  const canManage = myRole === 'lead' || me.is_pm || me.is_admin;
  $('#membersTitle').textContent = `${_t('members')} · ${members.length}`;
  $('#membersHint').textContent = canManage ? _t('members_hint_lead') : _t('members_hint_member');
  body.innerHTML = '';
  const memberIds = new Set(members.map((m) => m.user_id));
  members.forEach((m) => {
    const isLead = m.role === 'lead';
    const row = document.createElement('div'); row.className = 'members-row';
    row.innerHTML = `<span class="avatar">${initials(m.name)}</span>`
      + `<span class="mr-name"><b>${escapeHtml(m.name)}${m.user_id === me.id ? ` <span class="ws-meta">${_t('you')}</span>` : ''}</b></span>`
      + `<span class="mr-role ${isLead ? '' : 'member'}">${isLead ? 'lead' : 'member'}</span>`;
    if (canManage) {
      const toggle = document.createElement('button'); toggle.className = 'btn btn-ghost btn-sm';
      toggle.textContent = isLead ? _t('set_member') : _t('set_lead');
      toggle.onclick = async () => {
        try { await api(`/projects/${pid}/members/${m.user_id}`, { method: 'PATCH', body: { role: isLead ? 'member' : 'lead' } }); openMembers(pid); }
        catch (e) { toast(e.message); }
      };
      const rm = document.createElement('button'); rm.className = 'btn btn-ghost btn-sm'; rm.textContent = _t('remove');
      rm.onclick = async () => {
        try { await api(`/projects/${pid}/members/${m.user_id}`, { method: 'DELETE' }); openMembers(pid); }
        catch (e) { toast(e.message); }
      };
      row.appendChild(toggle); row.appendChild(rm);
    }
    body.appendChild(row);
  });
  if (canManage) {
    const candidates = Object.entries(userMap).filter(([id]) => !memberIds.has(id));
    if (candidates.length) {
      const wrap = document.createElement('div'); wrap.className = 'members-add';
      const sel = document.createElement('select');
      sel.innerHTML = `<option value="">${_t('add_member')}</option>`
        + candidates.map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join('');
      const btn = document.createElement('button'); btn.className = 'btn btn-primary btn-sm'; btn.textContent = _t('add_btn');
      btn.onclick = async () => {
        if (!sel.value) return;
        try { await api(`/projects/${pid}/members`, { method: 'POST', body: { user_id: sel.value } }); openMembers(pid); }
        catch (e) { toast(e.message); }
      };
      wrap.appendChild(sel); wrap.appendChild(btn);
      addRow.appendChild(wrap);
    } else {
      addRow.innerHTML = `<span class="ws-meta">${_t('no_more_members')}</span>`;
    }
  }
}

// ─── unified overlay dismissal: click backdrop or Esc closes any open overlay (附录 K §9) ───
document.querySelectorAll('.overlay').forEach((ov) => {
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('show'); });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.overlay.show').forEach((ov) => ov.classList.remove('show'));
});

// ─── new project ───
$('#newProjectBtn').onclick = () => { $('#npGoal').value = ''; $('#npName').value = ''; $('#projectOverlay').classList.add('show'); };
$('#npClose').onclick = $('#npCancel').onclick = () => $('#projectOverlay').classList.remove('show');
$('#npDecomposeBtn').onclick = async () => {
  const goal = $('#npGoal').value.trim(); if (!goal) { $('#npGoal').focus(); return; }
  const btn = $('#npDecomposeBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>拆解中…';
  try { const r = await api('/decompose', { method: 'POST', body: { goal } }); $('#projectOverlay').classList.remove('show'); openPlan(r, { eyebrow: '新项目 · 待确认', projectName: r.plan.title }); }
  catch (e) { toast(e.message); } finally { btn.disabled = false; btn.textContent = 'AI 拆解 →'; }
};
$('#npManualBtn').onclick = async () => {
  const name = $('#npName').value.trim(); if (!name) { $('#npName').focus(); return; }
  try { const p = await api('/projects', { method: 'POST', body: { name } }); $('#projectOverlay').classList.remove('show'); await loadProjects(p.id); toast(_t('project_created')); }
  catch (e) { toast(e.message); }
};
$('#planDecomposeBtn').onclick = async () => {
  const goal = $('#planGoal').value.trim(); if (!goal || !currentProjectId) { $('#planGoal').focus(); return; }
  const btn = $('#planDecomposeBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try { const r = await api('/decompose', { method: 'POST', body: { goal, project_id: currentProjectId } }); $('#planGoal').value = ''; openPlan(r, { eyebrow: '补充拆解 · 待确认', projectName: null }); }
  catch (e) { toast(e.message); } finally { btn.disabled = false; btn.textContent = '拆解'; }
};

// ─── plan confirm modal ───
let currentSug = null, pendingProjectName = null;
function openPlan(resp, { eyebrow, projectName }) {
  currentSug = resp.suggestion_id; pendingProjectName = projectName || null;
  const plan = resp.plan || {};
  $('#planEyebrow').textContent = eyebrow || '拆解建议 · 待确认';
  $('#planTitle').textContent = plan.title || '拆解结果';
  $('#planRationale').textContent = plan.description || resp.message || '';
  $('#planConf').textContent = (plan.subtasks || []).length + ' 个子任务';
  const body = $('#planBody'); body.innerHTML = '';
  (plan.subtasks || []).forEach((st, i) => {
    const meta = [st.estimated_hours ? `${st.estimated_hours}h` : null, st.suggested_owner_hint ? `<span class="hint">建议：${escapeHtml(st.suggested_owner_hint)}</span>` : null].filter(Boolean).join(' · ');
    const r = document.createElement('div'); r.className = 'subtask'; r.style.animationDelay = (i * 0.05) + 's';
    r.innerHTML = `<div class="idx">${i + 1}</div><div class="st-body"><div class="st-title">${escapeHtml(st.title)}</div>${st.description ? `<div class="st-meta" style="margin-bottom:3px">${escapeHtml(st.description)}</div>` : ''}<div class="st-meta">${meta}</div></div>`;
    body.appendChild(r);
  });
  $('#planOverlay').classList.add('show');
}
$('#planReject').onclick = async () => { $('#planOverlay').classList.remove('show'); if (currentSug) { try { await api(`/suggestions/${currentSug}/reject`, { method: 'POST', body: { reason: 'dismissed' } }); } catch {} } loadSuggestions(); };
$('#planAccept').onclick = async () => {
  if (!currentSug) return;
  try {
    const r = await api(`/suggestions/${currentSug}/accept`, { method: 'POST' });
    toast(`已创建 ${r.created_tasks.length} 个任务`); $('#planOverlay').classList.remove('show');
    const selName = pendingProjectName;
    await loadProjects(); await loadSuggestions();
    if (selName) { const np = projects.find((p) => p.name === selName); if (np) selectProject(np.id); }
    else if (currentProjectId) selectProject(currentProjectId);
  } catch (e) { toast(e.message); }
};

// ─── chat ───
function addMsg(role, text) { const m = document.createElement('div'); m.className = 'msg ' + role; m.textContent = text; $('#msgs').appendChild(m); $('#msgs').scrollTop = $('#msgs').scrollHeight; return m; }
let allSessions = [];
const WELCOME = () => _t('welcome')(me.display_name);

function renderSessionSelect() {
  const sel = $('#sessionSelect');
  sel.innerHTML = allSessions.map((s) => {
    const dt = new Date(s.created_at);
    const ts = `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    const label = (s.title || '新对话') + ' · ' + ts;
    return `<option value="${s.id}"${s.id === chatSession.id ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

async function switchSession(sessionId) {
  if (chatSocket) chatSocket.close();
  const s = allSessions.find((x) => x.id === sessionId);
  if (!s) return;
  chatSession = s;
  const msgs = (await api(`/chat/sessions/${sessionId}/messages`)).items || [];
  $('#msgs').innerHTML = '';
  if (!msgs.length) addMsg('assistant', WELCOME());
  msgs.forEach((m) => addMsg(m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : 'system'), m.content));
  connectWS();
}

$('#sessionSelect').onchange = (e) => switchSession(e.target.value);
$('#sessionDelBtn').onclick = async () => {
  if (!chatSession || allSessions.length <= 1) { toast(_t('keep_one')); return; }
  if (!confirm(_t('del_confirm'))) return;
  try {
    await api(`/chat/sessions/${chatSession.id}`, { method: 'DELETE' });
    allSessions = allSessions.filter((s) => s.id !== chatSession.id);
    if (allSessions.length) { await switchSession(allSessions[0].id); }
    else { await startNewChat(); }
    renderSessionSelect();
  } catch (e) { toast(e.message); }
};

async function startNewChat() {
  if (chatSocket) chatSocket.close();
  try {
    const body = { title: '工作助手' };
    if (currentProjectId) {
      const p = projects.find((x) => x.id === currentProjectId);
      body.title = p ? p.name : '工作助手';
      body.project_id = currentProjectId;
    }
    chatSession = await api('/chat/sessions', { method: 'POST', body });
    allSessions.unshift(chatSession);
    renderSessionSelect();
    $('#msgs').innerHTML = '';
    addMsg('assistant', WELCOME());
    connectWS();
  } catch (e) { toast(e.message); }
}
$('#newChatBtn').onclick = startNewChat;

async function initChat() {
  try {
    allSessions = (await api('/chat/sessions')).items || [];
    if (!allSessions.length) {
      chatSession = await api('/chat/sessions', { method: 'POST', body: { title: '工作助手' } });
      allSessions = [chatSession];
    } else {
      chatSession = allSessions[0];
    }
    renderSessionSelect();
    const msgs = (await api(`/chat/sessions/${chatSession.id}/messages`)).items || [];
    requestAnimationFrame(() => {
      $('#msgs').innerHTML = '';
      if (!msgs.length) addMsg('assistant', WELCOME());
      msgs.forEach((m) => addMsg(m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : 'system'), m.content));
    });
    connectWS();
  } catch (e) { addMsg('system', '助手暂不可用：' + e.message); }
}
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  chatSocket = new WebSocket(`${proto}://${location.host}/ws/chat/${chatSession.id}`);
  chatSocket.onmessage = (ev) => {
    const d = JSON.parse(ev.data);
    if (d.type === 'assistant_done') {
      removeTyping(); addMsg('assistant', d.content || ''); loadProjects(); loadSuggestions();
      if (currentProjectId) { loadBoard(); refreshProjMeta(); }
      // refresh session title (may have been auto-set from first message)
      api('/chat/sessions').then((r) => { allSessions = r.items || []; renderSessionSelect(); }).catch(() => {});
    }
    else if (d.type === 'error') { removeTyping(); addMsg('system', '出错：' + (d.message || '')); }
    else if (d.type === 'aborted') removeTyping();
  };
  chatSocket.onclose = () => $('#aStatus').textContent = _t('offline');
  chatSocket.onopen = () => $('#aStatus').textContent = _t('online');
}
let typingEl = null;
function showTyping() { typingEl = document.createElement('div'); typingEl.className = 'msg assistant'; typingEl.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; $('#msgs').appendChild(typingEl); $('#msgs').scrollTop = $('#msgs').scrollHeight; }
function removeTyping() { if (typingEl) { typingEl.remove(); typingEl = null; } }
const SLASH_COMMANDS = {
  '/new': () => { startNewChat(); return true; },
  '/clear': () => { $('#msgs').innerHTML = ''; addMsg('system', '已清屏（对话历史保留）'); return true; },
  '/help': () => { addMsg('system', '可用指令：/new 新对话 · /clear 清屏 · /help 帮助'); return true; },
};
function sendChat() {
  const inp = $('#chatInput'); const text = inp.value.trim(); if (!text) return;
  const cmd = SLASH_COMMANDS[text.toLowerCase().split(/\s/)[0]];
  if (cmd) { inp.value = ''; cmd(); return; }
  if (!chatSocket || chatSocket.readyState !== 1) return;
  addMsg('user', text); inp.value = ''; showTyping();
  chatSocket.send(JSON.stringify({ type: 'user_message', content: text, project_id: currentProjectId }));
}
$('#chatSend').onclick = sendChat;
$('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// ─── assistant settings: persona / memory / profile (附录 J) ───
$('#asstSettingsBtn').onclick = async () => {
  try {
    const w = await api('/me/assistant');
    $('#awPersona').value = w.persona_md || '';
    $('#awMemory').value = w.memory_md || '';
    $('#awProfile').value = w.profile_md || '';
    resetSkillForm(); renderSkills();
    $('#asstSettingsOverlay').classList.add('show');
  } catch (e) { toast(e.message); }
};
$('#awCancel').onclick = () => $('#asstSettingsOverlay').classList.remove('show');
$('#awSave').onclick = async () => {
  try {
    await api('/me/assistant', { method: 'PATCH', body: { persona_md: $('#awPersona').value, memory_md: $('#awMemory').value, profile_md: $('#awProfile').value } });
    $('#asstSettingsOverlay').classList.remove('show'); toast(_t('settings_saved'));
  } catch (e) { toast(e.message); }
};

// assistant skills (附录 J.5)
let awEditingSkill = null;
function resetSkillForm() { awEditingSkill = null; $('#awSkillName').value = ''; $('#awSkillDesc').value = ''; $('#awSkillInstr').value = ''; $('#awSkillSave').textContent = '添加技能'; }
async function renderSkills() {
  const box = $('#awSkills'); box.innerHTML = '<div class="plan-hint">'+_t('loading')+'</div>';
  let items; try { items = (await api('/me/assistant/skills')).items || []; } catch (e) { box.innerHTML = `<div class="plan-hint">${escapeHtml(e.message)}</div>`; return; }
  if (!items.length) { box.innerHTML = '<div class="plan-hint">还没有技能,下面添加。</div>'; return; }
  box.innerHTML = '';
  items.forEach((s) => {
    const row = document.createElement('div'); row.className = 'aw-skill-row';
    row.innerHTML = `<label class="aw-sk-on"><input type="checkbox" ${s.enabled ? 'checked' : ''}><b>${escapeHtml(s.name)}</b></label><span class="ws-meta aw-sk-desc">${escapeHtml(s.description || '')}</span><button class="btn btn-ghost btn-sm">编辑</button><button class="btn btn-ghost btn-sm">删除</button>`;
    const chk = row.querySelector('input');
    const [editBtn, delBtn] = row.querySelectorAll('button');
    chk.onchange = async () => { try { await api(`/me/assistant/skills/${s.id}`, { method: 'PATCH', body: { enabled: chk.checked } }); } catch (e) { toast(e.message); chk.checked = !chk.checked; } };
    editBtn.onclick = () => { awEditingSkill = s.id; $('#awSkillName').value = s.name; $('#awSkillDesc').value = s.description || ''; $('#awSkillInstr').value = s.instruction_md || ''; $('#awSkillSave').textContent = '保存修改'; $('#awSkillName').focus(); };
    delBtn.onclick = async () => { try { await api(`/me/assistant/skills/${s.id}`, { method: 'DELETE' }); if (awEditingSkill === s.id) resetSkillForm(); renderSkills(); } catch (e) { toast(e.message); } };
    box.appendChild(row);
  });
}
$('#awSkillSave').onclick = async () => {
  const name = $('#awSkillName').value.trim(); if (!name) { $('#awSkillName').focus(); return; }
  const body = { name, description: $('#awSkillDesc').value.trim(), instruction_md: $('#awSkillInstr').value };
  try {
    if (awEditingSkill) await api(`/me/assistant/skills/${awEditingSkill}`, { method: 'PATCH', body });
    else await api('/me/assistant/skills', { method: 'POST', body });
    resetSkillForm(); renderSkills();
  } catch (e) { toast(e.message); }
};

// ─── responsive + textareas ───
document.addEventListener('click', () => document.querySelectorAll('.proj-menu.open').forEach((m) => m.classList.remove('open')));
$('#navToggle').onclick = () => $('#sidebar').classList.toggle('open');
$('#asstToggle').onclick = () => {
  const app = $('#app');
  if (app.classList.contains('asst-collapsed')) { app.classList.remove('asst-collapsed'); }
  else { $('#assistant').classList.toggle('open'); }
};
$('#collapseAsst').onclick = () => {
  const app = $('#app');
  if (window.innerWidth > 1100) { app.classList.add('asst-collapsed'); }
  else { $('#assistant').classList.remove('open'); }
};
['#planGoal', '#npGoal'].forEach((sel) => { const e = $(sel); if (e) e.addEventListener('input', () => { e.style.height = 'auto'; e.style.height = e.scrollHeight + 'px'; }); });

applyLang();
boot();
