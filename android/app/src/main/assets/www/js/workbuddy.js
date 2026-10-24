/* ============ WorkBuddy 绑定：内置浏览器登录 + 任务实况同步 + 专家团 ============ */
(function () {
  const { $, $$, toast, sheet, confirmDialog, icons, escapeHtml, Native } = window.UI;
  const { WorkBuddy } = window.Store;

  const DEFAULT_TASK_SEL = {
    phoneInput: 'input[type="tel"], input[name*="phone" i], input[placeholder*="手机" i]',
    codeInput: 'input[name*="code" i], input[placeholder*="验证码" i]',
    getCodeText: '获取验证码',
    loginText: '登录',
    taskList: 'main, .task-list, [class*="task" i]',
    loggedOutText: '登录'
  };
  const DEFAULT_EXPERT_SEL = {
    expertList: 'main, .expert-list, [class*="expert" i]',
    expertItem: 'a'
  };

  let step = 0;           // 0 未开始 1 输手机号 2 输验证码 3 已绑定
  let phone = '';
  let code = '';
  let syncing = false;

  function sel() {
    const wb = WorkBuddy.get();
    return Object.assign({}, DEFAULT_TASK_SEL, wb.taskSelectors || {});
  }
  function expertSel() {
    const wb = WorkBuddy.get();
    return Object.assign({}, DEFAULT_EXPERT_SEL, wb.expertSelectors || {});
  }

  /* ---------- 渲染 ---------- */
  function render(container) {
    const wb = WorkBuddy.get();
    if (wb.bound) step = 3;
    container.innerHTML = `
      ${step === 0 ? `
        <div class="card">
          <div class="card-title">绑定 WorkBuddy</div>
          <div class="muted" style="font-size:13px;line-height:1.7">
            通过内置浏览器完成绑定：<br>
            1. 应用会自动打开 ${escapeHtml(wb.siteUrl)}<br>
            2. 你告诉智能体手机号，由应用自动填入<br>
            3. 应用点击「获取验证码」，你把验证码告诉智能体<br>
            4. 应用自动填入并登录<br>
            5. 之后即可同步任务实况、调用专家团（UI 保持 AgentHub 自有风格）
          </div>
          <div class="field mt12">
            <label>WorkBuddy 网址</label>
            <input class="input" id="wb-url" value="${escapeHtml(wb.siteUrl)}">
          </div>
          <button class="btn primary block" data-act="wb-start"> 打开并开始绑定</button>
        </div>
        <div class="card mt12">
          <div class="card-title"> 选择器配置（高级）</div>
          <div class="hint" style="margin-bottom:8px">WorkBuddy 页面结构如有变化，可在此调整自动填表所用的选择器与按钮文本。</div>
          <button class="btn gray sm" data-act="wb-sel">配置选择器</button>
        </div>
      ` : ''}

      ${step === 1 ? `
        <div class="card">
          <div class="card-title"> 第一步：输入手机号</div>
          <div class="hint" style="margin-bottom:8px">浏览器已打开 ${escapeHtml(WorkBuddy.get().siteUrl)}，请确认停在登录页，然后输入手机号（由应用自动填入页面）。</div>
          <div class="field"><label>手机号</label>
            <input class="input" id="wb-phone" type="tel" maxlength="11" placeholder="请输入手机号" value="${escapeHtml(phone)}"></div>
          <button class="btn primary block" data-act="wb-phone-ok">填入并获取验证码</button>
          <button class="btn gray block mt8" data-act="wb-restart">重新开始</button>
        </div>
      ` : ''}

      ${step === 2 ? `
        <div class="card">
          <div class="card-title">第二步：输入验证码</div>
          <div class="hint" style="margin-bottom:8px">已点击「${escapeHtml(sel().getCodeText)}」，请查收短信，把验证码填在这里（由应用自动填入并登录）。</div>
          <div class="field"><label>验证码</label>
            <input class="input" id="wb-code" inputmode="numeric" maxlength="8" placeholder="请输入验证码" value="${escapeHtml(code)}"></div>
          <button class="btn primary block" data-act="wb-code-ok">填入并登录</button>
          <button class="btn gray block mt8" data-act="wb-restart">重新开始</button>
        </div>
      ` : ''}

      ${step === 3 ? `
        <div class="card">
          <div class="card-title">✓ 已绑定 ${escapeHtml(wb.phoneMask || '')}</div>
          <div class="row" style="gap:8px">
            <button class="btn ghost sm" data-act="wb-open">打开 WorkBuddy</button>
            <button class="btn danger sm" data-act="wb-unbind">解除绑定</button>
          </div>
        </div>

        <div class="card mt12">
          <div class="card-title">任务实况同步<span class="muted-sm" style="font-weight:400">界面自有，仅同步任务状态</span></div>
          <div class="hint" style="margin-bottom:8px">从浏览器当前页面提取任务列表，展示在下方（数据仅存本机）。</div>
          <button class="btn ghost sm" data-act="wb-sync" ${syncing ? 'disabled' : ''}>${syncing ? '同步中…' : '立即同步任务实况'}</button>
          <div id="wb-snapshot" class="mt12"></div>
        </div>

        <div class="card mt12">
          <div class="card-title">专家团 / 专家技能</div>
          <div class="row" style="gap:8px;margin-bottom:10px">
            <button class="btn ghost sm" data-act="wb-experts-sync">从页面同步专家</button>
            <button class="btn ghost sm" data-act="wb-expert-add">手动添加</button>
          </div>
          <div id="wb-experts"></div>
        </div>
      ` : ''}
    `;
    if (step === 3) {
      drawSnapshot(container);
      drawExperts(container);
    }
  }

  function drawSnapshot(container) {
    const box = container.querySelector('#wb-snapshot');
    if (!box) return;
    const snap = WorkBuddy.get().taskSnapshot;
    if (!snap) { box.innerHTML = '<div class="muted-sm">尚未同步。打开 WorkBuddy 任务页后点击「立即同步」。</div>'; return; }
    box.innerHTML = `
      <div class="kv"><span class="k">同步时间</span><span class="v">${new Date(snap.at).toLocaleString('zh-CN', { hour12: false })}</span></div>
      <div class="kv"><span class="k">来源</span><span class="v" style="font-size:11px">${escapeHtml((snap.url || '').slice(0, 60))}</span></div>
      <div style="font-size:12.5px;line-height:1.65;max-height:260px;overflow:auto;margin-top:8px;white-space:pre-wrap;background:var(--surface-2);border-radius:10px;padding:10px">${escapeHtml((snap.text || '').slice(0, 3000))}</div>`;
  }

  function drawExperts(container) {
    const box = container.querySelector('#wb-experts');
    if (!box) return;
    const list = WorkBuddy.get().experts;
    if (!list.length) { box.innerHTML = '<div class="muted-sm">暂无专家。可在 WorkBuddy 专家页点击「从页面同步专家」，或手动添加。</div>'; return; }
    box.innerHTML = `<div class="list-clean">${list.map(e => `
      <div class="list-item" style="margin:0 0 8px">
        <div class="li-icon">${icons[e.icon] || icons.brain}</div>
        <div class="li-main">
          <div class="li-title">${escapeHtml(e.name)}</div>
          <div class="li-sub">${escapeHtml((e.desc || '').slice(0, 60))}</div>
        </div>
        <button class="btn ghost sm" data-act="wb-expert-call" data-id="${escapeHtml(e.id)}">调用</button>
        <button class="icon-btn" data-act="wb-expert-del" data-id="${escapeHtml(e.id)}" style="color:var(--danger)">${icons.trash}</button>
      </div>`).join('')}</div>`;
  }

  /* ---------- 绑定流程 ---------- */
  async function startBind(container) {
    const urlEl = container.querySelector('#wb-url');
    const url = (urlEl ? urlEl.value.trim() : '') || 'https://workbuddy.cn';
    WorkBuddy.get().siteUrl = url;
    // 修正协议
    const full = /^https?:\/\//.test(url) ? url : 'https://' + url;
    WorkBuddy.get().siteUrl = full;
    Store.emit();
    await window.Browser.open(full);
    step = 1;
    render(container);
    toast('浏览器已打开，请输入手机号', 'ok');
  }

  async function submitPhone(container) {
    const el = container.querySelector('#wb-phone');
    phone = (el ? el.value.trim() : '');
    if (!/^1\d{10}$/.test(phone)) { toast('请输入正确的 11 位手机号', 'err'); return; }
    const s = sel();
    try {
      const fill = await window.Browser.cmd('fill', { selector: s.phoneInput, value: phone });
      if (fill && fill.ok === false && !fill.__unsupported) toast('!未找到手机号输入框：' + fill.error + '（可手动输入后继续）', 'err');
      const click = await window.Browser.cmd('clickText', { text: s.getCodeText });
      if (click && click.ok === false && !click.__unsupported) toast('!未找到「' + s.getCodeText + '」按钮，请手动点击', 'err');
      step = 2;
      render(container);
      toast('已请求验证码，请查收短信', 'ok');
    } catch (e) {
      toast('浏览器操作失败：' + (e.message || e) + '，可手动完成', 'err');
      step = 2;
      render(container);
    }
  }

  async function submitCode(container) {
    const el = container.querySelector('#wb-code');
    code = (el ? el.value.trim() : '');
    if (!code) { toast('请输入验证码', 'err'); return; }
    const s = sel();
    try {
      const fill = await window.Browser.cmd('fill', { selector: s.codeInput, value: code });
      if (fill && fill.ok === false && !fill.__unsupported) toast('!未找到验证码输入框，请手动输入', 'err');
      const click = await window.Browser.cmd('clickText', { text: s.loginText });
      if (click && click.ok === false && !click.__unsupported) toast('!未找到「' + s.loginText + '」按钮，请手动点击', 'err');
      toast('正在等待登录结果…');
      await new Promise(r => setTimeout(r, 4000));
      // 登录校验：页面不再显示登录入口即视为成功
      let ok = true;
      try {
        const r = await window.Browser.cmd('extract', { selector: 'body', max: 800 }, 20000);
        if (r && r.ok) ok = !(r.text || '').includes(s.loggedOutText);
      } catch (e) { /* 校验失败不阻塞，按成功处理并允许用户解除绑定 */ }
      if (ok) {
        WorkBuddy.bind(phone.slice(0, 3) + '****' + phone.slice(7));
        step = 3;
        render(container);
        toast('✓ WorkBuddy 绑定成功', 'ok');
      } else {
        toast('!尚未检测到登录成功，请确认验证码是否正确；成功后点此重试', 'err');
      }
    } catch (e) {
      toast('浏览器操作失败：' + (e.message || e), 'err');
    }
  }

  /* ---------- 任务实况同步 ---------- */
  async function syncTasks(container) {
    syncing = true; render(container);
    try {
      const r = await window.Browser.cmd('extract', { selector: sel().taskList, max: 6000 }, 45000);
      if (r && r.ok) {
        WorkBuddy.setSnapshot({ text: r.text, url: r.url, at: Date.now() });
        toast('✓ 任务实况已同步', 'ok');
      } else if (r && r.__unsupported) {
        toast('Web 预览环境无原生浏览器', 'err');
      } else {
        toast('同步失败：' + ((r && r.error) || '未知错误'), 'err');
      }
    } catch (e) {
      toast('同步失败：' + (e.message || e), 'err');
    }
    syncing = false;
    render(container);
  }

  /* ---------- 专家团 ---------- */
  async function syncExperts(container) {
    try {
      const es = expertSel();
      const r = await window.Browser.cmd('extract', { selector: es.expertList, max: 4000 }, 45000);
      if (r && r.ok && r.links && r.links.length) {
        r.links.forEach(l => WorkBuddy.addExpert({ id: l.h, name: l.t, desc: l.h, icon: 'brain' }));
        toast(`✓ 已同步 ${r.links.length} 个条目`, 'ok');
      } else if (r && r.__unsupported) {
        toast('Web 预览环境无原生浏览器', 'err');
      } else {
        toast('未提取到专家条目', 'err');
      }
    } catch (e) { toast('同步失败：' + (e.message || e), 'err'); }
    render(container);
  }

  async function callExpert(container, id) {
    const e = WorkBuddy.get().experts.find(x => x.id === id);
    if (!e) return;
    await window.Browser.open(e.id);
    toast('已在浏览器打开：' + e.name, 'ok');
  }

  /* ---------- 选择器配置 ---------- */
  function selectorSheet() {
    const wb = WorkBuddy.get();
    const t = Object.assign({}, DEFAULT_TASK_SEL, wb.taskSelectors || {});
    const x = Object.assign({}, DEFAULT_EXPERT_SEL, wb.expertSelectors || {});
    sheet({
      title: '选择器配置',
      body: `
        <div class="card-title">登录相关</div>
        <div class="field"><label>手机号输入框选择器</label><input class="input" id="s-phone" value="${escapeHtml(t.phoneInput)}"></div>
        <div class="field"><label>验证码输入框选择器</label><input class="input" id="s-code" value="${escapeHtml(t.codeInput)}"></div>
        <div class="field"><label>获取验证码按钮文本</label><input class="input" id="s-getcode" value="${escapeHtml(t.getCodeText)}"></div>
        <div class="field"><label>登录按钮文本</label><input class="input" id="s-login" value="${escapeHtml(t.loginText)}"></div>
        <div class="card-title mt12">任务实况</div>
        <div class="field"><label>任务列表容器选择器</label><input class="input" id="s-task" value="${escapeHtml(t.taskList)}"></div>
        <div class="card-title mt12">专家团</div>
        <div class="field"><label>专家列表容器选择器</label><input class="input" id="s-experts" value="${escapeHtml(x.expertList)}"></div>
        <div class="hint">修改后立即生效，仅保存在本机。</div>`,
      actions: [
        { text: '恢复默认', cls: 'gray', onClick: (m, close) => {
          WorkBuddy.setSelectors(null, null);
          toast('已恢复默认选择器', 'ok');
          close(null); window.App.refresh();
        } },
        { text: '保存', cls: 'primary', onClick: (m, close) => {
          WorkBuddy.setSelectors({
            phoneInput: m.querySelector('#s-phone').value.trim() || DEFAULT_TASK_SEL.phoneInput,
            codeInput: m.querySelector('#s-code').value.trim() || DEFAULT_TASK_SEL.codeInput,
            getCodeText: m.querySelector('#s-getcode').value.trim() || DEFAULT_TASK_SEL.getCodeText,
            loginText: m.querySelector('#s-login').value.trim() || DEFAULT_TASK_SEL.loginText,
            taskList: m.querySelector('#s-task').value.trim() || DEFAULT_TASK_SEL.taskList
          }, {
            expertList: m.querySelector('#s-experts').value.trim() || DEFAULT_EXPERT_SEL.expertList
          });
          toast('选择器已保存 ✓', 'ok');
          close(null); window.App.refresh();
        } }
      ]
    });
  }

  /* ---------- 事件 ---------- */
  async function onAction(act, el, container) {
    if (act === 'wb-start') return startBind(container);
    if (act === 'wb-restart') { step = 1; phone = ''; code = ''; render(container); return; }
    if (act === 'wb-phone-ok') return submitPhone(container);
    if (act === 'wb-code-ok') return submitCode(container);
    if (act === 'wb-open') {
      await window.Browser.open(WorkBuddy.get().siteUrl);
      return;
    }
    if (act === 'wb-unbind') {
      const ok = await confirmDialog({ title: '解除绑定', body: '解除后任务实况与专家列表将被清除，确定吗？', okText: '解除', danger: true });
      if (ok) { WorkBuddy.unbind(); step = 0; render(container); toast('已解除绑定'); }
      return;
    }
    if (act === 'wb-sync') return syncTasks(container);
    if (act === 'wb-experts-sync') return syncExperts(container);
    if (act === 'wb-expert-add') {
      sheet({
        title: '添加专家',
        body: `<div class="field"><label>名称</label><input class="input" id="e-name" placeholder="例如：文案专家"></div>
               <div class="field"><label>链接（调用时在浏览器打开）</label><input class="input" id="e-link" placeholder="https://workbuddy.cn/..."></div>`,
        actions: [
          { text: '取消', cls: 'gray' },
          { text: '添加', cls: 'primary', onClick: (m, close) => {
            const name = m.querySelector('#e-name').value.trim();
            const link = m.querySelector('#e-link').value.trim();
            if (!name || !link) { toast('请填写名称和链接', 'err'); return; }
            WorkBuddy.addExpert({ id: link, name, desc: link, icon: 'brain' });
            toast('已添加 ✓', 'ok');
            close(null); render(container);
          } }
        ]
      });
      return;
    }
    if (act === 'wb-expert-call') return callExpert(container, el.dataset.id);
    if (act === 'wb-expert-del') {
      const list = WorkBuddy.get().experts.filter(x => x.id !== el.dataset.id);
      WorkBuddy.setExperts(list);
      render(container);
      return;
    }
    if (act === 'wb-sel') return selectorSheet();
  }

  window.WorkBuddyPage = { render, onAction };
})();
