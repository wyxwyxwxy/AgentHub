/* ============ 思维导图：多智能体协作实时视图（v2.2） ============
 * 根节点 = 主智能体；分支 = 对话中 spawn 出的子智能体（含孙级）。
 * 订阅 SubAgents 事件总线实时刷新，并附活动流日志。
 */
(function () {
  const { $, $$, toast, sheet, escapeHtml, icons } = window.UI;
  const { DynamicAgents, SpawnLog } = window.Store;

  /* 节点：{id, label, task, status, depth, parent, brief, err, at} */
  let nodes = [];
  let events = [];        // 活动流 {icon, text, at}
  let container = null;
  let raf = 0;

  const STATUS_TEXT = { running: '执行中', done: '已完成', error: '失败', stopped: '已停止', idle: '待命' };
  const STATUS_COLOR = { running: 'var(--green)', done: '#16a34a', error: '#ef4444', stopped: '#94a3b8', idle: '#94a3b8' };

  function rootId() { return 'root'; }

  /* ---------- 布局 ---------- */
  function layout() {
    const W = 580;                       // 固定画布宽，外层横向滚动适配手机
    const byDepth = [[], [], []];
    nodes.forEach(n => { if (n.depth <= 2) byDepth[n.depth].push(n); });
    const colX = [70, 250, 450];
    const rowH = 64;
    byDepth.forEach((col, d) => {
      const totalH = col.length * rowH;
      const startY = Math.max(34, (Math.max(totalH + 68, 320) - totalH) / 2);
      col.forEach((n, i) => { n.x = colX[d]; n.y = startY + i * rowH; });
    });
    const maxY = Math.max(...nodes.map(n => n.y), 280) + 40;
    return { W, H: Math.max(320, maxY), colX };
  }

  function svg() {
    const { W, H, colX } = layout();
    const parts = [];
    parts.push(`<defs>
      <linearGradient id="mmRootGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#22c55e"/><stop offset="1" stop-color="#15803d"/>
      </linearGradient>
    </defs>`);
    // 连线
    nodes.forEach(n => {
      if (n.depth === 0) return;
      const p = nodes.find(x => x.id === n.parent);
      if (!p) return;
      const x1 = p.x + 46, y1 = p.y, x2 = n.x - 46, y2 = n.y;
      const mx = (x1 + x2) / 2;
      const cls = 'mm-link' + (n.status === 'running' ? ' active' : '');
      parts.push(`<path class="${cls}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`);
    });
    // 节点
    nodes.forEach(n => {
      const isRoot = n.depth === 0;
      const color = isRoot ? '#16a34a' : (STATUS_COLOR[n.status] || '#94a3b8');
      const label = escapeHtml(n.label.length > 8 ? n.label.slice(0, 8) + '…' : n.label);
      const sub = isRoot ? '主智能体' : STATUS_TEXT[n.status] || n.status;
      parts.push(`<g class="mm-node ${isRoot ? 'mm-root' : 'mm-branch'} ${n.status === 'running' ? 'running' : ''}" data-mm="${n.id}" transform="translate(${n.x},${n.y})">
        <circle r="${isRoot ? 40 : 26}"/>
        ${isRoot
          ? `<text y="6" text-anchor="middle" font-size="22" font-weight="800" fill="#ffffff">主</text>`
          : `<text y="-2" text-anchor="middle" font-size="11" font-weight="700" fill="${color}">${label}</text>
             <text y="11" text-anchor="middle" font-size="8.5" fill="#94a3b8">${sub}</text>`}
        ${n.status === 'running' ? `<circle r="${isRoot ? 40 : 26}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 3" opacity=".7">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="4s" repeatCount="indefinite"/></circle>` : ''}
      </g>`);
    });
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;max-width:100%">${parts.join('')}</svg>`;
  }

  /* ---------- 渲染 ---------- */
  function paint() {
    if (!container) return;
    const running = nodes.filter(n => n.status === 'running').length;
    const svgBox = container.querySelector('#mm-canvas');
    if (svgBox) svgBox.innerHTML = svg();
    const stat = container.querySelector('#mm-stat');
    if (stat) stat.textContent = `运行中 ${running} · 共 ${nodes.length - 1} 个`;
    const flow = container.querySelector('#mm-flow');
    if (flow) {
      flow.innerHTML = events.slice(0, 40).map(e => `
        <div class="list-row" style="display:flex;gap:9px;align-items:flex-start;padding:9px 11px;border-radius:11px;margin-bottom:8px">
          <span style="flex:none;font-size:14px">${e.icon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;line-height:1.5;word-break:break-all">${e.text}</div>
            <div class="muted-sm">${new Date(e.at).toLocaleTimeString('zh-CN', { hour12: false })}</div>
          </div>
        </div>`).join('') || '<div class="muted" style="padding:10px 2px">暂无活动</div>';
    }
    // 节点点击
    container.querySelectorAll('[data-mm]').forEach(g => {
      g.onclick = () => showNode(g.dataset.mm);
    });
  }
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; paint(); });
  }
  function logEvent(icon, html) {
    events.unshift({ icon, text: html, at: Date.now() });
    if (events.length > 80) events.length = 80;
    schedule();
  }

  /* ---------- 事件总线订阅 ---------- */
  function onSpawnStart(e) {
    const id = e.id || ('sp-' + e.role);
    const exist = nodes.find(n => n.id === id);
    if (!exist) {
      const parentId = (e.depth || 1) > 1 ? findRecentRunning() : rootId();
      nodes.push({ id, label: e.role || '子智能体', task: e.task || '', status: 'running', depth: e.depth || 1, parent: parentId, brief: '', err: '', at: Date.now() });
    } else { exist.status = 'running'; exist.at = Date.now(); }
    logEvent('●', `创造 <b>${escapeHtml(e.role || '子智能体')}</b> · ${escapeHtml(String(e.task || '').slice(0, 60))}`);
    schedule();
  }
  function onSpawnStatus(e) {
    logEvent('●', `<b>${escapeHtml((nodes.find(n => n.id === e.id) || {}).label || '子智能体')}</b> ${escapeHtml(e.text || '')}`);
  }
  function onSpawnDelta(e) {
    const n = nodes.find(x => x.id === e.id);
    if (n) { n.brief = String(e.full || '').slice(-160); schedule(); }
  }
  function onSpawnDone(e) {
    const n = nodes.find(x => x.id === e.id);
    if (n) {
      n.status = e.ok ? 'done' : (e.aborted ? 'stopped' : 'error');
      n.err = e.error || '';
      if (e.text) n.brief = String(e.text).slice(-200);
    }
    logEvent(e.ok ? '✓' : e.aborted ? '■' : '!', `<b>${escapeHtml(e.role || (n && n.label) || '子智能体')}</b> ${e.ok ? '完成，结果已交回主智能体' : e.aborted ? '已停止' : '失败：' + escapeHtml(String(e.error || '').slice(0, 60))}`);
    schedule();
  }
  function findRecentRunning() {
    for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i].status === 'running' && nodes[i].depth >= 1) return nodes[i].id;
    return rootId();
  }

  /* ---------- 节点详情 ---------- */
  function showNode(id) {
    const n = nodes.find(x => x.id === id);
    if (!n) return;
    sheet({
      title: n.depth === 0 ? '主智能体' : n.label,
      body: `
        ${n.depth === 0 ? `
          <div class="muted">唯一的主智能体，所有子智能体都由它在对话中按需创造。当前分支 ${nodes.length - 1} 个。</div>
          <div class="code-block" style="margin-top:10px">[[ACTION:spawn|角色名|任务描述]]</div>
        ` : `
          <div class="row" style="gap:8px;margin-bottom:10px">
            <span class="chip active" style="pointer-events:none">${STATUS_TEXT[n.status] || n.status}</span>
            <span class="chip" style="pointer-events:none">第 ${n.depth} 层</span>
          </div>
          <div class="field"><label>任务</label><div class="code-block">${escapeHtml(n.task || '')}</div></div>
          <div class="field"><label>最近输出</label><div class="code-block" style="white-space:pre-wrap">${escapeHtml(n.brief || n.err || '（暂无输出）')}</div></div>
        `}`,
      actions: [{ text: '关闭', cls: 'gray' }]
    });
  }

  /* ---------- 页面 ---------- */
  function render(c) {
    container = c;
    // 从已有动态智能体 + 历史 spawn 记录重建静态视图
    nodes = [{ id: rootId(), label: '主智能体', status: 'done', depth: 0, parent: null, task: '', brief: '', at: Date.now() }];
    DynamicAgents.all().forEach((a, i) => {
      nodes.push({ id: a.id, label: a.name, task: a.prompt || '', status: 'idle', depth: 1, parent: rootId(), brief: '', at: a.lastAt || Date.now() });
    });
    SpawnLog.all().slice(0, 20).forEach(l => {
      const n = nodes.find(x => x.label === l.role);
      if (n) { n.status = l.status === 'running' ? 'running' : l.status === 'error' ? 'error' : 'done'; }
    });
    events = SpawnLog.all().slice(0, 30).map(l => ({
      icon: l.status === 'error' ? '!' : l.status === 'running' ? '…' : '✓',
      text: `<b>${escapeHtml(l.role || '子智能体')}</b> ${escapeHtml(String(l.task || '').slice(0, 60))}`,
      at: l.at
    }));
    if (!container._mmBound) {
      container._mmBound = true;
      window.SubAgents.on('spawn:start', onSpawnStart);
      window.SubAgents.on('spawn:status', onSpawnStatus);
      window.SubAgents.on('spawn:delta', onSpawnDelta);
      window.SubAgents.on('spawn:done', onSpawnDone);
    }
    c.innerHTML = `
      <div class="card">
        <div class="card-title">协作视图 <span class="muted-sm" id="mm-stat" style="font-weight:normal">运行中 0 · 共 0 个</span></div>
        <div class="muted" style="margin-bottom:8px">主智能体在中间左侧，子智能体按创造顺序向右发散；孙级再向右一层。点节点查看详情。</div>
        <div id="mm-canvas" style="overflow-x:auto;padding:6px 0">${svg()}</div>
      </div>
      <div class="card">
        <div class="card-title">活动流 <span class="muted-sm" style="font-weight:normal">实时</span></div>
        <div id="mm-flow"></div>
      </div>`;
    paint();
  }

  function onAction() { /* 思维导图无操作 */ }

  window.MindMapPage = { render, onAction };
})();
