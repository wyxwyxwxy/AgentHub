/* ============ 对话页（v2.2：单主智能体 + 自繁衍并行子智能体） ============ */
(function () {
  const { $, $$, toast, sheet, confirmDialog, escapeHtml, renderMarkdown, icons, fmtTime, Native } = window.UI;
  const { Models, Agents, Chats, DynamicAgents, Skills } = window.Store;

  let currentModelId = null;   // 对话页当前选择的模型
  let abortCtl = null;         // 单发流式 abort
  let lastRender = 0;

  /* 深度思考提示词：开启深度思考时注入系统提示，要求模型用 <thinking> 标签输出推理 */
  const DEEP_THINK_HINT = '【深度思考模式】在给出最终回答前，先用 <thinking>...</thinking> 标签把你的推理过程完整写出来（可多段、可分析、可自我质疑、可列要点）：\n' +
    '① 思考内容尽量用中文；若用了英文等其他语言，界面会自动翻译成中文，不影响功能。\n' +
    '② 思考标签之外再写最终给用户的回答（正常 Markdown）。\n' +
    '③ 不要把 [[ACTION:...]] 行动指令放进 <thinking> 标签，行动指令请放在最终回答部分。\n' +
    '④ 纯闲聊或极简单问题可省略思考，直接回答。';

  function currentModel() {
    const m = Models.get(currentModelId);
    if (m) return m;
    const first = Models.list()[0];
    if (first) { currentModelId = first.id; return first; }
    return null;
  }

  /** 主智能体有效系统提示词：空则用默认；不含协作协议则追加能力说明 */
  function effectiveSystem(agent) {
    let sys = (agent && agent.systemPrompt || '').trim();
    if (!sys) sys = window.SubAgents.mainPrompt();
    if (sys.indexOf('[[ACTION:spawn') < 0 && sys.indexOf('[[ACTION:subagent') < 0) sys += '\n\n' + window.SubAgents.capsDoc();
    if (Store.state.settings.deepThink && sys.indexOf('深度思考模式') < 0) sys += '\n\n' + DEEP_THINK_HINT;
    return sys;
  }

  /* 把带 <thinking> 标签的原始文本拆成「思考」与「回答」两部分（兼容流式增量） */
  function splitThinking(raw) {
    if (!raw) return { thinking: '', answer: '', open: false };
    const parts = String(raw).split(/(<thinking>|<\/thinking>)/g);
    let thinking = '', answer = '', inThink = false;
    for (const seg of parts) {
      if (seg === '<thinking>') inThink = true;
      else if (seg === '</thinking>') inThink = false;
      else { if (inThink) thinking += seg; else answer += seg; }
    }
    return { thinking: thinking.trim(), answer: answer.trim(), open: inThink };
  }

  /* 语言检测：返回 'zh' 或 'other'（CJK 占比阈值 0.25） */
  function detectLang(text) {
    const t = text || '';
    if (!t.trim()) return 'zh';
    const cjk = (t.match(/[一-鿿㐀-䶿]/g) || []).length;
    const letters = (t.match(/[A-Za-z]/g) || []).length;
    const total = cjk + letters;
    if (!total) return 'zh';
    return (cjk / total) >= 0.25 ? 'zh' : 'other';
  }

  /* 思考过程卡片 HTML（streaming 时默认展开，结束后默认折叠，折叠状态可被用户手动切换） */
  function thinkHtml(m) {
    if (!m.thinking && !m.thinkingZh) return '';
    const disp = (m.thinkingZh && m.thinkingLang !== 'zh') ? m.thinkingZh : m.thinking;
    const dur = m.thinkingMs ? ' · ' + Math.max(1, Math.round(m.thinkingMs / 1000)) + 's' : '';
    const zhBadge = (m.thinkingZh && m.thinkingLang !== 'zh')
      ? '<span class="badge purple" style="margin-left:4px">已自动翻译为中文</span>' : '';
    const open = m.thinkCollapsed === undefined ? !m.streaming ? false : true : (m.thinkCollapsed === false);
    const thinkingCls = (m.streaming && m.thinkingOpen) ? ' thinking' : '';
    return `<div class="think-card${open ? '' : ' closed'}${thinkingCls}" data-think="1">
      <button class="think-toggle" data-act="toggle-think" data-mid="${m.id || ''}">
        <span class="chev">▸</span>
        <span class="ti-title"> 思考过程</span>
        <span class="ti-dur muted-sm">${dur}</span>${zhBadge}
      </button>
      <div class="think-body">${renderMarkdown(disp)}</div>
    </div>`;
  }

  /* 增量更新思考卡片（避免整段重绘导致折叠状态丢失） */
  function updateThinkCard(wrap, msg) {
    if (!msg.thinking && !msg.thinkingZh) {
      const old = wrap.querySelector('.think-card');
      if (old) old.remove();
      return;
    }
    let card = wrap.querySelector('.think-card');
    if (!card) {
      const bubble = wrap.querySelector('.msg-bubble');
      bubble.insertAdjacentHTML('beforebegin', thinkHtml(msg));
      card = wrap.querySelector('.think-card');
    } else {
      const body = card.querySelector('.think-body');
      const disp = (msg.thinkingZh && msg.thinkingLang !== 'zh') ? msg.thinkingZh : msg.thinking;
      body.innerHTML = renderMarkdown(disp);
      const dur = card.querySelector('.ti-dur');
      if (dur) dur.textContent = msg.thinkingMs ? ' · ' + Math.max(1, Math.round(msg.thinkingMs / 1000)) + 's' : '';
      card.classList.toggle('thinking', !!(msg.streaming && msg.thinkingOpen));
      const open = msg.thinkCollapsed === undefined ? !msg.streaming ? false : true : (msg.thinkCollapsed === false);
      card.classList.toggle('closed', !open);
    }
  }

  /* 思考内容是否非中文 → 调用模型翻译并缓存到 thinkingZh */
  async function maybeTranslate(msg, model) {
    if (!msg.thinking) return;
    if (!Store.state.settings.deepThink) return;
    msg.thinkingMs = msg.thinkStart ? Math.max(1, Date.now() - msg.thinkStart) : 0;
    const lang = detectLang(msg.thinking);
    msg.thinkingLang = lang;
    if (lang === 'zh' || !Store.state.settings.thinkAutoZh) { refreshMsgs(); return; }
    if (!model) { refreshMsgs(); return; }
    try {
      const zh = await window.API.chatOnce(model, [
        { role: 'system', content: '你是一个严谨的翻译器。把用户提供的文本准确翻译为简体中文，保留原有段落结构、列表与语气，只输出译文本身，不要任何解释或前缀。' },
        { role: 'user', content: msg.thinking }
      ], {});
      if (zh && zh.trim()) msg.thinkingZh = zh.trim();
    } catch (e) { /* 翻译失败则保留原文，不影响展示 */ }
    refreshMsgs();
  }

  /* ---------- 渲染 ---------- */
  function render(container) {
    const chat = Chats.active() || Chats.create();
    const models = Models.list();
    // 未选择或选择的模型已不存在时，自动选中第一个
    if (models.length && !models.find(m => m.id === currentModelId)) currentModelId = models[0].id;
    const active = Agents.active();
    const dynCount = DynamicAgents.all().length;
    const skillCount = Skills.installed().length;
    const msgs = chat.messages;

    container.innerHTML = `
      <div class="page" data-page="chat">
        <div class="page-header">
          <button class="icon-btn" data-act="history">${icons.more}</button>
          <h1 style="font-size:16px">${escapeHtml(chat.title)}<span class="sub">${active ? escapeHtml(active.name) + ' · 在线' : '未就绪'}</span></h1>
          <button class="icon-btn" data-act="open-search" title="搜索">${icons.search}</button>
          <button class="icon-btn" data-act="open-mindmap" title="智能体协作视图">${icons.network}</button>
          <button class="icon-btn" data-act="new-chat">${icons.plus}</button>
        </div>
        ${models.length ? `
        <div class="chat-models">
          ${models.map(m => `<button class="chip ${m.id === currentModelId ? 'active' : ''}" data-act="pick-model" data-id="${m.id}"><span class="dot" style="background:${m.type === 'anthropic' ? '#d97757' : '#10a37f'}"></span>${escapeHtml(m.name)}</button>`).join('')}
        </div>` : ''}
        <div class="chat-scroll" id="chat-scroll">
          ${msgs.length === 0 ? emptyState(models.length) : msgs.map(m => msgHtml(m, active)).join('')}
        </div>
        <div class="chat-inputbar">
          <div class="row" style="margin-bottom:8px;gap:6px;flex-wrap:wrap;align-items:center">
            <span class="muted" style="font-size:12px"> 已创造 ${dynCount} 个智能体 ·  ${skillCount} 个技能待命</span>
            <button class="chip" data-act="goto-agents" style="padding:4px 10px;font-size:12px">管理</button>
          </div>
          <div class="box">
            <textarea id="chat-input" rows="1" placeholder="输入消息；智能体会自动创造子智能体并行干活…"></textarea>
            <button class="send-btn" id="send-btn" data-act="send">${icons.send}</button>
          </div>
        </div>
      </div>`;
    bindInput();
    scrollBottom(false);
  }

  function emptyState(hasModel) {
    if (!hasModel) return `
      <div class="empty">
        <div class="emo"></div>
        <h3>开启你的 Agent 之旅</h3>
        <p>第一步：添加一个模型（OpenAI 兼容或 Anthropic）<br>然后就能自由对话，我会按需创造子智能体并行干活</p>
        <button class="btn" data-act="goto-models">去添加模型</button>
      </div>`;
    const a = Agents.active();
    return `
      <div class="empty">
        <div class="emo">${a ? (icons[a.avatar] || icons.agents) : icons.agents}</div>
        <h3>与 ${a ? escapeHtml(a.name) : '主智能体'} 开始对话</h3>
        <p>输入任何问题开始；支持 Markdown / 代码块<br>需要专业能力时，我会自动创造子智能体或调用技能</p>
      </div>`;
  }

  /** 工具/子智能体徽标文本 */
  function badgeOf(a) {
    if (a.tool === 'spawn') {
      const role = (a.arg || '').split('|')[0].trim();
      return ' ' + (role || '子智能体');
    }
    if (a.tool === 'skill') {
      const sid = (a.arg || '').split('|')[0].trim();
      const sk = Skills.get(sid);
      return ' ' + (sk ? sk.name : sid);
    }
    if (a.tool.indexOf('browser') === 0) return '' + a.tool;
    if (a.tool.indexOf('media') === 0) return (a.tool === 'media.video' ? ' ' : ' ') + '生成';
    if (a.tool.indexOf('fs') === 0) return ' ' + a.tool;
    return ' ' + a.tool;
  }

  /* 正文里的 ACTION 标记徽标 */
  function actionBadge(a) {
    return `<span class="badge blue" title="${escapeHtml(a.raw)}">${escapeHtml(badgeOf(a))}</span>`;
  }

  function toolTagHtml(actions) {
    if (!actions.length) return '';
    return `<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:6px">${actions.map(actionBadge).join('')}</div>`;
  }

  function msgHtml(m, activeAgent) {
    const agent = m.agentId ? Agents.get(m.agentId) : null;
    const who = m.role === 'user' ? { name: '我', avatar: 'users', color: '#16a34a' } : (agent || { name: activeAgent ? activeAgent.name : '主智能体', avatar: activeAgent ? activeAgent.avatar : 'agents', color: activeAgent ? activeAgent.color : '#16a34a' });
    // 工具调用标记不直接展示，改为徽标
    const actions = m.role === 'assistant' && !m.tool ? window.AgentTools.parse(m.content) : [];
    const clean = actions.length ? window.AgentTools.strip(m.content) : m.content;
    const toolBadge = m.tool && m._badge
      ? `<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:6px"><span class="badge green">${escapeHtml(m._badge)}</span></div>`
      : '';
    const toolTag = toolTagHtml(actions);
    const content = m.streaming && !m.content
      ? `<span class="typing"><i></i><i></i><i></i></span>`
      : toolBadge + toolTag + renderMarkdown(clean) + (m.streaming ? '<span class="stream-cursor"></span>' : '');
    const errTag = m.error ? `<div class="badge" style="color:var(--danger);border-color:#fecaca;background:var(--danger-bg)">出错了</div>` : '';
    return `
      <div class="msg ${m.role === 'user' ? 'user' : ''} ${m.error ? 'error' : ''}" data-mid="${m.id || ''}">
        <div class="msg-avatar" style="${m.role === 'user' ? '' : `background:${who.color}18;border-color:${who.color}55`}">${icons[who.avatar] || icons.agents}</div>
        <div class="msg-body">
          <div class="msg-meta"><b style="color:var(--text-2)">${escapeHtml(who.name)}</b>· ${fmtTime(m.ts || Date.now())} ${errTag}</div>
          ${thinkHtml(m)}
          <div class="msg-bubble ${m.tool ? 'tool-msg' : ''}">${content}</div>
        </div>
      </div>`;
  }

  function scrollBottom(smooth = true) {
    const el = $('#chat-scroll');
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  function refreshMsgs() {
    const chat = Chats.active();
    const el = $('#chat-scroll');
    if (!chat || !el) return;
    const active = Agents.active();
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    el.innerHTML = chat.messages.map(m => msgHtml(m, active)).join('');
    if (nearBottom) scrollBottom(false);
  }

  /* ---------- 输入框 ---------- */
  function bindInput() {
    const ta = $('#chat-input');
    if (!ta) return;
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
        e.preventDefault();
        if (!abortCtl) send();
      }
    });
    // 注意：发送/停止按钮的点击由 app.js 全局 [data-act] 委托处理（onAction 'send'），
    // 不能在此再直接绑定 click，否则一次点击会触发两次 → 发送后立即自我中止。
    if (window.NativeFocus) setTimeout(() => ta.focus(), 100);
  }

  function setBtnState(state) {
    const btn = $('#send-btn');
    if (!btn) return;
    if (state === 'stop') { btn.innerHTML = icons.stop; btn.classList.add('stop'); }
    else { btn.innerHTML = icons.send; btn.classList.remove('stop'); }
  }

  /* ---------- 发送 ---------- */
  async function send() {
    const ta = $('#chat-input');
    const text = (ta.value || '').trim();
    if (!text) return;
    const model = currentModel();
    if (!model) { toast('请先在模型页添加模型', 'err'); return; }
    const agent = Agents.active();
    if (!agent) { toast('主智能体缺失', 'err'); return; }

    let chat = Chats.active();
    if (!chat) chat = Chats.create();
    if (chat.messages.length === 0) chat.title = text.slice(0, 18);

    const userMsg = { id: Store.uid('msg'), role: 'user', content: text, ts: Date.now() };
    chat.messages.push(userMsg);
    ta.value = ''; ta.style.height = 'auto';
    refreshMsgs(); scrollBottom();
    setBtnState('stop');

    await runAgent(chat, agent, model, text);
  }

  async function runAgent(chat, agent, model, userText) {
    const msg = { id: Store.uid('msg'), role: 'assistant', agentId: agent.id, content: '', ts: Date.now(), streaming: true };
    chat.messages.push(msg);
    refreshMsgs(); scrollBottom();
    setBtnState('stop');
    await streamTurn(chat, agent, model, msg);
    // 工具 / 子智能体调用循环：模型输出 [[ACTION:...]] 时执行并回喂结果，最多 3 轮
    let rounds = 0;
    let last = msg;
    let userStopped = false;
    while (rounds < 3 && !last.error && !userStopped) {
      const actions = window.AgentTools.parse(last.content);
      if (!actions.length) break;
      rounds++;
      /* 每个行动一张卡片，多个行动并行执行 */
      const cards = actions.map(a => {
        const m = {
          id: Store.uid('msg'), role: 'assistant', agentId: agent.id,
          content: '… 排队中…', ts: Date.now(), tool: true,
          _badge: badgeOf(a), _tool: a.tool, _status: '', _stream: '', _briefs: []
        };
        chat.messages.push(m);
        return { a, m };
      });
      refreshMsgs(); scrollBottom();
      const paintCard = (m) => {
        let c = m._status || '… 执行中…';
        if (m._stream) c += '\n\n---\n\n' + m._stream;
        else if (m._briefs.length) c += '\n' + m._briefs.join('\n');
        m.content = c;
        paintMsg(m);
      };
      await Promise.all(cards.map(async ({ a, m }) => {
        if (abortCtl && abortCtl.signal.aborted) {
          m._status = '■ 已停止'; paintCard(m); return;
        }
        try {
          const r = await window.AgentTools.execute(a, {
            model, signal: abortCtl ? abortCtl.signal : undefined,
            onStatus: (s) => { m._status = s; m._stream = ''; paintCard(m); },
            onDelta: (full) => { m._stream = full; paintCard(m); }
          });
          m._stream = '';
          m._status = (r.ok ? '✓ ' : '✗ ') + a.tool + (r.ok ? ' 已完成' : ' 未完成');
          m._briefs.push((r.ok ? '· ' : '· ') + a.tool + '：' + String(r.text || '').replace(/\s+/g, ' ').slice(0, 140));
          m._result = r.text;
        } catch (e) {
          m._status = '✗ 执行异常'; m._briefs.push('· ' + (e.message || String(e)));
          m._result = '执行异常：' + (e.message || String(e));
        }
        paintCard(m);
      }));
      if (abortCtl && abortCtl.signal.aborted) { userStopped = true; break; }
      const results = cards.map(c => `【${c.a.tool}】${c.a.arg ? '（' + c.a.arg.slice(0, 60) + '）' : ''}\n${c.m._result || '（无结果）'}`);
      chat.messages.push({
        id: Store.uid('msg'), role: 'user', ts: Date.now(),
        content: '【系统】以下是工具/子智能体执行结果，请基于结果继续完成用户的请求，不要再重复调用相同工具：\n\n' + results.join('\n\n')
      });
      const next = { id: Store.uid('msg'), role: 'assistant', agentId: agent.id, content: '', ts: Date.now(), streaming: true };
      chat.messages.push(next);
      refreshMsgs(); scrollBottom();
      await streamTurn(chat, agent, model, next);
      last = next;
    }
    abortCtl = null;
    setBtnState('send');
    Chats.touch(chat);
    refreshMsgs();
  }

  /** 把当前会话流式写入指定消息对象 */
  async function streamTurn(chat, agent, model, msg) {
    const sys = effectiveSystem(agent);
    const msgs = [];
    if (sys) msgs.push({ role: 'system', content: sys });
    for (const m of chat.messages) {
      if (m.id === msg.id) continue;
      if (m.role === 'user') msgs.push({ role: 'user', content: m.content });
      else if (m.role === 'assistant' && !m.tool) {
        const from = m.agentId ? Agents.get(m.agentId) : null;
        const prefix = from && from.id !== agent.id ? `[${from.name}]：` : '';
        msgs.push({ role: 'assistant', content: prefix + window.AgentTools.strip(m.content) });
      }
    }
    abortCtl = new AbortController();
    let lastPaint = 0;
    let firstDelta = false;
    const lastUser = (chat.messages.filter(x => x.role === 'user').slice(-1)[0] || {}).content || '';
    try { window.SubAgents && window.SubAgents.emit('main:status', { type: 'thinking', task: lastUser }); } catch (e) {}
    try {
      await window.API.chatStream(model, msgs, {
        signal: abortCtl.signal,
        onDelta: (_, full) => {
          if (!firstDelta) { firstDelta = true; try { window.SubAgents && window.SubAgents.emit('main:status', { type: 'streaming' }); } catch (e) {} }
          const sp = splitThinking(full);
          const deep = Store.state.settings.deepThink;
          if (deep) {
            msg.thinking = sp.thinking;
            msg.thinkingOpen = sp.open;
            if (msg.thinking && !msg.thinkStart) msg.thinkStart = Date.now();
          } else {
            msg.thinking = ''; msg.thinkingOpen = false;
          }
          msg.content = deep ? sp.answer : full;
          const now = Date.now();
          if (now - lastPaint > 60) { lastPaint = now; paintMsg(msg); }
        }
      });
    } catch (e) {
      if (e && (e.name === 'AbortError' || e.message === 'aborted')) msg.content += '\n\n_（已停止生成）_';
      else msg.error = window.API.friendlyError(e) || String(e && e.message || e);
      toast(msg.error || '已停止', msg.error ? 'err' : '');
    }
    msg.streaming = false;
    try { window.SubAgents && window.SubAgents.emit('main:status', { type: 'idle' }); } catch (e) {}
    await maybeTranslate(msg, model);
    refreshMsgs();
  }

  function paintMsg(msg) {
    const wrap = $(`[data-mid="${msg.id}"]`);
    if (!wrap) { refreshMsgs(); return; }
    const bubble = wrap.querySelector('.msg-bubble');
    if (!bubble) return;
    let html;
    if (msg.tool && msg._badge) {
      html = `<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:6px"><span class="badge green">${escapeHtml(msg._badge)}</span></div>` + renderMarkdown(msg.content);
    } else {
      const actions = msg.role === 'assistant' ? window.AgentTools.parse(msg.content) : [];
      const clean = actions.length ? window.AgentTools.strip(msg.content) : msg.content;
      html = toolTagHtml(actions) + renderMarkdown(clean);
    }
    bubble.innerHTML = html + '<span class="stream-cursor"></span>';
    updateThinkCard(wrap, msg);
    const sc = $('#chat-scroll');
    if (sc && sc.scrollHeight - sc.scrollTop - sc.clientHeight < 140) scrollBottom(false);
  }

  /* ---------- 历史会话 ---------- */
  function historySheet() {
    const draw = (mask) => {
      const chats = Chats.list();
      const body = mask.querySelector('.modal-body');
      body.innerHTML = chats.length ? `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${chats.map(c => `
            <div class="list-item" style="margin:0">
              <div class="li-icon"></div>
              <div class="li-main" data-open="${c.id}" style="cursor:pointer">
                <div class="li-title">${escapeHtml(c.title)}</div>
                <div class="li-sub">${c.messages.length} 条消息 · ${new Date(c.createdAt).toLocaleDateString('zh-CN')}</div>
              </div>
              <button class="icon-btn" data-del="${c.id}" style="color:var(--danger)">${icons.trash}</button>
            </div>`).join('')}
        </div>` : '<div class="empty"><div class="emo"></div><h3>暂无历史会话</h3></div>';
      body.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
        Store.state.activeChatId = b.dataset.open; Store.save();
        mask.remove(); window.App.refresh();
      });
      body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const ok = await confirmDialog({ title: '删除会话', body: '删除后不可恢复，确定吗？', okText: '删除', danger: true });
        if (ok) { Chats.remove(b.dataset.del); Store.save(); draw(mask); }
      });
    };
    sheet({ title: '会话列表', body: '<div class="modal-body"></div>', onOpen: draw });
  }

  /* ---------- 事件 ---------- */
  async function onAction(act, el, container) {
    if (act === 'send') { if (abortCtl) abortCtl.abort(); else send(); return; }
    if (act === 'toggle-think') {
      const mid = el.dataset.mid;
      const m = Chats.active() && Chats.active().messages.find(x => x.id === mid);
      if (!m) return;
      const card = el.closest('.think-card');
      if (!card) return;
      const nowClosed = card.classList.toggle('closed');
      m.thinkCollapsed = nowClosed;
      return;
    }
    if (act === 'pick-model') { currentModelId = el.dataset.id; Store.save(); window.App.refresh(); return; }
    if (act === 'goto-agents') { window.App.go('agents'); return; }
    if (act === 'open-search') { window.App.push('search'); return; }
    if (act === 'open-mindmap') { window.App.push('mindmap'); return; }
    if (act === 'new-chat') {
      if (abortCtl) abortCtl.abort();
      Chats.create(Agents.active() ? Agents.active().id : null);
      window.App.refresh();
      return;
    }
    if (act === 'history') { historySheet(); return; }
    if (act === 'goto-models') { window.App.push('models'); return; }
    if (act === 'open-chat') { Store.state.activeChatId = el.dataset.id; Store.save(); window.App.refresh(); return; }
    if (act === 'del-chat') {
      const ok = await confirmDialog({ title: '删除会话', body: '删除后不可恢复，确定吗？', okText: '删除', danger: true });
      if (ok) { Chats.remove(el.dataset.del); Store.save(); window.App.refresh(); }
      return;
    }
  }

  window.ChatPage = {
    render, onAction, currentModel, effectiveSystem,
    get abortCtl() { return abortCtl; }
  };
})();
