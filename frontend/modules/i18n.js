'use strict';

import { $ } from './core.js';

export const I18N = {
  'zh-CN': {
    login_title: 'Team Platform', login_sub: '使用企业账号安全登录', sso_btn: '企业账号登录（SSO）', sso_hint: '通过 JarvisBIM 身份验证登录',
    projects: '项目', new_project: '＋ 新建项目', suggestions: '待处理建议', archived: '已归档', notifications: '通知',
    tokens: '访问令牌', admin: '团队管理', cost: 'LLM 成本',
    board: '看板', share: '进度分享', members: '成员', ai_plan: 'AI 方案', proj_info: '项目信息', pages_tab: '文档', cycles_tab: '周期', pages_empty: '选择左侧页面或新建一个', help: '帮助',
    tasks_unit: '个任务', completion: '完成', archive_proj: '归档项目', delete_proj: '删除项目',
    s_todo: '待办', s_in_progress: '进行中', s_blocked: '阻塞', s_review: '评审', s_done: '完成',
    unclaimed: '未认领', claim: '认领', start: '开始', submit_review: '提交评审', complete: '完成',
    unblock: '解除阻塞', reject: '退回', archive_task: '归档', restore: '恢复',
    subtasks: '子任务', archived_tasks: '已归档',
    description: '描述', none: '（无）', owner: '负责人', priority_time: '优先级 · 估时', ai_hint: 'AI 实现思路', close: '关闭',
    completion_rate: '完成度', task_flow: '任务流程', ai_brief: 'AI 进展简报', gen_brief: '生成简报', regen_brief: '重新生成',
    generating: '生成中…', just_generated: '刚刚生成', last_generated: '上次生成于',
    no_tasks_yet: '还没有任务。', gen_brief_hint: '点「生成简报」让 AI 汇总任务进展与成员投送的工作痕迹。',
    pending_count: '条待处理', no_suggestions: '没有待处理的建议。', accept: '接受', reject_sug: '拒绝',
    task_decompose: '任务拆解', create_task: '创建任务', assign_sug: '分配建议',
    created_tasks: (n) => `已创建 ${n} 个任务`,
    add_tasks: '向本项目补充任务', decompose: '拆解', decomposing: '拆解中…',
    decompose_title: '拆解建议 · 待确认', confirm_accept: '接受并创建', dismiss: '忽略',
    my_tasks_hints: '我的任务 · AI 实现思路', proj_suggestions: '本项目的 AI 建议',
    no_proj_suggestions: '本项目暂无待处理 AI 建议。补充拆解后会出现在这里。',
    claim_hint: '认领任务后，AI 会在这里给出实现思路。', gen_hint: '生成思路', regen_hint: '重新生成',
    new_proj_eyebrow: '新建项目', new_proj_goal_sub: '用一个目标，让 AI 拆成项目',
    new_proj_goal_hint: '描述你要做的事，AI 提议项目名 + 子任务；你确认后创建。',
    goal_placeholder: '例如：做一个客户工单自动分类的功能…', manual_name_placeholder: '手建空项目：直接填项目名',
    or_text: '或', cancel: '取消', create_empty: '建空项目', ai_decompose: 'AI 拆解 →',
    project_created: '项目已创建',
    members_title: '项目成员', members_hint_lead: 'lead 可加/移成员、改角色；成员只能查看。',
    members_hint_member: '你是项目成员，可查看名单。', set_member: '设为成员', set_lead: '设为 lead', remove: '移除',
    add_member: '添加成员…', add_btn: '添加', no_more_members: '没有可添加的成员了', you: '（你）',
    assistant: '个人助手', online: '在线', offline: '离线', settings: '助手设置',
    chat_placeholder: '问我，或让我记录工作…', new_chat: '新对话',
    del_session: '删除此对话', del_confirm: '删除当前对话？', keep_one: '至少保留一个对话',
    settings_eyebrow: '助手设置', settings_title: '人格 · 记忆 · 画像',
    settings_hint: '人格决定助手风格；记忆/画像由助手在对话中自动积累，你也可手动编辑。仅你可见。',
    persona: '人格（SOUL）', memory: '记忆（MEMORY）', profile: '关于我（USER 画像）',
    skills: '技能（指令包）· 启用的会注入助手', add_skill: '添加技能', save_edit: '保存修改',
    settings_saved: '助手设置已保存', edit: '编辑', delete_btn: '删除', no_skills: '还没有技能，下面添加。',
    ws_bg: '项目背景', ws_ctx: '上下文', ws_focus: '当前重点', ws_save: '保存', ws_saving: '保存中…',
    ws_readonly: '只读 — 项目 lead 或 PM 可编辑', ws_saved: '工作区已保存',
    token_name: '名称', token_agent: 'Agent', token_note: '备注', token_scopes: '权限范围',
    full_scope: '全权限 (*)', full_scope_hint: '可读写你的全部数据，只给可信客户端。',
    create_token: '创建令牌', token_created: '令牌已创建',
    token_reveal_hint: '请立即复制。关闭此窗口后令牌不再显示，只能删除重建。',
    copy_token: '复制令牌', saved_close: '我已保存，关闭', revoke: '撤销',
    revoke_confirm: (name) => `撤销令牌「${name}」？`, token_revoked: '令牌已撤销',
    never_used: '尚未使用', last_used: '最近使用',
    confirm_full_scope: '创建全权限令牌？它可读写你的全部数据。',
    cost_title: 'LLM 成本', cost_today: '今日(UTC) · 团队', calls: '次调用',
    integrations: '集成', integrations_sub: '连接外部服务', integ_url: 'GitLab URL', integ_pat: 'Personal Access Token',
    integ_connect: '连接', integ_sync: '立即同步', integ_connected: '已连接', integ_syncing: '同步中…',
    integ_synced: (n) => `同步完成，新增 ${n} 条记录`, integ_last_sync: '上次同步', integ_no_integ: '未连接',
    integ_dingtalk: '钉钉', integ_wecom_mail: '企业微信邮箱',
    integ_wecom_hint: '需管理员在企业微信后台开启 IMAP 权限。若开启了安全登录，请使用客户端授权码（邮箱设置 → 邮箱绑定）。',
    by_trigger: '按触发类型', by_user_model: '按用户 · 模型', no_calls_today: '今日还没有 LLM 调用。',
    admin_title: '团队管理', set_roles: '设置成员角色(admin / pm)',
    notif_title: '通知', read: '已读', no_notifs: '还没有通知。',
    empty_title: '选一个项目开始', empty_desc: '从左侧选项目，或点「＋ 新建项目」让 AI 把一个目标拆成分好工的子任务。',
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
    board: '看板', share: '進度分享', members: '成員', ai_plan: 'AI 方案', proj_info: '項目資訊', pages_tab: '文檔', cycles_tab: '週期', pages_empty: '選擇左側頁面或新建一個', help: '幫助',
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
    settings_saved: '助手設定已儲存', edit: '編輯', delete_btn: '刪除', no_skills: '還沒有技能，下面添加。',
    ws_bg: '項目背景', ws_ctx: '上下文', ws_focus: '當前重點', ws_save: '儲存', ws_saving: '儲存中…',
    ws_readonly: '唯讀 — 項目 lead 或 PM 可編輯', ws_saved: '工作區已儲存',
    cost_title: 'LLM 成本', cost_today: '今日(UTC) · 團隊', calls: '次調用',
    integrations: '集成', integrations_sub: '連接外部服務', integ_url: 'GitLab URL', integ_pat: 'Personal Access Token',
    integ_connect: '連接', integ_sync: '立即同步', integ_connected: '已連接', integ_syncing: '同步中…',
    integ_synced: (n) => `同步完成，新增 ${n} 條記錄`, integ_last_sync: '上次同步', integ_no_integ: '未連接',
    integ_dingtalk: '釘釘', integ_wecom_mail: '企業微信郵箱',
    integ_wecom_hint: '需管理員在企業微信後台開啟 IMAP 權限。若開啟了安全登錄，請使用客戶端授權碼（郵箱設置 → 郵箱綁定）。',
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
    board: 'Board', share: 'Progress', members: 'Members', ai_plan: 'AI Plan', proj_info: 'Project Info', pages_tab: 'Docs', cycles_tab: 'Cycles', pages_empty: 'Select a page or create one', help: 'Help',
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
    settings_saved: 'Assistant settings saved', edit: 'Edit', delete_btn: 'Delete', no_skills: 'No skills yet. Add one below.',
    ws_bg: 'Background', ws_ctx: 'Context', ws_focus: 'Current Focus', ws_save: 'Save', ws_saving: 'Saving…',
    ws_readonly: 'Read-only — project lead or PM can edit', ws_saved: 'Workspace saved',
    cost_title: 'LLM Cost', cost_today: 'Today (UTC) · Team', calls: 'calls',
    integrations: 'Integrations', integrations_sub: 'Connect external services', integ_url: 'GitLab URL', integ_pat: 'Personal Access Token',
    integ_connect: 'Connect', integ_sync: 'Sync Now', integ_connected: 'Connected', integ_syncing: 'Syncing…',
    integ_synced: (n) => `Sync complete, ${n} new events`, integ_last_sync: 'Last synced', integ_no_integ: 'Not connected',
    integ_dingtalk: 'DingTalk', integ_wecom_mail: 'WeCom Mail',
    integ_wecom_hint: 'Admin must enable IMAP in WeCom backend. If secure login is on, use the client authorization code (Mail Settings → Email Binding).',
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

export let currentLang = localStorage.getItem('lang') || 'zh-CN';

export function _t(key) { return (I18N[currentLang] || I18N['zh-CN'])[key] || key; }

export const SCOPE_I18N = {
  'zh-CN': { 'contributions:write': '投送工作', 'contributions:read': '查看投送', 'projects:read': '查看项目', 'projects:write': '管理项目', 'tasks:read': '查看任务', 'tasks:write': '管理任务', 'suggestions:read': '查看建议', 'suggestions:write': '处理建议', 'notifications:read': '查看通知', 'notifications:write': '标记通知', 'assistant:read': '读取助手', 'assistant:write': '修改助手', 'chat:read': '读取聊天', 'chat:write': '发送聊天', 'users:read': '查看成员', 'profile:read': '读取资料', 'integrations:read': '查看集成', 'integrations:write': '管理集成', decompose: 'AI 拆解', brief: '生成简报', pm: 'PM 观测', admin: '管理后台', 'tokens:manage': '管理令牌' },
  'zh-HK': { 'contributions:write': '投送工作', 'contributions:read': '查看投送', 'projects:read': '查看項目', 'projects:write': '管理項目', 'tasks:read': '查看任務', 'tasks:write': '管理任務', 'suggestions:read': '查看建議', 'suggestions:write': '處理建議', 'notifications:read': '查看通知', 'notifications:write': '標記通知', 'assistant:read': '讀取助手', 'assistant:write': '修改助手', 'chat:read': '讀取聊天', 'chat:write': '發送聊天', 'users:read': '查看成員', 'profile:read': '讀取資料', 'integrations:read': '查看集成', 'integrations:write': '管理集成', decompose: 'AI 拆解', brief: '生成簡報', pm: 'PM 觀測', admin: '管理後台', 'tokens:manage': '管理令牌' },
  en: { 'contributions:write': 'Push Work', 'contributions:read': 'View Work', 'projects:read': 'View Projects', 'projects:write': 'Manage Projects', 'tasks:read': 'View Tasks', 'tasks:write': 'Manage Tasks', 'suggestions:read': 'View Suggestions', 'suggestions:write': 'Handle Suggestions', 'notifications:read': 'View Notifications', 'notifications:write': 'Mark Notifications', 'assistant:read': 'Read Assistant', 'assistant:write': 'Edit Assistant', 'chat:read': 'Read Chat', 'chat:write': 'Send Chat', 'users:read': 'View Members', 'profile:read': 'Read Profile', 'integrations:read': 'View Integrations', 'integrations:write': 'Manage Integrations', decompose: 'AI Decompose', brief: 'Generate Brief', pm: 'PM Observe', admin: 'Admin', 'tokens:manage': 'Manage Tokens' },
};

export function getScopeLabel(scope) { return (SCOPE_I18N[currentLang] || SCOPE_I18N['zh-CN'])[scope] || scope; }

export function setLang(lang) { currentLang = lang; }

export function applyLang(refreshStatusNames) {
  if (refreshStatusNames) refreshStatusNames();
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

export function initLangSwitcher(onLangChange) {
  $('#langTrigger').onclick = (e) => { e.stopPropagation(); $('#langMenu').classList.toggle('open'); };
  document.querySelectorAll('#langMenu button').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      currentLang = b.dataset.lang;
      localStorage.setItem('lang', currentLang);
      onLangChange();
      $('#langMenu').classList.remove('open');
    };
  });
  document.addEventListener('click', () => $('#langMenu').classList.remove('open'));
}
