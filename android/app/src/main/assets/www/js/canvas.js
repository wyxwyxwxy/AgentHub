/* ============ 画布：拖拽式工作流（节点 / 连线 / 拓扑执行） ============ */
(function () {
  const { $, $$, toast, sheet, confirmDialog, icons, escapeHtml, Native, download } = window.UI;
  const { Workflows, Models, Agents } = window.Store;

  /* ---------- 节点类型定义 ---------- */
  const NODE_TYPES = {
    start:    { name: '开始', icon: 'play', color: '#16a34a', hasIn: false, hasOut: true, desc: '工作流入口，携带初始指令' },
    agent:    { name: '智能体', icon: 'agents', color: '#0ea5e9', hasIn: true, hasOut: true, desc: '调用对话模型执行' },
    browser:  { name: '浏览器', icon: 'globe', color: '#14b8a6', hasIn: true, hasOut: true, desc: '打开网页 / 搜索' },
    image:    { name: '图片生成', icon: 'image', color: '#ec4899', hasIn: true, hasOut: true, desc: '调用图片模型' },
    video:    { name: '视频生成', icon: 'video', color: '#8b5cf6', hasIn: true, hasOut: true, desc: '调用视频模型' },
    condition:{ name: '条件', icon: 'zap', color: '#f59e0b', hasIn: true, hasOut: true, desc: '按关键词分流（真/假）' },
    output:   { name: '输出', icon: 'download', color: '#64748b', hasIn: true, hasOut: false, desc: '收集最终结果' }
  };

  let wf = null;             // 当前工作流 {id,name,nodes,edges}
  let selNode = null;        // 选中的节点 id
  let connectFrom = null;    // 连线起点 node id
  let viewport = { x: 0, y: 0, zoom: 1 };
  let running = false;
  let runAbort = null;
  let pendingCreate = null;  // 点击工具栏后待放置

  /* ---------- 工作流管理 ---------- */
  function ensureWF() {
    if (wf) return wf;
    const all = Workflows.all();
    if (all.length) wf = Workflows.get(all[0].id);
    if (!wf) wf = Workflows.add({ name: '未命名工作流', nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    viewport = wf.viewport || { x: 0, y: 0, zoom: 1 };
    return wf;
  }

  function saveWF() {
    if (!wf) return;
    Workflows.update(wf.id, { nodes: wf.nodes, edges: wf.edges, viewport });
  }

  /* ---------- 渲染 ---------- */
  function render(container) {
    ensureWF();
    const all = Workflows.all();
    container.innerHTML = `
      <div class="canvas-toolbar">
        <select class="select" id="wf-select" style="width:auto;min-width:110px;max-width:150px;padding:7px 30px 7px 10px;font-size:12.5px">
          ${all.map(w => `<option value="${w.id}" ${w.id === wf.id ? 'selected' : ''}>${escapeHtml(w.name)}</option>`).join('')}
        </select>
        <button class="chip" data-act="wf-new">＋ 新建</button>
        <button class="chip" data-act="wf-rename">重命名</button>
        <button class="chip" data-act="wf-import">导入</button>
        <button class="chip" data-act="wf-export">导出</button>
        <button class="chip" data-act="wf-del"></button>
        <span style="flex:1"></span>
        <button class="chip" data-act="zoom-out">－</button>
        <button class="chip" data-act="zoom-reset">${Math.round(viewport.zoom * 100)}%</button>
        <button class="chip" data-act="zoom-in">＋</button>
      </div>
      <div class="canvas-wrap" id="canvas-wrap">
        <svg class="canvas-edges" id="canvas-edges"></svg>
        <div id="canvas-nodes" style="position:absolute;inset:0;transform-origin:0 0"></div>
      </div>
      <div class="canvas-toolbar" style="border-top:1px solid var(--border);border-bottom:none">
        ${Object.keys(NODE_TYPES).map(t => `<button class="chip" data-act="add-node" data-type="${t}">${icons[NODE_TYPES[t].icon]} ${NODE_TYPES[t].name}</button>`).join('')}
        <span style="flex:1"></span>
        <button class="chip" data-act="run-wf" style="background:var(--green);color:#fff;border-color:var(--green)">» 运行</button>
      </div>
      <div id="canvas-inspector"></div>
      <div id="canvas-runlog"></div>`;
    drawNodes(container);
    drawEdges(container);
    bindCanvas(container);
  }

  /* ---------- 节点绘制 ---------- */
  function nodeEl(n) {
    const t = NODE_TYPES[n.type];
    const el = document.createElement('div');
    el.className = 'canvas-node' + (selNode === n.id ? ' sel' : '');
    el.style.left = n.x + 'px';
    el.style.top = n.y + 'px';
    el.dataset.id = n.id;
    el.dataset.type = n.type;
    const sub = nodeSubtitle(n);
    el.innerHTML = `
      <div class="cn-title" style="color:${t.color}">${icons[t.icon]} ${escapeHtml(n.title || t.name)}</div>
      ${sub ? `<div class="cn-sub">${escapeHtml(sub)}</div>` : ''}
      ${t.hasIn ? '<div class="cn-port in" data-port="in"></div>' : ''}
      ${t.hasOut ? '<div class="cn-port out" data-port="out"></div>' : ''}`;
    return el;
  }

  function nodeSubtitle(n) {
    const c = n.config || {};
    if (n.type === 'agent') {
      const a = Agents.get(c.agentId);
      return a ? '智能体：' + a.name : (c.prompt ? c.prompt.slice(0, 18) : '未配置');
    }
    if (n.type === 'image' || n.type === 'video') {
      const m = Models.get(c.modelId);
      return (m ? m.name : '未选模型') + (c.size ? ' · ' + c.size : '') + (c.ratio ? ' · ' + c.ratio : '') + (n.type === 'video' && c.duration ? ' · ' + c.duration + 's' : '');
    }
    if (n.type === 'browser') return c.url || c.query || '未配置';
    if (n.type === 'condition') return c.keyword ? '包含「' + c.keyword + '」' : '未配置';
    if (n.type === 'start') return c.prompt ? c.prompt.slice(0, 20) : '初始指令';
    return '';
  }

  function drawNodes(container) {
    const layer = container.querySelector('#canvas-nodes');
    layer.innerHTML = '';
    layer.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
    wf.nodes.forEach(n => layer.appendChild(nodeEl(n)));
  }

  /* ---------- 连线绘制（贝塞尔曲线） ---------- */
  function portPos(n, which) {
    const t = NODE_TYPES[n.type];
    const el = document.querySelector(`.canvas-node[data-id="${n.id}"]`);
    const w = el ? el.offsetWidth : 140;
    const h = el ? el.offsetHeight : 46;
    return which === 'out'
      ? { x: n.x + w, y: n.y + h / 2 }
      : { x: n.x, y: n.y + h / 2 };
  }

  function drawEdges(container) {
    const svg = container.querySelector('#canvas-edges');
    const wrap = container.querySelector('#canvas-wrap');
    svg.setAttribute('width', wrap.clientWidth);
    svg.setAttribute('height', wrap.clientHeight);
    let html = '';
    wf.edges.forEach(e => {
      const a = wf.nodes.find(n => n.id === e.from);
      const b = wf.nodes.find(n => n.id === e.to);
      if (!a || !b) return;
      const p1 = portPos(a, 'out'), p2 = portPos(b, 'in');
      const x1 = p1.x * viewport.zoom + viewport.x, y1 = p1.y * viewport.zoom + viewport.y;
      const x2 = p2.x * viewport.zoom + viewport.x, y2 = p2.y * viewport.zoom + viewport.y;
      const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
      const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      html += `<path d="${path}" fill="none" stroke="${e.label === 'true' ? '#16a34a' : e.label === 'false' ? '#ef4444' : '#94a3b8'}" stroke-width="2" ${e.label ? 'stroke-dasharray="6 4"' : ''}/>`;
      if (e.label) {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        html += `<text x="${mx}" y="${my - 4}" text-anchor="middle" font-size="10" fill="${e.label === 'true' ? '#16a34a' : '#ef4444'}">${e.label === 'true' ? '真' : '假'}</text>`;
      }
    });
    // 正在拉的线
    if (connectFrom) {
      const a = wf.nodes.find(n => n.id === connectFrom);
      if (a) {
        const p1 = portPos(a, 'out');
        const x1 = p1.x * viewport.zoom + viewport.x, y1 = p1.y * viewport.zoom + viewport.y;
        const x2 = (lastPointer.x - container.getBoundingClientRect().left), y2 = (lastPointer.y - container.getBoundingClientRect().top);
        html += `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="#16a34a" stroke-width="2" stroke-dasharray="5 4"/>`;
      }
    }
    svg.innerHTML = html;
  }

  /* ---------- 交互：拖拽 / 连线 / 平移 ---------- */
  let lastPointer = { x: 0, y: 0 };
  let drag = null; // {nodeId, dx, dy} | {pan}

  function toCanvasPoint(container, clientX, clientY) {
    const rect = container.querySelector('#canvas-wrap').getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom
    };
  }

  function bindCanvas(container) {
    const wrap = container.querySelector('#canvas-wrap');
    wrap.onpointerdown = (e) => {
      const port = e.target.closest('[data-port]');
      const nodeEl = e.target.closest('.canvas-node');
      if (port && port.dataset.port === 'out' && nodeEl) {
        connectFrom = nodeEl.dataset.id;
        wrap.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (nodeEl) {
        const n = wf.nodes.find(x => x.id === nodeEl.dataset.id);
        if (n) {
          selNode = n.id;
          const p = toCanvasPoint(container, e.clientX, e.clientY);
          drag = { nodeId: n.id, dx: p.x - n.x, dy: p.y - n.y };
          wrap.setPointerCapture(e.pointerId);
          renderInspector(container);
          drawNodes(container); drawEdges(container);
        }
        return;
      }
      // 空白处：平移
      drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: viewport.x, vy: viewport.y };
      selNode = null;
      renderInspector(container);
      wrap.setPointerCapture(e.pointerId);
    };
    wrap.onpointermove = (e) => {
      lastPointer = { x: e.clientX, y: e.clientY };
      if (!drag) return;
      if (drag.pan) {
        viewport.x = drag.vx + (e.clientX - drag.sx);
        viewport.y = drag.vy + (e.clientY - drag.sy);
        drawNodes(container); drawEdges(container);
      } else {
        const n = wf.nodes.find(x => x.id === drag.nodeId);
        if (n) {
          const p = toCanvasPoint(container, e.clientX, e.clientY);
          n.x = Math.round(p.x - drag.dx);
          n.y = Math.round(p.y - drag.dy);
          drawNodes(container); drawEdges(container);
        }
      }
    };
    wrap.onpointerup = (e) => {
      if (connectFrom) {
        // 落在某个节点的输入端口上？
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const target = el && el.closest('.canvas-node');
        if (target && target.dataset.id !== connectFrom) {
          const to = target.dataset.id;
          const tt = NODE_TYPES[wf.nodes.find(n => n.id === to).type];
          if (tt.hasIn && !wf.edges.some(x => x.from === connectFrom && x.to === to)) {
            wf.edges.push({ id: 'e' + Date.now().toString(36), from: connectFrom, to, label: '' });
            saveWF();
          }
        }
        connectFrom = null;
      }
      if (drag) { drag = null; saveWF(); }
      drawEdges(container);
    };
    // 点击节点选中 / 双击删除
    wrap.addEventListener('dblclick', (e) => {
      const nodeEl = e.target.closest('.canvas-node');
      if (nodeEl) {
        const id = nodeEl.dataset.id;
        confirmDialog({ title: '删除节点', body: '删除该节点及其连线？', okText: '删除', danger: true }).then(ok => {
          if (!ok) return;
          wf.nodes = wf.nodes.filter(n => n.id !== id);
          wf.edges = wf.edges.filter(x => x.from !== id && x.to !== id);
          selNode = null;
          saveWF(); render(container);
        });
      }
    });
    // 下拉切换工作流
    const sel = container.querySelector('#wf-select');
    if (sel) sel.onchange = () => {
      wf = Workflows.get(sel.value);
      viewport = wf.viewport || { x: 0, y: 0, zoom: 1 };
      selNode = null;
      render(container);
    };
  }

  /* ---------- 检查器 ---------- */
  function renderInspector(container) {
    const box = container.querySelector('#canvas-inspector');
    if (!selNode) { box.innerHTML = ''; return; }
    const n = wf.nodes.find(x => x.id === selNode);
    if (!n) { box.innerHTML = ''; return; }
    const t = NODE_TYPES[n.type];
    const c = n.config || (n.config = {});
    const agents = Agents.all();
    const mediaModels = Models.ofKind(n.type === 'video' ? 'video' : 'image');
    const chatModels = Models.chat();

    let fields = `
      <div class="field"><label>节点标题</label><input class="input" id="ins-title" value="${escapeHtml(n.title || t.name)}"></div>`;
    if (n.type === 'start' || n.type === 'agent') {
      fields += `<div class="field"><label>${n.type === 'start' ? '初始指令 / 主题' : '提示词（留空则使用上游输出）'}</label>
        <textarea class="textarea" id="ins-prompt" rows="3">${escapeHtml(c.prompt || '')}</textarea></div>`;
    }
    if (n.type === 'agent') {
      fields += `<div class="field"><label>智能体</label><select class="select" id="ins-agent">
        <option value="">（使用对话模型直接执行）</option>
        ${agents.map(a => `<option value="${a.id}" ${c.agentId === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}
      </select></div>
      <div class="field"><label>模型（可选）</label><select class="select" id="ins-model">
        <option value="">（智能体默认模型）</option>
        ${chatModels.map(m => `<option value="${m.id}" ${c.modelId === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
      </select></div>`;
    }
    if (n.type === 'browser') {
      fields += `<div class="field"><label>网址（留空则用搜索）</label><input class="input" id="ins-url" value="${escapeHtml(c.url || '')}" placeholder="https://..."></div>
      <div class="field"><label>搜索关键词</label><input class="input" id="ins-query" value="${escapeHtml(c.query || '')}" placeholder="例如：AgentHub 最新功能"></div>`;
    }
    if (n.type === 'image' || n.type === 'video') {
      const caps = (mediaModels.find(m => m.id === c.modelId) || {}).caps || {};
      const resolutions = caps.resolutions && caps.resolutions.length ? caps.resolutions : (n.type === 'video' ? ['720p', '1080p'] : ['1024x1024']);
      const ratios = caps.ratios && caps.ratios.length ? caps.ratios : ['1:1', '16:9', '9:16'];
      const maxSec = caps.maxSeconds || 10;
      fields += `<div class="field"><label>媒体模型</label><select class="select" id="ins-mmodel">
        <option value="">请选择</option>
        ${mediaModels.map(m => `<option value="${m.id}" ${c.modelId === m.id ? 'selected' : ''}>${escapeHtml(m.name)}（${escapeHtml(m.model)}）</option>`).join('')}
      </select></div>
      <div class="field"><label>画面描述（留空则用上游输出）</label><textarea class="textarea" id="ins-prompt" rows="2">${escapeHtml(c.prompt || '')}</textarea></div>
      <div class="row" style="gap:10px">
        <div class="field" style="flex:1"><label>${n.type === 'video' ? '分辨率' : '尺寸'}</label><select class="select" id="ins-size">
          ${resolutions.map(r => `<option ${c.size === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select></div>
        <div class="field" style="flex:1"><label>比例</label><select class="select" id="ins-ratio">
          ${ratios.map(r => `<option ${c.ratio === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select></div>
        ${n.type === 'video' ? `<div class="field" style="flex:1"><label>秒数</label><input class="input" id="ins-dur" type="number" min="1" max="${maxSec}" value="${c.duration || 5}"></div>` : ''}
      </div>`;
    }
    if (n.type === 'condition') {
      fields += `<div class="field"><label>关键词（上游输出包含则走「真」分支）</label><input class="input" id="ins-keyword" value="${escapeHtml(c.keyword || '')}"></div>
      <div class="hint">连线时从本节点右侧端口拖到目标节点，双击箭头标签可在弹窗中标记 真/假。</div>`;
    }

    box.innerHTML = `
      <div class="card" style="margin:10px 12px 0">
        <div class="card-title">${icons[t.icon]} ${t.name} <span class="muted-sm" style="font-weight:400">${t.desc}</span></div>
        ${fields}
        <div class="row" style="gap:8px;margin-top:4px">
          <button class="btn ghost sm" data-act="ins-edge-true">标记下一条连线为「真」</button>
          <button class="btn ghost sm" data-act="ins-edge-false">标记为「假」</button>
        </div>
        <div class="row" style="gap:8px;margin-top:10px">
          <button class="btn primary sm" data-act="ins-save" style="flex:1">保存节点配置</button>
          <button class="btn danger sm" data-act="ins-del">删除节点</button>
        </div>
      </div>`;

    box.querySelector('[data-act="ins-save"]').onclick = () => {
      const g = (id) => { const el = box.querySelector(id); return el ? el.value.trim() : ''; };
      n.title = g('#ins-title') || t.name;
      if (n.type === 'start' || n.type === 'agent' || n.type === 'image' || n.type === 'video') c.prompt = g('#ins-prompt');
      if (n.type === 'agent') { c.agentId = g('#ins-agent') || null; c.modelId = g('#ins-model') || null; }
      if (n.type === 'browser') { c.url = g('#ins-url'); c.query = g('#ins-query'); }
      if (n.type === 'image' || n.type === 'video') {
        c.modelId = g('#ins-mmodel') || null;
        c.size = g('#ins-size'); c.ratio = g('#ins-ratio');
        if (n.type === 'video') c.duration = parseInt(g('#ins-dur')) || 5;
      }
      if (n.type === 'condition') c.keyword = g('#ins-keyword');
      saveWF();
      drawNodes(container); drawEdges(container);
      toast('节点已保存 ✓', 'ok');
    };
    box.querySelector('[data-act="ins-del"]').onclick = async () => {
      const ok = await confirmDialog({ title: '删除节点', body: '确定删除该节点？', okText: '删除', danger: true });
      if (!ok) return;
      wf.nodes = wf.nodes.filter(x => x.id !== n.id);
      wf.edges = wf.edges.filter(x => x.from !== n.id && x.to !== n.id);
      selNode = null;
      saveWF(); render(container);
    };
    box.querySelector('[data-act="ins-edge-true"]').onclick = () => markNextEdge(container, n.id, 'true');
    box.querySelector('[data-act="ins-edge-false"]').onclick = () => markNextEdge(container, n.id, 'false');
  }

  /* 给从某节点出发的下一条未标记连线打标签 */
  async function markNextEdge(container, fromId, label) {
    const e = wf.edges.find(x => x.from === fromId && !x.label);
    if (!e) { toast('没有可标记的新连线（先连一条）', 'err'); return; }
    e.label = label;
    saveWF(); drawEdges(container);
    toast('已标记为「' + (label === 'true' ? '真' : '假') + '」分支', 'ok');
  }

  /* ---------- 运行引擎 ---------- */
  function topoOrder() {
    // 从 start 节点出发的 BFS，返回可达节点顺序（无环保护）
    const indeg = {};
    wf.nodes.forEach(n => indeg[n.id] = 0);
    wf.edges.forEach(e => { if (indeg[e.to] != null) indeg[e.to]++; });
    const start = wf.nodes.find(n => n.type === 'start');
    const order = [];
    const queue = [];
    if (start) queue.push(start.id);
    else wf.nodes.forEach(n => { if (!indeg[n.id]) queue.push(n.id); });
    const seen = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
      wf.edges.filter(e => e.from === id).forEach(e => queue.push(e.to));
    }
    return order;
  }

  function setNodeStatus(id, status) {
    const el = document.querySelector(`.canvas-node[data-id="${id}"]`);
    if (!el) return;
    el.classList.remove('running', 'done', 'failed');
    if (status) el.classList.add(status);
    let tag = el.querySelector('.cn-status');
    const label = { running: '… 运行中', done: '✓ 完成', failed: '✗ 失败' }[status];
    if (label) {
      if (!tag) { tag = document.createElement('div'); tag.className = 'cn-status'; el.appendChild(tag); }
      tag.textContent = label;
    } else if (tag) tag.remove();
  }

  function log(container, text, ok) {
    const box = container.querySelector('#canvas-runlog');
    if (!box) return;
    if (!box.dataset.init) {
      box.dataset.init = '1';
      box.innerHTML = `<div class="card" style="margin:10px 12px 12px"><div class="card-title"> 运行日志</div><div class="log-list" id="runlog-list"></div></div>`;
    }
    const list = box.querySelector('#runlog-list');
    const line = document.createElement('div');
    line.className = ok === true ? 'ok' : ok === false ? 'bad' : '';
    line.textContent = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${text}`;
    list.appendChild(line);
    list.scrollTop = list.scrollHeight;
  }

  async function runWorkflow(container) {
    if (running) { toast('正在运行中', 'err'); return; }
    if (!wf.nodes.length) { toast('画布还是空的，先添加节点', 'err'); return; }
    running = true; runAbort = new AbortController();
    const runBtn = container.querySelector('[data-act="run-wf"]');
    if (runBtn) { runBtn.textContent = '■ 运行中…'; runBtn.disabled = true; }
    wf.nodes.forEach(n => setNodeStatus(n.id, null));

    const outputs = {};   // nodeId -> 输出内容
    const order = topoOrder();
    let finalOutput = '';

    for (const id of order) {
      if (runAbort.signal.aborted) break;
      const n = wf.nodes.find(x => x.id === id);
      if (!n) continue;
      setNodeStatus(id, 'running');
      log(container, `» ${NODE_TYPES[n.type].name}「${n.title || ''}」开始`);
      const inputs = wf.edges.filter(e => e.to === id).map(e => outputs[e.from]).filter(Boolean);
      const c = n.config || {};
      try {
        let out = '';
        if (n.type === 'start') {
          out = c.prompt || '';
          log(container, `初始指令：${out.slice(0, 60) || '（空）'}`);
        } else if (n.type === 'agent') {
          const prompt = c.prompt || inputs.join('\n\n') || '你好';
          const model = (c.modelId && Models.get(c.modelId)) || Models.defaultChat();
          if (!model) throw new Error('没有可用的对话模型，请先在设置中添加');
          const sys = window.ChatPage.effectiveSystem(c.agentId ? Agents.get(c.agentId) : Agents.active());
          const msgs = [];
          if (sys) msgs.push({ role: 'system', content: sys });
          msgs.push({ role: 'user', content: prompt });
          out = await window.API.chatStream(model, msgs, { signal: runAbort.signal });
          log(container, `智能体输出 ${out.length} 字`, true);
        } else if (n.type === 'browser') {
          const q = c.query || inputs[0] || c.url;
          if (c.url) {
            const r = await Native.openUrl(c.url);
            if (r && r.__unsupported) window.open(c.url, '_blank');
            out = '已打开网页：' + c.url;
          } else if (q) {
            const url = 'https://www.bing.com/search?q=' + encodeURIComponent(q);
            const r = await Native.openUrl(url);
            if (r && r.__unsupported) window.open(url, '_blank');
            out = '已搜索：' + q;
          } else throw new Error('浏览器节点未配置网址或关键词');
          log(container, out, true);
        } else if (n.type === 'image' || n.type === 'video') {
          const model = c.modelId && Models.get(c.modelId);
          if (!model) throw new Error('未选择媒体模型');
          const prompt = c.prompt || inputs.join('\n\n');
          if (!prompt) throw new Error('没有可用的画面描述');
          log(container, `提交${NODE_TYPES[n.type].name}任务（${c.size || ''} ${c.ratio || ''}${n.type === 'video' ? ' ' + (c.duration || 5) + 's' : ''}）…`);
          const r = await window.API.generateMedia(model, {
            prompt, size: c.size, ratio: c.ratio, duration: n.type === 'video' ? (c.duration || 5) : undefined,
            n: n.type === 'image' ? 1 : undefined
          }, { signal: runAbort.signal });
          out = r.url;
          log(container, `生成完成：${r.url.slice(0, 80)}`, true);
        } else if (n.type === 'condition') {
          const text = inputs.join('\n');
          out = c.keyword && text.includes(c.keyword) ? 'true' : 'false';
          log(container, `条件判断：${out === 'true' ? '包含' : '不包含'}「${c.keyword || ''}」→ ${out === 'true' ? '真' : '假'}分支`);
        } else if (n.type === 'output') {
          finalOutput = inputs.join('\n\n');
          out = finalOutput;
          log(container, '输出节点已收集结果', true);
        }
        outputs[id] = out;
        setNodeStatus(id, 'done');
      } catch (e) {
        if (e && e.name === 'AbortError') { log(container, '已中止运行', false); setNodeStatus(id, null); break; }
        setNodeStatus(id, 'failed');
        log(container, `✗ ${e.message || e}`, false);
        outputs[id] = '';
      }
    }

    if (finalOutput) {
      log(container, '✓ 工作流执行完毕', true);
      sheet({
        title: '工作流结果',
        body: `<div style="word-break:break-all;font-size:13px;line-height:1.6;max-height:50vh;overflow:auto">${escapeHtml(finalOutput.slice(0, 4000))}</div>`,
        actions: [{ text: '完成', cls: 'primary' }, { text: '复制', onClick: (m, close) => {
          navigator.clipboard && navigator.clipboard.writeText(finalOutput);
          toast('已复制'); close(null);
        } }]
      });
    } else if (!runAbort.signal.aborted) {
      log(container, '✓ 执行完成（无输出节点或结果为空）', true);
    }
    running = false; runAbort = null;
    if (runBtn) { runBtn.textContent = '» 运行'; runBtn.disabled = false; }
  }

  /* ---------- 工具栏动作 ---------- */
  async function onAction(act, el, container) {
    if (act === 'add-node') {
      const type = el.dataset.type;
      const t = NODE_TYPES[type];
      // 两列网格放置，避免节点互相遮挡
      const idx = wf.nodes.length;
      const n = {
        id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        type,
        x: 24 + (idx % 2) * 190,
        y: 24 + Math.floor(idx / 2) * 92,
        title: t.name,
        config: {}
      };
      wf.nodes.push(n);
      selNode = n.id;
      saveWF(); render(container);
      return;
    }
    if (act === 'wf-new') {
      const name = await promptText('新建工作流', '工作流名称', '未命名工作流');
      if (name == null) return;
      wf = Workflows.add({ name: name || '未命名工作流', nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
      viewport = { x: 0, y: 0, zoom: 1 };
      selNode = null;
      render(container);
      return;
    }
    if (act === 'wf-rename') {
      const name = await promptText('重命名', '工作流名称', wf.name);
      if (name == null) return;
      wf.name = name || wf.name;
      saveWF(); render(container);
      return;
    }
    if (act === 'wf-del') {
      const ok = await confirmDialog({ title: '删除工作流', body: `确定删除「${wf.name}」？`, okText: '删除', danger: true });
      if (!ok) return;
      Workflows.remove(wf.id);
      wf = null; selNode = null;
      render(container);
      return;
    }
    if (act === 'wf-export') {
      const json = Workflows.exportJSON(wf.id);
      if (!json) return;
      const r = await Native.saveToFolder((wf.name || 'workflow') + '.json', json);
      if (r && r.__unsupported) download((wf.name || 'workflow') + '.json', json, 'application/json');
      else if (r && r.ok) toast('✓ 已导出到本地文件夹');
      else toast('✗ 导出失败：' + ((r && r.__error) || ''), 'err');
      return;
    }
    if (act === 'wf-import') {
      sheet({
        title: '导入工作流',
        body: `<div class="hint" style="margin-bottom:8px">粘贴工作流 JSON，或从本地文件选择</div>
          <textarea class="textarea" id="imp-json" rows="6" placeholder='{"name":"...","nodes":[...],"edges":[...]}'></textarea>
          <button class="btn gray block mt8" id="imp-file"> 从文件选择</button>`,
        onOpen: (mask, close) => {
          mask.querySelector('#imp-file').onclick = async () => {
            const r = await Native.readPickedFile();
            if (r && r.content) {
              mask.querySelector('#imp-json').value = r.content;
              toast('已读取文件，点击「导入」确认');
            } else if (r && r.__unsupported) {
              toast('Web 预览环境请直接粘贴 JSON');
            } else {
              toast('读取失败：' + ((r && r.__error) || ''), 'err');
            }
          };
        },
        actions: [
          { text: '取消', cls: 'gray' },
          {
            text: '导入', onClick: (mask, close) => {
              const text = mask.querySelector('#imp-json').value;
              try {
                const n = Workflows.importJSON(text);
                toast(`✓ 已导入 ${n} 个工作流`, 'ok');
                wf = null; selNode = null;
                close(null);
                render(container);
              } catch (e) { toast('✗ ' + e.message, 'err'); }
            }
          }
        ]
      });
      return;
    }
    if (act === 'zoom-in') { viewport.zoom = Math.min(2, viewport.zoom + 0.1); saveWF(); render(container); return; }
    if (act === 'zoom-out') { viewport.zoom = Math.max(0.4, viewport.zoom - 0.1); saveWF(); render(container); return; }
    if (act === 'zoom-reset') { viewport = { x: 0, y: 0, zoom: 1 }; saveWF(); render(container); return; }
    if (act === 'run-wf') { await runWorkflow(container); return; }
  }

  /* 简易输入弹窗 */
  function promptText(title, label, value) {
    return new Promise((resolve) => {
      sheet({
        title,
        body: `<div class="field"><label>${label}</label><input class="input" id="pt-input" value="${escapeHtml(value || '')}"></div>`,
        actions: [
          { text: '取消', cls: 'gray', onClick: (m, close) => { close(null); resolve(null); } },
          { text: '确定', cls: 'primary', onClick: (m, close) => { const v = m.querySelector('#pt-input').value.trim(); close(null); resolve(v); } }
        ]
      });
    });
  }

  window.CanvasPage = { render, onAction, NODE_TYPES };
})();
