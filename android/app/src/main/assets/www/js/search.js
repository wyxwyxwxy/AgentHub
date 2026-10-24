/* ============ 全局搜索：对话 / 智能体 / 模型 / 技能 / 文件 ============ */
(function () {
  const { $, $$, toast, icons, escapeHtml } = window.UI;
  const { Store } = window;

  function walkFS(node, path, out) {
    if (!node) return;
    const p = (path ? path + '/' : '') + (node.name || '');
    if (node.type === 'file') out.push({ name: node.name || '', path: p, size: node.size || 0 });
    if (node.children) node.children.forEach(c => walkFS(c, p, out));
  }

  function searchAll(kw) {
    kw = (kw || '').trim().toLowerCase();
    const res = { chat: [], agent: [], model: [], skill: [], file: [] };
    if (!kw) return res;
    const st = Store.state;

    // 对话：标题 + 消息内容
    (st.chats || []).forEach(c => {
      const title = (c.title || '').toLowerCase();
      let hitMsg = null;
      (c.messages || []).forEach(m => {
        if (!hitMsg && (m.content || '').toLowerCase().includes(kw)) hitMsg = (m.content || '').slice(0, 80);
      });
      if (title.includes(kw) || hitMsg) {
        res.chat.push({ id: c.id, title: c.title || '未命名对话', snippet: hitMsg || (title.includes(kw) ? '标题匹配' : '') });
      }
    });

    // 智能体
    (st.agents || []).forEach(a => {
      const hay = ((a.name || '') + ' ' + (a.desc || '') + ' ' + (a.systemPrompt || '')).toLowerCase();
      if (hay.includes(kw)) res.agent.push({ id: a.id, name: a.name || '智能体', desc: (a.desc || '').slice(0, 60) });
    });
    (st.dynamicAgents || []).forEach(a => {
      const hay = ((a.name || '') + ' ' + (a.role || '')).toLowerCase();
      if (hay.includes(kw)) res.agent.push({ id: a.id, name: a.name || '子智能体', desc: ('角色：' + (a.role || '')).slice(0, 60), dyn: true });
    });

    // 模型
    (st.models || []).forEach(m => {
      const hay = ((m.name || '') + ' ' + (m.model || '') + ' ' + (m.baseUrl || '')).toLowerCase();
      if (hay.includes(kw)) res.model.push({ id: m.id, name: m.name || '模型', model: m.model || '', type: m.type || 'openai' });
    });

    // 技能
    (st.skills || []).forEach(s => {
      const hay = ((s.name || '') + ' ' + (s.desc || '')).toLowerCase();
      if (hay.includes(kw)) res.skill.push({ id: s.id, name: s.name || '技能', desc: (s.desc || '').slice(0, 60) });
    });

    // 文件（虚拟 + 真实目录名）
    const files = [];
    walkFS(st.fs && st.fs.children ? st.fs : null, '', files);
    files.forEach(f => { if (f.name.toLowerCase().includes(kw) || f.path.toLowerCase().includes(kw)) res.file.push(f); });

    return res;
  }

  function render(container) {
    container.innerHTML = `
      <div class="page" data-page="search">
        <div class="page-header search-header">
          <button class="icon-btn" data-act="pop">${icons.back}</button>
          <input class="input search-input" id="search-box" placeholder="搜索对话、智能体、模型、技能、文件…" autofocus>
        </div>
        <div class="page-body" id="search-results">
          <div class="muted center" style="padding:30px 0">输入关键词开始搜索</div>
        </div>
      </div>`;

    const box = $('#search-box', container);
    const out = $('#search-results', container);
    let timer = null;
    const doSearch = () => {
      const kw = box.value;
      const r = searchAll(kw);
      const total = r.chat.length + r.agent.length + r.model.length + r.skill.length + r.file.length;
      if (!kw.trim()) { out.innerHTML = '<div class="muted center" style="padding:30px 0">输入关键词开始搜索</div>'; return; }
      if (!total) { out.innerHTML = '<div class="muted center" style="padding:30px 0">未找到与「' + escapeHtml(kw) + '」相关的内容</div>'; return; }
      const sec = (title, items, render) => items.length ? `
        <div class="search-sec"><div class="search-sec-title">${title} · ${items.length}</div>${items.map(render).join('')}</div>` : '';
      out.innerHTML =
        sec('对话', r.chat, x => `<button class="search-item" data-go="chat" data-id="${x.id}"><b>${escapeHtml(x.title)}</b>${x.snippet ? '<span class="muted"> · ' + escapeHtml(x.snippet) + '</span>' : ''}</button>`) +
        sec('智能体', r.agent, x => `<button class="search-item" data-go="agent" data-id="${x.id}"><b>${escapeHtml(x.name)}</b>${x.desc ? '<span class="muted"> · ' + escapeHtml(x.desc) + '</span>' : ''}</button>`) +
        sec('模型', r.model, x => `<button class="search-item" data-go="model" data-id="${x.id}"><b>${escapeHtml(x.name)}</b><span class="muted"> · ${escapeHtml(x.model)} · ${x.type}</span></button>`) +
        sec('技能', r.skill, x => `<button class="search-item" data-go="skill" data-id="${x.id}"><b>${escapeHtml(x.name)}</b>${x.desc ? '<span class="muted"> · ' + escapeHtml(x.desc) + '</span>' : ''}</button>`) +
        sec('文件', r.file, x => `<button class="search-item" data-go="file" data-path="${escapeHtml(x.path)}"><b>${escapeHtml(x.path)}</b></button>`);
    };
    box.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(doSearch, 120); });
    setTimeout(() => box.focus(), 60);
  }

  async function onAction(act, el, container) {
    if (act === 'pop') { window.App.pop(); return; }
    if (act === 'goto') {
      const go = el.dataset.go, id = el.dataset.id, path = el.dataset.path;
      if (go === 'chat') { Store.state.activeChatId = id; Store.save(); window.App.go('chat'); }
      else if (go === 'agent') { window.App.go('agents'); }
      else if (go === 'model') { window.App.go('settings'); window.App.push('models'); }
      else if (go === 'skill') { window.App.push('skills'); }
      else if (go === 'file') { window.App.push('files'); }
    }
  }

  window.SearchPage = { render, onAction };
})();
