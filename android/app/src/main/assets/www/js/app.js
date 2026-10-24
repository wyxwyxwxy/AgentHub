/* ============ 应用入口：路由 / 导航 / 全局事件（v2） ============ */
(function () {
  const { $, $$, toast, icons } = window.UI;

  /* 主 Tab */
  const TABS = [
    { key: 'chat', label: '对话', icon: icons.chat },
    { key: 'agents', label: '智能体', icon: icons.agents },
    { key: 'canvas', label: '画布', icon: icons.canvas },
    { key: 'apps', label: '应用', icon: icons.apps },
    { key: 'settings', label: '设置', icon: icons.settings }
  ];

  /* 页面模块注册表（Tab 页 + 子页面） */
  const PAGES = {
    chat: () => window.ChatPage,
    agents: () => window.AgentsPage,
    canvas: () => window.CanvasPage,
    apps: () => window.AppsPage,
    settings: () => window.SettingsPage,
    // ---- 子页面 ----
    media: () => window.MediaPage,
    tasks: () => window.TasksPage,
    browser: () => window.BrowserPage,
    workbuddy: () => window.WorkBuddyPage,
    models: () => window.ModelsPage,
    files: () => window.FilesPage,
    skills: () => window.SkillsPage,
    mindmap: () => window.MindMapPage,
    preview: () => window.PreviewPage,
    search: () => window.SearchPage,
    monitor: () => window.MonitorPage,
    '3d': () => window.ThreeDPage,
    winenv: () => window.EnvPage,
    androidenv: () => window.EnvPage,
    env: () => window.EnvPage,
    about: () => window.SettingsPage,
    data: () => window.SettingsPage
  };

  /* 子页面标题（用于统一页头） */
  const SUB_TITLES = {
    media: '媒体工坊', tasks: '定时任务', browser: '内置浏览器', workbuddy: 'WorkBuddy 绑定',
    models: '模型配置', files: '文件管理', skills: '技能库', mindmap: '协作视图',
    preview: '万能预览', '3d': '3D 工坊', winenv: 'Windows 桌面', androidenv: '安卓环境',
    about: '关于 AgentHub', data: '数据管理', env: '模拟环境'
  };

  let current = 'chat';
  const stack = [];          // 子页面栈 [{page, opts}]
  let envOpen = null;        // { renderer, container }
  let backTs = 0;

  /* ---------- 底部导航 ---------- */
  function renderTabs() {
    const bar = $('#tabbar');
    bar.innerHTML = TABS.map(t => `
      <button class="tabbar-item ${t.key === current ? 'active' : ''}" data-tab="${t.key}">
        ${t.icon}<span>${t.label}</span>
      </button>`).join('');
    bar.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab));
  }

  /* ---------- 路由 ---------- */
  function go(key) {
    if (!PAGES[key]) return;
    stack.length = 0;
    current = key;
    Store.state.activeTab = key; Store.save();
    renderTabs();
    refresh();
  }

  /* 打开子页面（压栈） */
  function push(page, opts) {
    if (!PAGES[page]) return;
    stack.push({ page, opts: opts || {} });
    refresh();
  }
  function pop() {
    if (stack.length) { stack.pop(); refresh(); return true; }
    return false;
  }

  /* 当前视图：子页面优先于 Tab 主页 */
  function view() {
    if (envOpen) return { page: envOpen.page, mod: PAGES[envOpen.page] && PAGES[envOpen.page](), container: envOpen.container, sub: false, env: true };
    if (stack.length) {
      const top = stack[stack.length - 1];
      return { page: top.page, mod: PAGES[top.page] && PAGES[top.page](), container: $('#screens'), sub: true, opts: top.opts };
    }
    return { page: current, mod: PAGES[current] && PAGES[current](), container: $('#screens'), sub: false };
  }

  function refresh() {
    const v = view();
    if (!v.mod) return;
    const screens = v.container;
    screens.innerHTML = '';
    if (v.sub && !v.env) {
      // 统一子页头：返回键 + 标题
      const header = document.createElement('div');
      header.className = 'sub-header';
      header.innerHTML = `
        <button class="icon-btn" data-act="pop">${icons.back}</button>
        <div class="sub-title">${SUB_TITLES[v.page] || ''}</div>`;
      const body = document.createElement('div');
      body.className = 'sub-body';
      screens.appendChild(header);
      screens.appendChild(body);
      v.mod.render(body, v.opts);
    } else {
      v.mod.render(screens, v.opts);
    }
  }

  /* ---------- 环境层（Windows / 安卓全屏） ---------- */
  function openEnv(kind) {
    const EnvPage = window.EnvPage;
    if (!EnvPage) return;
    const screens = $('#screens');
    const layer = document.createElement('div');
    layer.id = 'env-layer';
    layer.style.cssText = 'position:absolute;inset:0;z-index:100;display:flex;flex-direction:column;background:#fff';
    screens.appendChild(layer);
    envOpen = { renderer: null, container: layer, page: kind === 'android' ? 'androidenv' : 'winenv' };
    $('#tabbar').style.display = 'none';
    if (kind === 'android') EnvPage.openAndroid(layer);
    else EnvPage.openWindows(layer);
  }

  function closeEnv() {
    if (!envOpen) return;
    if (envOpen.container._timer) clearInterval(envOpen.container._timer);
    envOpen.container.remove();
    envOpen = null;
    $('#tabbar').style.display = '';
    refresh();
  }

  /* ---------- 全局事件委托 ---------- */
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (!act) return;
    if (envOpen) {
      if (act === 'close-env') { closeEnv(); return; }
      const mod = PAGES[envOpen.page] && PAGES[envOpen.page]();
      mod && mod.onAction && mod.onAction(act, el, envOpen.container);
      return;
    }
    if (act === 'pop') { pop(); return; }
    const v = view();
    v.mod && v.mod.onAction && await v.mod.onAction(act, el, v.container);
  });

  /* ---------- 返回键（由原生 onBackPressed 调用） ---------- */
  window.__handleBack = () => {
    if (envOpen) { closeEnv(); return true; }
    if (pop()) return true;
    if (current !== 'chat') { go('chat'); return true; }
    const now = Date.now();
    if (now - backTs < 2000) {
      if (window.AndroidHost && window.AndroidHost.exitApp) window.AndroidHost.exitApp();
      return true;
    }
    backTs = now;
    toast('再按一次返回键退出');
    return true;
  };

  /* ---------- 启动 ---------- */
  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    Store.load();
    if (Store.state.activeTab && PAGES[Store.state.activeTab]) current = Store.state.activeTab;
    renderTabs();
    refresh();
    // 应用屏幕方向（默认横屏）
    try {
      const mode = (Store.state.orientation) || 'landscape';
      if (window.UI && window.UI.Native && window.UI.Native.available) window.UI.Native.setOrientation(mode);
    } catch (e) { /* Web 预览忽略 */ }
    // 后台常驻：默认开启（MainActivity 已启动前台服务）；若用户在设置里关闭，则在此停止
    try {
      if (Store.state.settings && Store.state.settings.keepAlive === false
          && window.UI && window.UI.Native && window.UI.Native.available) {
        window.UI.Native.stopKeepAlive();
      }
    } catch (e) { /* 忽略 */ }
    if (!Store.Models.all().length) {
      setTimeout(() => toast('欢迎使用 AgentHub，先去「设置」添加模型 API 吧'), 800);
    }
  }

  window.App = {
    go, push, pop, refresh, openEnv, closeEnv,
    _envOpen: () => envOpen,
    get current() { return current; },
    get stack() { return stack; },
    get envOpen() { return envOpen; }
  };

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
