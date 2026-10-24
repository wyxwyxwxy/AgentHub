/* ============ 全局状态与本地持久化（v2：兼容 v1 + 新模块） ============ */
(function () {
  const KEY = 'agenthub.state.v2';
  const OLD_KEY = 'agenthub.state.v1';

  const defaultFS = () => ({
    name: '/', type: 'dir', children: [
      { name: 'home', type: 'dir', children: [
        { name: 'agent', type: 'dir', children: [
          { name: 'workspace', type: 'dir', children: [
            { name: 'README.md', type: 'file', mime: 'text/markdown',
              content: '# AgentHub 工作区\n\n欢迎使用 AgentHub 智能体工作台！\n\n- 所有配置与对话仅保存在本机\n- 可在「环境」页体验 Windows 模拟桌面与安卓原生环境\n- 在「模型」页添加你自己的 API 后即可开始对话\n- 「画布」页可拖拽搭建工作流，「应用」页有定时任务与媒体工坊\n- v2.3：试试运行下面的 demo.exe（文件页点 »），或让智能体「写个程序并编译运行」\n' },
            { name: 'notes.txt', type: 'file', mime: 'text/plain', content: '在这里记录你的想法……\n' },
            { name: 'demo.exe', type: 'file', mime: 'application/octet-stream',
              content: '// AgentHub 可执行程序（JavaScript 沙箱）\nconsole.log("Hello from demo.exe ");\nconst sum = (n) => n.reduce((a, b) => a + b, 0);\nconsole.log("1+2+...+10 =", sum([1,2,3,4,5,6,7,8,9,10]));\nconsole.log("本程序由 AgentHub 程序运行器在本地沙箱中真实执行");\n' }
          ] },
          { name: '下载', type: 'dir', children: [] },
          { name: '文档', type: 'dir', children: [] },
          { name: '媒体', type: 'dir', children: [] }
        ] }
      ] },
      { name: 'system', type: 'dir', children: [
        { name: 'about.txt', type: 'file', mime: 'text/plain', content: 'AgentHub OS 2.0\n构建: local-sandbox\n内核: webview-chromium\n' }
      ] }
    ]
  });

  /* v2.1 起只有 1 个主智能体（自由对话），专业能力由内置子智能体自动分担 */
  const defaultAgents = () => ([
    { id: 'a-main', name: '主智能体', avatar: 'agents', color: '#16a34a', modelId: null,
      systemPrompt: '', desc: '唯一的主智能体，需要时会自动派生子智能体' }
  ]);

  const defaultState = () => ({
    models: [],            // {id,name,kind,type,baseUrl,apiKey,model,temperature,maxTokens}
    agents: defaultAgents(),
    chats: [],             // {id,title,agentId,createdAt,updatedAt,messages[]}
    activeChatId: null,
    activeAgentId: 'a-main',
    fs: defaultFS(),
    saveDir: null,         // {uri,name} 用户选择的本地文件夹
    settings: { fontSize: 14, autoScroll: true, sendOnEnter: true, subagents: {}, deepThink: true, thinkAutoZh: true, keepAlive: true },
    // ---- v2 新增 ----
    workflows: [],          // {id,name,updatedAt,nodes[],edges[],viewport}
    tasks: [],              // 定时任务 {id,name,type,enabled,nextRunAt,...}
    mediaJobs: [],          // 媒体生成历史
    browser: { url: 'about:blank', title: '新标签页', tabs: [], ready: false, automation: false },
    workbuddy: {            // WorkBuddy 绑定与任务同步
      bound: false, phoneMask: '', siteUrl: 'https://workbuddy.cn',
      taskSelectors: null, expertSelectors: null, experts: [], taskSnapshot: null
    },
    // ---- v2.3 新增 ----
    orientation: 'landscape',  // 'portrait' | 'landscape' 默认横屏（模拟环境与整体界面）
    // ---- v2.2 新增 ----
    dynamicAgents: [],      // 主智能体自己创造的子智能体 {id,name,role,uses,createdAt,lastAt}
    skills: [],             // 技能库 {id,name,icon,desc,prompt,tools,builtin,installed,createdAt}
    spawnLog: []            // 最近 spawn 运行记录 {id,role,task,status,at,ms}（供思维导图/历史）
  });

  /* ---------- 读取 / v1 迁移 / 深合并 ---------- */
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (!raw) {
      try {
        const old = localStorage.getItem(OLD_KEY);
        if (old) {
          const v1 = JSON.parse(old);
          raw = JSON.stringify(Object.assign(defaultState(), {
            models: v1.models || [], agents: v1.agents && v1.agents.length ? v1.agents : defaultAgents(),
            chats: v1.chats || [],             activeChatId: v1.activeChatId || null,
            activeAgentId: v1.activeAgentId || 'a-general',            fs: v1.fs || defaultFS(), saveDir: v1.saveDir || null
          }));
          try { localStorage.removeItem(OLD_KEY); } catch (e) {}
        }
      } catch (e) {}
    }
    const base = defaultState();
    let st = base;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        st = Object.assign({}, base, parsed, {
          browser: Object.assign({}, base.browser, parsed.browser || {}),
          workbuddy: Object.assign({}, base.workbuddy, parsed.workbuddy || {}),
          settings: Object.assign({}, base.settings, parsed.settings || {})
        });
      } catch (e) { st = base; }
    }
    if (!Array.isArray(st.models)) st.models = [];
    if (!st.agents || !st.agents.length) st.agents = defaultAgents();
    // v2.1：收敛为单智能体——旧数据里的多个智能体只保留当前（或第一个），其余为人设预设、可随时重建
    if (st.agents.length > 1) {
      const keep = st.agents.find(a => a.id === st.activeAgentId) || st.agents[0];
      st.agents = [keep];
    }
    st.activeAgentId = st.agents[0] ? st.agents[0].id : null;
    if (!st.chats) st.chats = [];
    if (!st.fs || !st.fs.children) st.fs = defaultFS();
    if (!st.workflows) st.workflows = [];
    if (!st.tasks) st.tasks = [];
    if (!st.mediaJobs) st.mediaJobs = [];
    if (!Array.isArray(st.dynamicAgents)) st.dynamicAgents = [];
    // v2.2 技能库：旧数据没有 skills → 载入默认技能库；有则增量补齐新增内置技能（保留用户修改）
    if (!Array.isArray(st.skills) || !st.skills.length) st.skills = defaultSkills();
    else {
      // 增量补齐新内置技能；内置技能版本号（rev）升级时保留用户安装状态、刷新定义
      defaultSkills().forEach(d => {
        const have = st.skills.find(s => s.id === d.id);
        if (!have) st.skills.push(d);
        else if (have.builtin && (have.rev || 1) < (d.rev || 1)) {
          const installed = have.installed;
          Object.assign(have, d, { installed });
        }
      });
    }
    if (!Array.isArray(st.spawnLog)) st.spawnLog = [];
    if (!st.settings) st.settings = {};
    if (!st.settings.subagents || typeof st.settings.subagents !== 'object') st.settings.subagents = {};
    return st;
  }

  const state = load();
  const listeners = [];
  let saveTimer = null;

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) { console.warn('save failed', e); }
    }, 120);
  }
  function emit() { save(); listeners.forEach(fn => { try { fn(); } catch (e) {} }); }

  const uid = (p) => (p || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

  /* ---------- 模型 ---------- */
  const Models = {
    list: () => state.models,                       // v1
    all() { return state.models; },
    ofKind(kind) { return state.models.filter(m => (m.kind || 'chat') === kind); },
    chat() { return Models.ofKind('chat'); },
    image() { return state.models.filter(m => m.kind === 'image'); },
    video() { return state.models.filter(m => m.kind === 'video'); },
    get: (id) => state.models.find(m => m.id === id) || null,
    add(m) {
      if (!m.id) m.id = uid('m');
      if (!m.kind) m.kind = 'chat';
      state.models.push(m); emit(); return m;
    },
    update(id, patch) {
      const m = Models.get(id);
      if (!m) return null;
      Object.assign(m, patch); emit(); return m;
    },
    remove(id) { state.models = state.models.filter(m => m.id !== id); emit(); },
    defaultChat() {
      const list = Models.chat();
      return list.length ? list[0] : (state.models[0] || null);
    }
  };

  /* ---------- 智能体 ---------- */
  const Agents = {
    list: () => state.agents,                       // v1
    all() { return state.agents; },
    get: (id) => state.agents.find(a => a.id === id) || null,
    active: () => Agents.get(state.activeAgentId) || state.agents[0] || null,   // v1
    setActive(id) { state.activeAgentId = id; emit(); },                        // v1
    search(kw) {
      kw = (kw || '').trim().toLowerCase();
      if (!kw) return state.agents;
      return state.agents.filter(a =>
        (a.name || '').toLowerCase().includes(kw) ||
        (a.desc || '').toLowerCase().includes(kw) ||
        (a.systemPrompt || '').toLowerCase().includes(kw));
    },
    add(a) { if (!a.id) a.id = uid('a'); state.agents.push(a); emit(); return a; },
    update(id, patch) {
      const a = Agents.get(id);
      if (!a) return null;
      Object.assign(a, patch); emit(); return a;
    },
    remove(id) { state.agents = state.agents.filter(a => a.id !== id); emit(); },
    removeMany(ids) {
      const set = new Set(ids || []);
      state.agents = state.agents.filter(a => !set.has(a.id));
      emit();
    },
    bulkCreate(items) {
      let n = 0;
      (items || []).forEach(a => { if (!a.id) a.id = uid('a'); state.agents.push(a); n++; });
      emit(); return n;
    },
    page(list, page, size) {
      page = Math.max(1, page || 1); size = size || 24;
      const start = (page - 1) * size;
      return { total: list.length, page, size, pages: Math.max(1, Math.ceil(list.length / size)),
        items: list.slice(start, start + size) };
    }
  };

  /* ---------- 会话 ---------- */
  const Chats = {
    list: () => state.chats.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),  // v1
    all() { return state.chats; },
    get: (id) => state.chats.find(c => c.id === id) || null,
    create(agentId) {                                            // v1
      const c = { id: uid('c'), title: '新对话', agentId: agentId || (Agents.active() && Agents.active().id) || null,
        createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
      state.chats.unshift(c); state.activeChatId = c.id; emit(); return c;
    },
    ensure(agentId) {
      let c = Chats.get(state.activeChatId);
      if (!c || (agentId && c.agentId !== agentId)) c = Chats.create(agentId);
      return c;
    },
    newChat(agentId) { return Chats.create(agentId); },
    active: () => Chats.get(state.activeChatId) || null,          // v1
    remove(id) {                                                  // v1
      state.chats = state.chats.filter(c => c.id !== id);
      if (state.activeChatId === id) state.activeChatId = state.chats[0] ? state.chats[0].id : null;
      emit();
    },
    touch(c) { save(); }                                          // v1
  };

  /* ---------- 虚拟文件系统（字符串路径，v1 兼容） ---------- */
  const FS = {
    root: () => state.fs,
    getNode(path) {
      if (!path || path === '/') return state.fs;
      const parts = path.split('/').filter(Boolean);
      let node = state.fs;
      for (const p of parts) {
        if (!node || node.type !== 'dir') return null;
        node = (node.children || []).find(c => c.name === p);
        if (!node) return null;
      }
      return node;
    },
    dirname(path) {
      if (!path || path === '/') return '/';
      const parts = path.split('/').filter(Boolean); parts.pop();
      return '/' + parts.join('/');
    },
    join(dir, name) { return (dir === '/' ? '' : dir) + '/' + name; },
    mkdir(path) {
      const parent = FS.getNode(FS.dirname(path));
      if (!parent || parent.type !== 'dir') throw new Error('父目录不存在');
      const name = path.split('/').filter(Boolean).pop();
      if ((parent.children || []).some(c => c.name === name)) throw new Error('已存在: ' + name);
      parent.children = parent.children || [];
      parent.children.push({ name, type: 'dir', children: [] });
      emit(); return true;
    },
    writeFile(path, content, mime) {
      // mkdir -p：父目录不存在时自动创建（智能体常直接写入新路径）
      const parts = path.split('/').filter(Boolean);
      const name = parts.pop();
      let dir = state.fs;
      for (const p of parts) {
        if (dir.type !== 'dir') throw new Error('目录不存在: ' + path);
        let next = (dir.children || []).find(c => c.name === p);
        if (!next) { next = { name: p, type: 'dir', children: [] }; (dir.children = dir.children || []).push(next); }
        dir = next;
      }
      const parent = dir;
      let f = (parent.children || []).find(c => c.name === name);
      if (f && f.type === 'dir') throw new Error('同名文件夹已存在');
      if (!f) { f = { name, type: 'file', content: '', mime: mime || 'text/plain' }; parent.children.push(f); }
      f.content = content; if (mime) f.mime = mime;
      emit(); return f;
    },
    readFile(path) {
      const f = FS.getNode(path);
      if (!f || f.type !== 'file') throw new Error('文件不存在: ' + path);
      return f.content;
    },
    remove(path) {
      const parent = FS.getNode(FS.dirname(path));
      if (!parent || parent.type !== 'dir' || !parent.children) throw new Error('路径不存在');
      const name = path.split('/').filter(Boolean).pop();
      parent.children = parent.children.filter(c => c.name !== name);
      emit();
    },
    rename(path, newName) {
      const node = FS.getNode(path);
      if (!node) throw new Error('路径不存在');
      node.name = newName; emit();
    },
    list(path) {
      const d = FS.getNode(path);
      if (!d || d.type !== 'dir') return [];
      return (d.children || []).slice().sort((a, b) =>
        (a.type === b.type) ? a.name.localeCompare(b.name, 'zh') : (a.type === 'dir' ? -1 : 1));
    },
    sizeOf(path) {
      const n = FS.getNode(path);
      if (!n) return 0;
      if (n.type === 'file') return (n.content || '').length;
      return (n.children || []).reduce((s, c) => s + FS.sizeOf(FS.join(path, c.name)), 0);
    },
    export() { return JSON.stringify(state.fs); },
    import(json) { state.fs = JSON.parse(json); emit(); }
  };

  /* ---------- 保存目录 ---------- */
  const SaveDir = {
    get: () => state.saveDir,
    set(uri, name) { state.saveDir = { uri, name }; emit(); },
    clear() { state.saveDir = null; emit(); }
  };

  /* ---------- 工作流（画布） ---------- */
  const Workflows = {
    all() { return state.workflows; },
    get(id) { return state.workflows.find(w => w.id === id) || null; },
    add(w) {
      if (!w.id) w.id = uid('wf');
      w.updatedAt = Date.now();
      if (!Array.isArray(w.nodes)) w.nodes = [];
      if (!Array.isArray(w.edges)) w.edges = [];
      state.workflows.unshift(w); emit(); return w;
    },
    update(id, patch) {
      const w = Workflows.get(id);
      if (!w) return null;
      Object.assign(w, patch, { updatedAt: Date.now() });
      emit(); return w;
    },
    remove(id) { state.workflows = state.workflows.filter(w => w.id !== id); emit(); },
    importJSON(text) {
      let obj;
      try { obj = JSON.parse(text); } catch (e) { throw new Error('不是合法的 JSON'); }
      const arr = Array.isArray(obj) ? obj : [obj];
      let n = 0;
      arr.forEach(w => {
        if (!w || !Array.isArray(w.nodes) || !w.nodes.length) return;
        Workflows.add({
          name: String(w.name || '导入的工作流').slice(0, 60),
          nodes: w.nodes, edges: Array.isArray(w.edges) ? w.edges : [],
          viewport: w.viewport || { x: 0, y: 0, zoom: 1 }
        });
        n++;
      });
      if (!n) throw new Error('未找到有效的工作流（nodes 为空）');
      return n;
    },
    exportJSON(id) {
      const w = Workflows.get(id);
      if (!w) return null;
      return JSON.stringify({ name: w.name, nodes: w.nodes, edges: w.edges, viewport: w.viewport || { x: 0, y: 0, zoom: 1 } }, null, 2);
    }
  };

  /* ---------- 定时任务 ---------- */
  const DAY = 86400000, WEEK = 7 * DAY;
  const Tasks = {
    all() { return state.tasks; },
    get(id) { return state.tasks.find(t => t.id === id) || null; },
    add(t) {
      if (!t.id) t.id = uid('t');
      t.log = t.log || [];
      if (!t.nextRunAt) t.nextRunAt = Tasks.computeNext(t);
      state.tasks.unshift(t); emit(); return t;
    },
    update(id, patch) {
      const t = Tasks.get(id);
      if (!t) return null;
      Object.assign(t, patch);
      if ('type' in patch || 'time' in patch || 'weekday' in patch || 'interval' in patch || 'datetime' in patch) {
        t.nextRunAt = Tasks.computeNext(t);
      }
      emit(); return t;
    },
    remove(id) { state.tasks = state.tasks.filter(t => t.id !== id); emit(); },
    computeNext(t) {
      const now = Date.now();
      if (!t.enabled) return t.nextRunAt || 0;
      if (t.type === 'interval') {
        const ms = Math.max(60000, (t.interval || 60) * 60000);
        return t.lastRunAt ? t.lastRunAt + ms : now + ms;
      }
      if (t.type === 'once') {
        const at = new Date(t.datetime || Date.now() + 3600000).getTime();
        return at > now ? at : now + 60000;
      }
      if (t.type === 'weekly') {
        const wd = t.weekday == null ? 1 : t.weekday;
        const hm = String(t.time || '09:00').split(':').map(Number);
        for (let i = 0; i < 8; i++) {
          const d = new Date(now + i * DAY);
          if (d.getDay() !== wd) continue;
          const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hm[0] || 0, hm[1] || 0, 0, 0).getTime();
          if (at > now) return at;
        }
        return now + WEEK;
      }
      // daily
      const hm = String(t.time || '09:00').split(':').map(Number);
      const n2 = new Date();
      const at = new Date(n2.getFullYear(), n2.getMonth(), n2.getDate(), hm[0] || 0, hm[1] || 0, 0, 0).getTime();
      return at > now ? at : at + DAY;
    },
    due() {
      const now = Date.now();
      return state.tasks.filter(t => t.enabled && t.nextRunAt && t.nextRunAt <= now);
    },
    markRun(id, ok, msg) {
      const t = Tasks.get(id);
      if (!t) return;
      t.lastRunAt = Date.now();
      t.lastOk = ok;
      t.lastMsg = msg || '';
      if (t.type === 'once' && ok) { t.enabled = false; t.nextRunAt = 0; }
      else t.nextRunAt = Tasks.computeNext(t);
      t.log = t.log || [];
      t.log.unshift({ at: t.lastRunAt, ok: !!ok, msg: msg || '' });
      if (t.log.length > 30) t.log.length = 30;
      emit();
    },
    describe(t) {
      if (t.type === 'once') return '一次性 · ' + new Date(t.datetime).toLocaleString('zh-CN', { hour12: false });
      if (t.type === 'interval') return '每 ' + (t.interval || 60) + ' 分钟';
      if (t.type === 'daily') return '每天 ' + (t.time || '09:00');
      if (t.type === 'weekly') {
        const names = ['日', '一', '二', '三', '四', '五', '六'];
        return '每周' + names[t.weekday == null ? 1 : t.weekday] + ' ' + (t.time || '09:00');
      }
      return t.type;
    }
  };

  /* ---------- 媒体任务历史 ---------- */
  const Media = {
    all() { return state.mediaJobs; },
    get(id) { return state.mediaJobs.find(j => j.id === id) || null; },
    add(j) {
      if (!j.id) j.id = uid('mj');
      j.createdAt = j.createdAt || Date.now();
      state.mediaJobs.unshift(j);
      if (state.mediaJobs.length > 60) state.mediaJobs.length = 60;
      emit(); return j;
    },
    update(id, patch) {
      const j = Media.get(id);
      if (!j) return null;
      Object.assign(j, patch); emit(); return j;
    },
    remove(id) { state.mediaJobs = state.mediaJobs.filter(j => j.id !== id); emit(); },
    clear() { state.mediaJobs = []; emit(); }
  };

  /* ---------- 浏览器状态 ---------- */
  const BrowserState = {
    get() { return state.browser; },
    set(patch) { Object.assign(state.browser, patch || {}); emit(); }
  };

  /* ---------- WorkBuddy 绑定 ---------- */
  const WorkBuddy = {
    get() { return state.workbuddy; },
    bind(phoneMask) {
      state.workbuddy.bound = true;
      state.workbuddy.phoneMask = phoneMask || '';
      emit();
    },
    unbind() {
      Object.assign(state.workbuddy, { bound: false, phoneMask: '', experts: [], taskSnapshot: null });
      emit();
    },
    setExperts(list) { state.workbuddy.experts = list || []; emit(); },
    addExpert(e) {
      if (!e || !e.id) return;
      if (state.workbuddy.experts.some(x => x.id === e.id)) return;
      state.workbuddy.experts.push(e);
      emit();
    },
    setSnapshot(snap) { state.workbuddy.taskSnapshot = snap; emit(); },
    setSelectors(taskSel, expertSel) {
      state.workbuddy.taskSelectors = taskSel || null;
      state.workbuddy.expertSelectors = expertSel || null;
      emit();
    }
  };

  /* ---------- v2.3 内置技能库（20 个） ---------- */
  function defaultSkills() {
    return [
    { id: 'web-design', name: '网页设计师', icon: 'web', desc: '设计并写出完整 HTML/CSS 页面', tools: ['fs.write', 'fs.read'], builtin: true, installed: true,
      prompt: '你是「网页设计师」子智能体，擅长设计美观的现代网页：输出完整可运行的 HTML（内联 CSS），遵循白底、绿色点缀的简洁风格，响应式布局，注意排版、间距与交互细节。用 fs.write 保存到 /home/agent/workspace/ 并说明预览方式。' },
    { id: 'css-design', name: 'CSS 设计师', icon: 'layers', desc: '创建设计系统、样式表、动画与主题', tools: ['fs.write', 'fs.read', 'compile'], builtin: true, installed: true,
      prompt: '你是「CSS 设计师」子智能体，专注 CSS：产出结构清晰的样式表（设计变量 :root、组件类、响应式断点、过渡动画），支持暗色模式与玻璃拟态等现代质感。写入 .css 文件到 /home/agent/workspace/，可配合 compile 校验，并说明如何与 HTML 配合预览。' },
    { id: 'svg-art', name: 'SVG 插画师', icon: 'sparkles', desc: '绘制 SVG 图标、插画、Logo 与动画', tools: ['fs.write'], builtin: true, installed: true,
      prompt: '你是「SVG 插画师」子智能体：用纯 SVG 代码绘制图标、插画、Logo、数据图形与动画（stroke-dasharray/SMIL/CSS 动画）。注意 viewBox、语义化分组、可缩放；保存为 .svg 文件到 /home/agent/workspace/，说明可在万能预览器查看。' },
    { id: 'three-d', name: '3D 建模师', icon: 'cube', rev: 2, desc: '创建电影级光感的 Three.js 场景 / OBJ/STL 3D 模型', tools: ['fs.write'], builtin: true, installed: true,
      prompt: '你是「3D 建模师」子智能体，擅长创建电影级光感与细腻反射的 3D 内容。写 Three.js 场景代码时遵循质感规范：\n· 渲染器：outputEncoding = THREE.sRGBEncoding；toneMapping = THREE.ACESFilmicToneMapping，toneMappingExposure ≈ 1.1；开启 shadowMap 并使用 THREE.PCFSoftShadowMap\n· 材质：主体用 THREE.MeshPhysicalMaterial，显式设置 roughness/metalness/clearcoat/clearcoatRoughness 与 envMapIntensity；金属 roughness 0.1~0.25 + metalness≈1；陶瓷 roughness≈0.25 + clearcoat≈1；玻璃 transmission≈0.95 + ior≈1.45 + thickness；不要用 MeshBasicMaterial 做主体（无光感）\n· 环境反射：用 THREE.PMREMGenerator 将渐变 EquirectangularReflectionMapping 画布贴图预滤波后赋给 scene.environment，金属与清漆才有真实反光\n· 布光：三点光——暖色主光 DirectionalLight（castShadow，shadow.mapSize 2048、bias -0.0004、radius 4）+ 冷色补光 + 轮廓背光，辅以 HemisphereLight；地面用 ShadowMaterial 或网格承接接触阴影\n· 细节：球体 48+ 段、几何体分段充足、可做边缘倒角；模型居中并归一化大小\n也可以输出 OBJ/STL 模型数据（尽量带法线）。保存到 /home/agent/3d/ 目录，文件名以 .js/.obj/.stl 结尾，并说明可在「应用 → 3D 工坊」预览，预览时可实时切换陶瓷/金属/玻璃/哑光材质。' },
    { id: 'game-dev', name: '游戏开发工程师', icon: 'play', desc: '编写可直接运行的网页小游戏', tools: ['fs.write', 'fs.read'], builtin: true, installed: true,
      prompt: '你是「游戏开发工程师」子智能体：编写完整可运行的 HTML5 小游戏（Canvas + requestAnimationFrame，含开始/进行/结束状态、计分与键盘或触摸操控），单文件内联 CSS/JS，保存到 /home/agent/workspace/games/，文件名如 game.html。' },
    { id: 'compiler', name: '编译构建专家', icon: 'zap', desc: '编译检查、构建脚本与运行验证', tools: ['compile', 'fs.write', 'fs.read', 'fs.list'], builtin: true, installed: true,
      prompt: '你是「编译构建专家」子智能体：用 compile 工具对 /home/agent/ 下的代码做编译检查与运行验证（JS 真实沙箱执行、HTML/CSS/JSON 校验、Python/C/C++/Java 结构检查），生成构建报告写入 /home/agent/build/，用简洁中文汇报每个文件的编译结果与错误位置。' },
    { id: 'frontend', name: '前端工程师', icon: 'code', desc: '编写/修改前端代码与组件', tools: ['fs.write', 'fs.read', 'compile'], builtin: true, installed: true,
      prompt: '你是「前端工程师」子智能体，擅长编写与修改前端代码（HTML/CSS/JS/React 思路），代码可直接运行，关键处加简洁中文注释；可用 fs.read 先读现有文件再改，用 compile 验证语法。' },
    { id: 'qa', name: '测试工程师', icon: 'check', desc: '编写测试用例并执行验证', tools: ['fs.write', 'fs.read', 'compile'], builtin: true, installed: true,
      prompt: '你是「测试工程师」子智能体：为目标代码编写测试（断言函数 + 用例表），用 compile 运行验证（node -e 风格沙箱），统计通过/失败，输出测试报告到 /home/agent/build/。' },
    { id: 'code-review', name: '代码审查员', icon: 'shield', desc: '审查代码错误、风险与改进点', tools: ['fs.read', 'compile'], builtin: true, installed: true,
      prompt: '你是「代码审查员」子智能体：用 fs.read 读取目标代码（可用 compile 做语法确认），按严重程度（致命/建议/优化）列出问题与修复方案，语气直接但建设性。' },
    { id: 'data', name: '数据分析师', icon: 'chart', desc: '读取数据文件并输出分析结论', tools: ['fs.read', 'fs.write'], builtin: true, installed: true,
      prompt: '你是「数据分析师」子智能体：用 fs.read 读取数据文件（CSV/JSON/文本），做统计与对比，输出结构化结论与可视化建议，可把报告用 fs.write 存到 /home/agent/文档/。' },
    { id: 'dataviz', name: '数据可视化工程师', icon: 'chart', desc: '生成图表页面（ECharts/纯 SVG/Canvas）', tools: ['fs.write'], builtin: true, installed: true,
      prompt: '你是「数据可视化工程师」子智能体：把数据转为直观图表——单文件 HTML（可用 CDN ECharts 或纯 SVG/Canvas 手绘），注意配色（白底绿辅）、坐标轴、图例、tooltip 与响应式，保存到 /home/agent/workspace/。' },
    { id: 'copywrite', name: '文案写手', icon: 'pen', desc: '撰写与润色各类中文文案', tools: ['fs.write'], builtin: true, installed: true,
      prompt: '你是「文案写手」子智能体，擅长撰写与润色各类中文文案，风格自然、有感染力，成品可直接使用；长文案用 fs.write 保存。' },
    { id: 'social-media', name: '新媒体运营', icon: 'users', desc: '小红书/公众号/短视频脚本创作', tools: ['fs.write'], builtin: true, installed: true,
      prompt: '你是「新媒体运营」子智能体：创作小红书笔记（标题带 emoji、正文分段带话题标签）、公众号文章、短视频脚本（含分镜与口播），语气贴近平台调性，成品用 fs.write 保存。' },
    { id: 'prompt-eng', name: 'Prompt 工程师', icon: 'brain', desc: '设计/优化提示词与智能体人设', tools: ['fs.write'], builtin: true, installed: true,
      prompt: '你是「Prompt 工程师」子智能体：根据需求设计结构化提示词（角色/任务/约束/输出格式/少样本），给出正反例与迭代建议，可直接用于主智能体系统提示词。' },
    { id: 'research', name: '调研员', icon: 'search', desc: '联网检索、交叉验证、输出带来源的结论', tools: ['browser.search', 'browser.navigate', 'browser.extract', 'notify'], builtin: true, installed: true,
      prompt: '你是「调研员」子智能体：用 browser.search 搜索、browser.navigate / browser.extract 读取网页，尽量多源交叉验证，输出带来源链接的结构化结论。' },
    { id: 'illustration', name: '插画师', icon: 'image', desc: '把创意扩写为画面描述并生成图片', tools: ['media.image', 'notify'], builtin: true, installed: true,
      prompt: '你是「插画师」子智能体：把用户的创意扩写为详细的画面描述（主体、风格、光线、构图、色调），调用 media.image 生成，并汇报结果。' },
    { id: 'video-dir', name: '视频导演', icon: 'video', desc: '设计分镜并生成图片/视频', tools: ['media.video', 'media.image', 'notify'], builtin: true, installed: true,
      prompt: '你是「视频导演」子智能体：先把用户的创意拆成镜头/分镜，再调用 media.image / media.video 生成素材，汇报每个镜头的产出。' },
    { id: 'db-design', name: '数据库设计师', icon: 'layers', desc: 'ER 设计、表结构、SQL 与索引优化', tools: ['fs.write'], builtin: true, installed: true,
      prompt: '你是「数据库设计师」子智能体：根据业务需求输出 ER 关系说明、建表 SQL（含字段类型/主外键/索引/注释）、查询示例与优化建议，保存为 .sql 或 .md 文件。' },
    { id: 'api-design', name: 'API 设计师', icon: 'file', desc: 'REST/GraphQL 接口设计与文档', tools: ['fs.write'], builtin: true, installed: true,
      prompt: '你是「API 设计师」子智能体：设计 RESTful 接口（路径/方法/请求响应 schema/错误码/鉴权），输出 Markdown 接口文档，可附示例请求响应。' },
    { id: 'architect', name: '系统架构师', icon: 'brain', desc: '设计系统架构与模块划分', tools: ['fs.write'], builtin: true, installed: true,
      prompt: '你是「系统架构师」子智能体：针对需求给出架构设计（模块划分、数据流、接口、技术选型与权衡），输出 Markdown 设计文档，可用 fs.write 保存。' },
    { id: 'security', name: '安全审计员', icon: 'shield', desc: '审计安全隐患与修复建议', tools: ['fs.read', 'compile'], builtin: true, installed: true,
      prompt: '你是「安全审计员」子智能体：审查代码与配置中的安全隐患（注入/XSS/越权/密钥硬编码/依赖风险），按高中低危分级并给出修复代码示例。' },
    { id: 'devops', name: 'DevOps 工程师', icon: 'monitor', desc: 'CI/CD、Dockerfile、部署与监控脚本', tools: ['fs.write'], builtin: true, installed: true,
      prompt: '你是「DevOps 工程师」子智能体：编写 Dockerfile、CI/CD 流水线配置、部署脚本、健康检查与日志规范，附使用说明，保存为对应配置文件。' },
    { id: 'doc-writer', name: '文档写手', icon: 'file', desc: 'README、说明书、帮助中心文档', tools: ['fs.write', 'fs.read'], builtin: true, installed: true,
      prompt: '你是「文档写手」子智能体：编写结构清晰的 Markdown 文档（README/使用说明/FAQ/更新日志），语言简洁、步骤可操作、必要时给示例；可用 fs.read 先读代码再写文档。' }
  ];
  }

  /* ---------- 设置 ---------- */
  const Settings = {
    get() { return state.settings; },
    set(patch) { Object.assign(state.settings, patch || {}); emit(); },
    /** 子智能体开关（缺省启用） */
    subEnabled(id) { const m = state.settings.subagents || {}; return m[id] !== false; },
    setSub(id, on) {
      if (!state.settings.subagents) state.settings.subagents = {};
      state.settings.subagents[id] = !!on;
      emit();
    }
  };

  /* ---------- v2.2 动态智能体（主智能体自己创造的子 agent） ---------- */
  const DynamicAgents = {
    all: () => state.dynamicAgents,
    find(role) {
      role = (role || '').trim().toLowerCase();
      if (!role) return null;
      return state.dynamicAgents.find(a => a.name.toLowerCase() === role)
        || state.dynamicAgents.find(a => a.name.toLowerCase().includes(role))
        || null;
    },
    /** 已存在则复用，否则按角色创造一个（自繁衍） */
    ensure(role, prompt) {
      const name = String(role || '').trim().slice(0, 30) || '子智能体';
      let a = DynamicAgents.find(name);
      if (!a) {
        a = { id: uid('da'), name, role: name, prompt: prompt || '', uses: 0, createdAt: Date.now(), lastAt: Date.now() };
        state.dynamicAgents.push(a); emit();
      }
      return a;
    },
    touch(id) {
      const a = state.dynamicAgents.find(x => x.id === id);
      if (a) { a.uses++; a.lastAt = Date.now(); }
    },
    remove(id) { state.dynamicAgents = state.dynamicAgents.filter(a => a.id !== id); emit(); },
    clear() { state.dynamicAgents = []; emit(); }
  };

  /* ---------- v2.2 技能库 ---------- */
  const Skills = {
    all: () => state.skills,
    installed: () => state.skills.filter(s => s.installed !== false),
    get: (id) => state.skills.find(s => s.id === id) || null,
    add(s) {
      if (!s.id) s.id = uid('sk');
      s.installed = true; s.builtin = false; s.createdAt = Date.now();
      state.skills.push(s); emit(); return s;
    },
    update(id, patch) { const s = Skills.get(id); if (!s) return null; Object.assign(s, patch); emit(); return s; },
    remove(id) { state.skills = state.skills.filter(s => s.id !== id); emit(); },
    setInstalled(id, on) { const s = Skills.get(id); if (!s) return; s.installed = !!on; emit(); }
  };

  /* ---------- v2.2 spawn 运行记录 ---------- */
  const SpawnLog = {
    all: () => state.spawnLog,
    add(e) {
      const rec = Object.assign({ id: uid('sp'), at: Date.now(), status: 'running' }, e);
      state.spawnLog.unshift(rec);
      if (state.spawnLog.length > 60) state.spawnLog.length = 60;
      return rec;
    },
    update(id, patch) {
      const e = state.spawnLog.find(x => x.id === id);
      if (e) Object.assign(e, patch);
    }
  };

  /* ---------- 通用路径取值（支持 data.task_id / data.results[0].url） ---------- */
  function getPath(obj, path) {
    if (!path) return undefined;
    const parts = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  window.Store = {
    get state() { return state; },
    load, save, uid, emit,
    Models, Agents, Chats, FS, SaveDir,
    Workflows, Tasks, Media, BrowserState, WorkBuddy, Settings,
    DynamicAgents, Skills, SpawnLog,
    getPath,
    version: '2.4.0',
    reset() {
      const fresh = defaultState();
      Object.keys(state).forEach(k => delete state[k]);
      Object.assign(state, fresh);
      emit();
    }
  };
})();
