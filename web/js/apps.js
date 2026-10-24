/* ============ 应用 Hub：媒体工坊 / 定时任务 / 浏览器 / WorkBuddy / 环境 / 文件 / 技能 / 3D ============ */
(function () {
  const { $, $$, toast, icons, escapeHtml } = window.UI;
  const { Media, Tasks, WorkBuddy, DynamicAgents, Skills } = window.Store;

  const APPS = [
    { page: 'media', icon: 'video', name: '媒体工坊', desc: '图片 / 视频生成，支持分辨率、比例、时长参数', color: '#ec4899' },
    { page: 'tasks', icon: 'clock', name: '定时任务', desc: '按一次 / 每天 / 每周 / 间隔自动执行任务', color: '#f59e0b' },
    { page: 'browser', icon: 'globe', name: '内置浏览器', desc: 'Agent 可调用的浏览器，多引擎搜索与网页操作', color: '#14b8a6' },
    { page: 'workbuddy', icon: 'link', name: 'WorkBuddy 绑定', desc: '浏览器登录后同步任务实况、调用专家团', color: '#8b5cf6' },
    { page: 'skills', icon: 'zap', name: '技能库', desc: '安装 / 编写智能体技能（网页设计/3D/调研…）', color: '#16a34a' },
    { page: 'mindmap', icon: 'network', name: '协作视图', desc: '思维导图式实时查看多智能体分工', color: '#0ea5e9' },
    { page: '3d', icon: 'cube', name: '3D 工坊', desc: '查看智能体画的 3D 模型与场景', color: '#8b5cf6' },
    { page: 'winenv', icon: 'monitor', name: 'Windows 桌面', desc: '模拟 Windows 环境（终端 / 记事本 / 资源管理器）', color: '#0ea5e9', env: true },
    { page: 'androidenv', icon: 'phone', name: '安卓环境', desc: '原生安卓环境与设备能力测试', color: '#16a34a', env: true },
    { page: 'files', icon: 'file', name: '文件管理', desc: '虚拟磁盘浏览、万能预览、保存到本地文件夹', color: '#64748b' }
  ];

  function render(container) {
    const jobs = Media.all();
    const running = jobs.filter(j => j.status === 'running').length;
    const tasks = Tasks.all();
    const dueSoon = tasks.filter(t => t.enabled && t.nextRunAt && t.nextRunAt - Date.now() < 3600000).length;
    const wb = WorkBuddy.get();
    const dyn = DynamicAgents.all();
    const sk = Skills.installed().length;
    container.innerHTML = `
      <div class="page" data-page="apps">
        <div class="page-header">
          <h1>应用<span class="sub">工具与自动化中心</span></h1>
        </div>
        <div class="page-body">
          <div class="card">
            <div class="card-title"> 今日概览</div>
            <div class="kv"><span class="k">媒体生成</span><span class="v">${jobs.length} 个任务${running ? ' · ' + running + ' 个进行中' : ''}</span></div>
            <div class="kv"><span class="k">定时任务</span><span class="v">${tasks.filter(t => t.enabled).length} 个启用${dueSoon ? ' · 1 小时内到期' : ''}</span></div>
            <div class="kv"><span class="k">智能体生态</span><span class="v">${dyn.length} 个已创造 · ${sk} 个技能待命</span></div>
            <div class="kv"><span class="k">WorkBuddy</span><span class="v">${wb.bound ? '✓ 已绑定 ' + (wb.phoneMask || '') : '未绑定'}</span></div>
          </div>
          <div class="card-title mt16">全部应用</div>
          <div class="apps-grid">
            ${APPS.map(a => `
              <button class="app-tile" data-act="open" data-page="${a.page}">
                <div class="app-icon" style="background:${a.color}1a;color:${a.color}">${(icons[a.icon] || icons.apps).replace('<svg', '<svg style="width:22px;height:22px"')}</div>
                <div class="app-name">${a.name}</div>
                <div class="app-desc">${a.desc}</div>
              </button>`).join('')}
          </div>
        </div>
      </div>`;
  }

  function onAction(act, el) {
    if (act === 'open') {
      const page = el.dataset.page;
      if (page === 'winenv' || page === 'androidenv') window.App.openEnv(page === 'winenv' ? 'win' : 'android');
      else window.App.push(page);
    }
  }

  window.AppsPage = { render, onAction, APPS };
})();
