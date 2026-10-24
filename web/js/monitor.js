/* ============ 智能体实时活动看板：实时看每个 agent 在干什么 ============ */
(function () {
  const { $, $$, toast, icons, escapeHtml } = window.UI;
  const { Store, SubAgents } = window;
  const SpawnLog = Store.SpawnLog;

  // 运行态缓存：agentId -> {role, task, status, type, text, ts}
  const map = {};
  let subs = null;

  function ensure(id, role, task) {
    if (!map[id]) map[id] = { id, role: role || '智能体', task: task || '', status: 'running', type: 'thinking', text: '', ts: Date.now() };
    return map[id];
  }

  function subscribe() {
    if (subs) return;
    subs = true;
    SubAgents.on('spawn:start', d => { const a = ensure(d.agentId || ('s' + d.id), d.role, d.task); a.status = 'running'; a.type = 'thinking'; a.role = d.role; a.task = d.task || ''; a.ts = Date.now(); renderLive(); });
    SubAgents.on('spawn:status', d => { const a = ensure(d.agentId || ('s' + d.id), d.role); a.status = 'running'; a.type = d.type || 'tool'; a.text = d.text || a.text; a.ts = Date.now(); renderLive(); });
    SubAgents.on('spawn:delta', d => { const a = map[d.agentId || ('s' + d.id)]; if (a) { a.type = 'streaming'; a.ts = Date.now(); renderLive(); } });
    SubAgents.on('spawn:done', d => { const a = ensure(d.agentId || ('s' + d.id), d.role); a.status = d.aborted ? 'stopped' : (d.ok ? 'done' : 'failed'); a.type = 'idle'; a.ts = Date.now(); renderLive(); });
    SubAgents.on('main:status', d => { const a = ensure('__main__', '主智能体', d.task || ''); a.role = '主智能体'; a.status = d.type === 'idle' ? 'done' : 'running'; a.type = d.type || 'thinking'; a.text = d.text || a.text; a.ts = Date.now(); renderLive(); });
    // 拉取已有记录，避免打开看板时空白
    (SpawnLog.all() || []).forEach(l => {
      const id = l.agentId || ('s' + l.id);
      const a = ensure(id, l.role, l.task);
      a.status = l.status || 'done'; a.type = (l.status === 'running') ? 'thinking' : 'idle'; a.text = (l.text || '').slice(0, 60);
    });
  }

  let containerRef = null;
  let timer = null;
  function renderLive() {
    if (!containerRef) return;
    const list = Object.values(map).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const body = containerRef.querySelector('#monitor-list');
    if (!body) return;
    const running = list.filter(a => a.status === 'running').length;
    containerRef.querySelector('#monitor-count').textContent = '运行中 ' + running + ' / 共 ' + list.length;
    if (!list.length) { body.innerHTML = '<div class="muted center" style="padding:30px 0">暂无活动。在对话中让主智能体创造子智能体，这里会实时显示它们的工作状态。</div>'; return; }
    body.innerHTML = list.map(a => {
      const stIcon = a.status === 'running'
        ? '<span class="mon-spin">' + icons.loading + '</span>'
        : (a.status === 'done' ? '<span class="mon-dot ok">' + icons.check + '</span>'
          : a.status === 'failed' ? '<span class="mon-dot err">' + icons.close + '</span>'
            : '<span class="mon-dot warn">' + icons.stop + '</span>');
      const typeLabel = a.type === 'streaming' ? '生成中' : a.type === 'tool' ? '调用工具' : a.type === 'thinking' ? '思考中' : '空闲';
      return `<div class="mon-item ${a.status === 'running' ? 'live' : ''}">
        <div class="mon-ic">${stIcon}</div>
        <div class="mon-main">
          <div class="mon-role">${escapeHtml(a.role)} <span class="mon-type">${typeLabel}</span></div>
          <div class="mon-task">${escapeHtml(a.task || a.text || '—')}</div>
        </div>
      </div>`;
    }).join('');
  }

  function render(container) {
    subscribe();
    containerRef = container;
    container.innerHTML = `
      <div class="page" data-page="monitor">
        <div class="page-header">
          <button class="icon-btn" data-act="pop">${icons.back}</button>
          <h1 style="font-size:16px">智能体实时活动<span class="sub" id="monitor-count">运行中 0 / 共 0</span></h1>
          <button class="icon-btn" data-act="clear-mon" title="清空已完成">${icons.trash}</button>
        </div>
        <div class="page-body">
          <div class="card" style="margin-bottom:12px">
            <div class="card-title">实时看板说明</div>
            <div class="muted" style="font-size:12.5px;line-height:1.6">主智能体派发的每个子智能体会实时出现在这里，展示其「思考中 / 生成中 / 调用工具 / 完成 / 失败」状态。最多可并行 40 个、累计创造 300 个智能体协作写作。</div>
          </div>
          <div id="monitor-list"></div>
        </div>
      </div>`;
    renderLive();
    if (timer) clearInterval(timer);
    timer = setInterval(renderLive, 1500);
  }

  async function onAction(act, el, container) {
    if (act === 'pop') { if (timer) clearInterval(timer); timer = null; containerRef = null; window.App.pop(); return; }
    if (act === 'clear-mon') {
      for (const k of Object.keys(map)) if (map[k].status !== 'running') delete map[k];
      renderLive();
    }
  }

  window.MonitorPage = { render, onAction };
})();
