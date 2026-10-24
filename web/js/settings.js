/* ============ 设置页：模型 / 保存位置 / 文件 / 环境 / 数据 / 关于 ============ */
(function () {
  const { $, $$, toast, sheet, confirmDialog, icons, escapeHtml, Native, download } = window.UI;
  const { SaveDir, Models, Agents, Chats, Workflows, Tasks, Media, DynamicAgents, Skills, SpawnLog } = window.Store;

  /* ---------- 设置主页 ---------- */
  function renderHome(container) {
    const dir = SaveDir.get();
    const ss = Store.state.settings;
    container.innerHTML = `
      <div class="page" data-page="settings">
        <div class="page-header"><h1>设置<span class="sub">模型 · 存储 · 数据</span></h1></div>
        <div class="page-body">
          <div class="card">
            <div class="card-title"> 模型</div>
            <div class="kv"><span class="k">对话模型</span><span class="v">${Models.chat().length} 个</span></div>
            <div class="kv"><span class="k">图片模型</span><span class="v">${Models.image().length} 个</span></div>
            <div class="kv"><span class="k">视频模型</span><span class="v">${Models.video().length} 个</span></div>
            <button class="btn ghost block mt12" data-act="open" data-page="models">管理模型配置 →</button>
          </div>

          <div class="card mt12">
            <div class="card-title">保存位置</div>
            <div class="kv"><span class="k">本地文件夹</span><span class="v">${dir ? escapeHtml(dir.name || dir.uri) : '未设置（使用浏览器下载）'}</span></div>
            <div class="hint" style="margin:8px 0">设置后，文件导出、工作流导出、图片/视频保存都会写入这里（SAF 授权，仅应用可访问）。</div>
            <div class="row" style="gap:8px">
              <button class="btn ghost sm" data-act="pick-dir">选择文件夹</button>
              ${dir ? `<button class="btn danger sm" data-act="clear-dir">清除</button>` : ''}
            </div>
          </div>

          <div class="card mt12">
            <div class="card-title"> 深度思考</div>
            <div class="set-row">
              <div class="sr-left">
                <div class="sr-title">深度思考</div>
                <div class="sr-sub">回复前先展示推理过程，可展开查看「思考过程」卡片</div>
              </div>
              <input type="checkbox" class="switch" data-act="toggle-deep" ${ss.deepThink !== false ? 'checked' : ''}>
            </div>
            <div class="set-row">
              <div class="sr-left">
                <div class="sr-title">思考自动翻译为中文</div>
                <div class="sr-sub">把非中文的思考过程自动翻译成中文（带「已自动翻译」标记）</div>
              </div>
              <input type="checkbox" class="switch" data-act="toggle-thzh" ${ss.thinkAutoZh !== false ? 'checked' : ''}>
            </div>
          </div>

          <div class="card mt12">
            <div class="card-title"> 后台运行</div>
            <div class="set-row">
              <div class="sr-left">
                <div class="sr-title">后台常驻</div>
                <div class="sr-sub">开启后智能体在后台持续运行，返回键退出或息屏都不暂停；可在通知栏一键停止。强制停止应用会真正中断（系统限制）。</div>
              </div>
              <input type="checkbox" class="switch" data-act="toggle-keepalive" ${ss.keepAlive !== false ? 'checked' : ''}>
            </div>
            <div class="hint" style="margin-top:6px">激进保活：前台服务 + 通知栏常驻 + 唤醒锁，仅安装 APK 后生效。</div>
          </div>

          <div class="card mt12">
            <div class="card-title"> 工具</div>
            <button class="btn ghost block" data-act="open" data-page="files" style="margin-bottom:8px"> 文件管理（虚拟磁盘）</button>
            <button class="btn ghost block" data-act="open" data-page="media"> 媒体工坊</button>
            <button class="btn ghost block" data-act="open" data-page="tasks" style="margin:8px 0"> 定时任务</button>
            <button class="btn ghost block" data-act="open" data-page="browser">内置浏览器</button>
            <button class="btn ghost block" data-act="open" data-page="skills" style="margin:8px 0"> 技能库</button>
            <button class="btn ghost block" data-act="open" data-page="mindmap"> 协作视图</button>
            <button class="btn ghost block" data-act="open" data-page="3d" style="margin:8px 0">3D 工坊</button>
            <button class="btn ghost block" data-act="open" data-page="workbuddy">WorkBuddy 绑定</button>
          </div>

          <div class="card mt12">
            <div class="card-title"> 模拟环境</div>
            <button class="btn ghost block" data-act="open-env" data-kind="win" style="margin-bottom:8px"> Windows 桌面</button>
            <button class="btn ghost block" data-act="open-env" data-kind="android" style="margin-bottom:8px"> 安卓环境</button>
            <div class="row" style="gap:8px">
              <button class="btn gray sm" data-act="set-orient" data-mode="portrait" style="flex:1"> 竖屏</button>
              <button class="btn gray sm" data-act="set-orient" data-mode="landscape" style="flex:1"> 横屏</button>
            </div>
            <div class="hint" style="margin-top:6px">横屏下模拟环境自动切换为宽屏布局；安装 APK 后横屏会真实旋转屏幕。</div>
          </div>

          <div class="card mt12">
            <div class="card-title">数据</div>
            <div class="kv"><span class="k">主智能体</span><span class="v">${Agents.all().length} 个</span></div>
            <div class="kv"><span class="k">已创造子智能体</span><span class="v">${DynamicAgents.all().length} 个</span></div>
            <div class="kv"><span class="k">技能</span><span class="v">${Skills.installed().length} / ${Skills.all().length} 已安装</span></div>
            <div class="kv"><span class="k">派遣记录</span><span class="v">${SpawnLog.all().length} 条</span></div>
            <div class="kv"><span class="k">会话</span><span class="v">${Chats.all().length} 个</span></div>
            <div class="kv"><span class="k">工作流</span><span class="v">${Workflows.all().length} 个</span></div>
            <div class="kv"><span class="k">定时任务</span><span class="v">${Tasks.all().length} 个</span></div>
            <div class="kv"><span class="k">媒体记录</span><span class="v">${Media.all().length} 条</span></div>
            <button class="btn ghost block mt12" data-act="open" data-page="data">数据管理（导出 / 导入 / 重置）→</button>
          </div>

          <div class="card mt12">
            <div class="card-title">ℹ关于</div>
            <div class="kv"><span class="k">版本</span><span class="v">AgentHub 2.3.1</span></div>
            <div class="kv"><span class="k">运行环境</span><span class="v">${Native.available ? '安卓 APK（原生 WebView）' : 'Web 预览'}</span></div>
            <div class="muted-sm mt8" style="line-height:1.7">所有数据仅保存在本机。模型 API 由你自行配置，请求直连你所填写的服务商。</div>
            <button class="btn ghost block mt12" data-act="open" data-page="about">查看功能说明 →</button>
          </div>
        </div>
      </div>`;
  }

  /* ---------- 数据管理子页 ---------- */
  function renderData(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-title">导出全部数据</div>
        <div class="hint" style="margin-bottom:10px">导出模型配置、智能体、会话、工作流、任务与设置为一个 JSON 文件（含密钥，请妥善保管）。</div>
        <button class="btn ghost block" data-act="export-all">导出到本地</button>
      </div>
      <div class="card mt12">
        <div class="card-title">导入数据</div>
        <div class="hint" style="margin-bottom:10px">从之前导出的 JSON 恢复（会覆盖当前数据）。</div>
        <button class="btn ghost block" data-act="import-all">选择文件导入</button>
      </div>
      <div class="card mt12">
        <div class="card-title">!重置</div>
        <div class="hint" style="margin-bottom:10px">清空所有本地数据并恢复初始状态，不可恢复。</div>
        <button class="btn danger block" data-act="reset-all">重置全部数据</button>
      </div>`;
  }

  /* ---------- 关于子页 ---------- */
  function renderAbout(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-title"> AgentHub 2.3.1</div>
        <div class="muted" style="font-size:13px;line-height:1.8">
          一款完全自定义的安卓智能体工作台：模型全部由你自己配置，所有数据只留在本机。<br><br>
          <b>核心能力</b><br>
          · 自定义模型：OpenAI 兼容 / Anthropic 双协议，内置 17+ 对话平台、7+ 图片平台、8+ 视频平台预设<br>
          · 智能体：单主智能体自由对话，按需<b>自繁衍子智能体</b>（最多 6 个并行、可再繁衍孙级），随时告诉你它在干什么<br>
          · 技能系统：23 个内置技能（网页设计/3D/前端/审查/数据/文案/调研/插画/视频/架构/CSS 设计/SVG 插画/游戏开发/编译构建/测试/数据可视化/新媒体/Prompt/数据库/API 设计/安全审计/DevOps/文档），可安装、可自写<br>
          · 媒体工坊：图片/视频生成，可选分辨率、比例、时长<br>
          · 万能预览：网页界面（手机/桌面框）、代码/Markdown/JSON/CSV、图片音视频、OBJ/STL/Three.js 3D 场景（环境反射 + ACES 色调映射 + 软阴影，可切换陶瓷/金属/玻璃/哑光材质）；CSS 样式效果预览并可注入 HTML；SVG 渲染/代码双视图<br>
          · 编译工具：Agent 可编译检查并运行 JS（真实沙箱执行）、校验 HTML/CSS/JSON、结构检查 C/Python/Java 等，支持批量编译目录<br>
          · 深度思考：回复前展示可展开查看的「思考过程」卡片；非中文思考自动翻译为中文（带「已自动翻译」标记），可在设置中开关<br>
          · 协作视图：思维导图式实时查看多智能体分工与产出<br>
          · 画布工作流：拖拽节点 + 连线，拓扑执行，支持导入导出<br>
          · 定时任务：一次 / 每天 / 每周 / 间隔，应用内调度<br>
          · 内置浏览器：多引擎搜索（Bing/DuckDuckGo/百度回退），Agent 可远程操控<br>
          · WorkBuddy 绑定：浏览器登录后同步任务实况、调用专家团<br>
          · 模拟环境：Windows 桌面（终端/记事本/资源管理器/计算器/浏览器/程序运行器，可运行 .exe）+ 安卓原生环境，支持横屏<br>
          · 文件：虚拟磁盘 + SAF 保存到你自己选择的文件夹
        </div>
      </div>
      <div class="card mt12">
        <div class="card-title"> Agent 工具协议</div>
        <div class="hint" style="margin-bottom:8px">主智能体在回复中输出以下格式即可调用工具或派遣子智能体（多个行动并行执行）：</div>
        <div class="list-clean">
          ${window.AgentTools.TOOLS.map(t => `<div class="muted-sm" style="padding:3px 0"><code class="inline-code">[[ACTION:${escapeHtml(t.name)}|...]]</code></div>`).join('')}
        </div>
        <div class="hint" style="margin-top:10px">派遣示例：<code class="inline-code">[[ACTION:spawn|编程助手|写一个贪吃蛇并存到 /home/agent/workspace/game.py]]</code>；同一条回复里写多个 spawn 即并行派工。</div>
      </div>`;
  }

  /* ---------- 渲染入口 ---------- */
  function render(container, opts = {}) {
    const sub = opts.page || (window.App.stack.length ? window.App.stack[window.App.stack.length - 1].page : null);
    if (sub === 'data') renderData(container);
    else if (sub === 'about') renderAbout(container);
    else renderHome(container);
  }

  /* ---------- 事件 ---------- */
  async function onAction(act, el, container) {
    if (act === 'open') { window.App.push(el.dataset.page); return; }
    if (act === 'toggle-deep') { Store.Settings.set({ deepThink: el.checked }); toast(el.checked ? '已开启深度思考' : '已关闭深度思考', 'ok'); return; }
    if (act === 'toggle-thzh') { Store.Settings.set({ thinkAutoZh: el.checked }); toast(el.checked ? '思考将自动翻译为中文' : '已关闭自动翻译', 'ok'); return; }
    if (act === 'toggle-keepalive') {
      Store.Settings.set({ keepAlive: el.checked }); Store.save();
      if (el.checked) { if (Native.available) Native.startKeepAlive(); toast('已开启后台常驻', 'ok'); }
      else { if (Native.available) Native.stopKeepAlive(); toast('已关闭后台常驻', 'ok'); }
      return;
    }
    if (act === 'open-env') { window.App.openEnv(el.dataset.kind); return; }
    if (act === 'set-orient') {
      const mode = el.dataset.mode;
      Store.state.orientation = mode;
      Store.save();
      const N = window.UI.Native;
      if (N.available) N.setOrientation(mode);
      toast(mode === 'landscape' ? '已切换横屏' : '已切换竖屏', 'ok');
      return;
    }
    if (act === 'pick-dir') {
      const r = await Native.pickFolder();
      if (r && r.__unsupported) { toast('请在安装的 APK 中使用', 'err'); return; }
      if (r && r.uri) { SaveDir.set(r.uri, r.name || '已选择文件夹'); toast('已设置保存文件夹 ✓', 'ok'); window.App.refresh(); }
      return;
    }
    if (act === 'clear-dir') { SaveDir.clear(); window.App.refresh(); toast('已清除保存文件夹'); return; }
    if (act === 'export-all') {
      const data = JSON.stringify(Store.state, null, 2);
      const dir = SaveDir.get();
      if (Native.available && dir) {
        const r = await Native.saveToFolder('agenthub-backup-' + new Date().toISOString().slice(0, 10) + '.json', data);
        if (r && r.ok) { toast('✓ 已导出到本地文件夹', 'ok'); return; }
        if (r && r.__unsupported) { /* 回落下载 */ }
        else { toast('导出失败：' + (r.__error || ''), 'err'); return; }
      }
      download('agenthub-backup.json', data, 'application/json');
      toast('已导出（浏览器下载）');
      return;
    }
    if (act === 'import-all') {
      const r = await Native.readPickedFile();
      if (r && r.__unsupported) {
        sheet({
          title: '导入数据',
          body: `<div class="hint" style="margin-bottom:8px">Web 预览环境：请粘贴导出的 JSON</div>
                 <textarea class="textarea" id="imp-all" rows="8"></textarea>`,
          actions: [
            { text: '取消', cls: 'gray' },
            { text: '导入', cls: 'primary', onClick: (m, close) => {
              try {
                const obj = JSON.parse(m.querySelector('#imp-all').value);
                if (!obj || typeof obj !== 'object') throw new Error('格式不正确');
                Object.keys(Store.state).forEach(k => delete Store.state[k]);
                Object.assign(Store.state, obj);
                Store.save();
                toast('✓ 导入成功', 'ok');
                close(null);
                window.App.refresh();
              } catch (e) { toast('✗ ' + e.message, 'err'); }
            } }
          ]
        });
        return;
      }
      if (r && r.content) {
        const ok = await confirmDialog({ title: '导入数据', body: '导入将覆盖当前所有数据，确定继续？', okText: '导入', danger: true });
        if (!ok) return;
        try {
          const obj = JSON.parse(r.content);
          Object.keys(Store.state).forEach(k => delete Store.state[k]);
          Object.assign(Store.state, obj);
          Store.save();
          toast('✓ 导入成功', 'ok');
          window.App.refresh();
        } catch (e) { toast('✗ 导入失败：' + e.message, 'err'); }
      } else if (r) {
        toast('读取失败：' + (r.__error || ''), 'err');
      }
      return;
    }
    if (act === 'reset-all') {
      const ok = await confirmDialog({ title: '重置全部数据', body: '将清空模型、智能体、会话、工作流等所有本地数据，且不可恢复。确定吗？', okText: '全部重置', danger: true });
      if (!ok) return;
      Store.reset();
      toast('已重置，重启应用后生效', 'ok');
      setTimeout(() => window.App.refresh(), 300);
      return;
    }
  }

  window.SettingsPage = { render, onAction };
})();
