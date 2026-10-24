/* ============ 定时任务：一次性 / 每天 / 每周 / 间隔 ============ */
(function () {
  const { $, $$, toast, sheet, confirmDialog, icons, escapeHtml, Native } = window.UI;
  const { Tasks, Agents, Models, Media, FS } = window.Store;

  let schedulerId = null;
  let executing = new Set();

  /* ---------- 任务动作定义 ---------- */
  const ACTIONS = {
    agent: { name: ' 智能体执行', desc: '让智能体执行一段指令并记录结果' },
    image: { name: ' 生成图片', desc: '调用图片模型生成并保存到本地' },
    video: { name: ' 生成视频', desc: '调用视频模型生成并保存到本地' },
    url: { name: '打开网页', desc: '在浏览器中打开指定网址' },
    notify: { name: ' 发送通知', desc: '弹出一条提醒' }
  };

  const TYPE_NAMES = { once: '一次性', daily: '每天', weekly: '每周', interval: '间隔' };

  /* ---------- 渲染 ---------- */
  function render(container) {
    const list = Tasks.all();
    container.innerHTML = `
      ${list.length === 0 ? `
        <div class="empty">
          <div class="emo"></div>
          <h3>还没有定时任务</h3>
          <p>让智能体每天汇总信息、定时生成图片<br>支持一次性 / 每天 / 每周 / 按间隔执行</p>
        </div>
      ` : list.map(t => `
        <div class="task-item" data-id="${t.id}">
          <div class="t-head">
            <span class="t-dot ${t.enabled ? 'on' : 'off'}"></span>
            <div class="t-name">${escapeHtml(t.name)}</div>
            <span class="badge gray">${TYPE_NAMES[t.type] || t.type}</span>
          </div>
          <div class="t-meta">
            <div>${escapeHtml(Tasks.describe(t))} · ${ACTIONS[t.action] ? ACTIONS[t.action].name : t.action}</div>
            <div>${t.enabled ? '下次：' + fmtNext(t) : '已暂停'}${t.lastRunAt ? ' · 上次：' + new Date(t.lastRunAt).toLocaleString('zh-CN', { hour12: false }) + (t.lastOk ? ' ✓' : ' ✗') : ''}</div>
            ${t.lastMsg ? `<div style="color:${t.lastOk ? 'var(--green-700)' : 'var(--danger)'}">${escapeHtml(String(t.lastMsg).slice(0, 100))}</div>` : ''}
          </div>
          <div class="t-acts">
            <button class="btn ghost sm" data-act="run-now" data-id="${t.id}" ${executing.has(t.id) ? 'disabled' : ''}>${executing.has(t.id) ? '执行中…' : '立即执行'}</button>
            <button class="btn gray sm" data-act="edit-task" data-id="${t.id}">编辑</button>
            <button class="btn gray sm" data-act="toggle-task" data-id="${t.id}">${t.enabled ? '暂停' : '启用'}</button>
            <button class="btn danger sm" data-act="del-task" data-id="${t.id}">删除</button>
          </div>
          ${t.log && t.log.length ? `
            <div class="log-list">
              ${t.log.slice(0, 5).map(l => `<div class="${l.ok ? 'ok' : 'bad'}">${new Date(l.at).toLocaleString('zh-CN', { hour12: false })} ${escapeHtml((l.msg || '').slice(0, 60))}</div>`).join('')}
            </div>` : ''}
        </div>`).join('')}
      <button class="btn primary block mt12" data-act="add-task">＋ 新建定时任务</button>`;

    startScheduler();
  }

  function fmtNext(t) {
    if (!t.nextRunAt) return '—';
    const diff = t.nextRunAt - Date.now();
    if (diff < 0) return '即将执行';
    if (diff < 3600000) return Math.round(diff / 60000) + ' 分钟后';
    if (diff < 86400000) return Math.round(diff / 3600000) + ' 小时后';
    return new Date(t.nextRunAt).toLocaleString('zh-CN', { hour12: false });
  }

  /* ---------- 编辑器 ---------- */
  function editor(task) {
    const isNew = !task;
    const t = task || { name: '', type: 'daily', time: '09:00', weekday: 1, interval: 60, datetime: '', action: 'agent', prompt: '', agentId: '', url: '', message: '', enabled: true };
    const chatModels = Models.chat();
    const mediaModels = (kind) => Models.ofKind(kind);
    sheet({
      title: isNew ? '新建定时任务' : '编辑定时任务',
      body: `
        <div class="field"><label>任务名称 <span class="req">*</span></label>
          <input class="input" id="t-name" value="${escapeHtml(t.name)}" placeholder="例如：每日资讯汇总"></div>
        <div class="field"><label>执行频率</label>
          <div class="row wrap" style="gap:8px">
            ${Object.keys(TYPE_NAMES).map(k => `<button class="chip ${t.type === k ? 'active' : ''}" data-ttype="${k}">${TYPE_NAMES[k]}</button>`).join('')}
          </div></div>
        <div class="field" id="f-once" style="display:${t.type === 'once' ? '' : 'none'}">
          <label>执行时间</label><input class="input" id="t-datetime" type="datetime-local" value="${escapeHtml(toLocalInput(t.datetime))}"></div>
        <div class="field" id="f-daily" style="display:${t.type === 'daily' ? '' : 'none'}">
          <label>每天执行时间</label><input class="input" id="t-time" type="time" value="${escapeHtml(t.time || '09:00')}"></div>
        <div class="field" id="f-weekly" style="display:${t.type === 'weekly' ? '' : 'none'}">
          <label>星期</label>
          <div class="row wrap" style="gap:6px">
            ${['日', '一', '二', '三', '四', '五', '六'].map((d, i) => `<button class="chip ${(t.weekday == null ? 1 : t.weekday) === i ? 'active' : ''}" data-wd="${i}" style="min-width:38px;justify-content:center">${d}</button>`).join('')}
          </div>
          <div class="field mt8"><label>执行时间</label><input class="input" id="t-time-w" type="time" value="${escapeHtml(t.time || '09:00')}"></div></div>
        <div class="field" id="f-interval" style="display:${t.type === 'interval' ? '' : 'none'}">
          <label>每多少分钟执行一次</label><input class="input" id="t-interval" type="number" min="5" max="1440" value="${t.interval || 60}"></div>

        <div class="field"><label>执行动作</label>
          <div class="row wrap" style="gap:8px">
            ${Object.keys(ACTIONS).map(k => `<button class="chip ${t.action === k ? 'active' : ''}" data-tact="${k}">${ACTIONS[k].name}</button>`).join('')}
          </div>
          <div class="hint" id="t-act-desc">${ACTIONS[t.action] ? ACTIONS[t.action].desc : ''}</div></div>

        <div class="field" id="f-agent" style="display:${t.action === 'agent' ? '' : 'none'}">
          <label>智能体</label>
          <select class="select" id="t-agent">
            <option value="">（默认智能体）</option>
            ${Agents.all().map(a => `<option value="${a.id}" ${t.agentId === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}
          </select>
          <div class="field mt8"><label>指令内容</label>
            <textarea class="textarea" id="t-prompt" rows="3" placeholder="例如：搜索今天的 AI 新闻并总结成三条">${escapeHtml(t.prompt || '')}</textarea></div></div>

        <div class="field" id="f-media" style="display:${t.action === 'image' || t.action === 'video' ? '' : 'none'}">
          <label>媒体模型</label>
          <select class="select" id="t-mmodel">
            <option value="">请选择</option>
            ${mediaModels(t.action).map(m => `<option value="${m.id}" ${t.modelId === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
          </select>
          <div class="field mt8"><label>画面描述</label>
            <textarea class="textarea" id="t-mprompt" rows="2">${escapeHtml(t.prompt || '')}</textarea></div>
          <div class="row" style="gap:10px">
            <div class="field" style="flex:1"><label>${t.action === 'video' ? '分辨率' : '尺寸'}</label><input class="input" id="t-size" value="${escapeHtml(t.size || '1024x1024')}"></div>
            <div class="field" style="flex:1"><label>比例</label><input class="input" id="t-ratio" value="${escapeHtml(t.ratio || '1:1')}"></div>
            ${t.action === 'video' ? `<div class="field" style="flex:1"><label>秒数</label><input class="input" id="t-dur" type="number" min="1" max="60" value="${t.duration || 5}"></div>` : ''}
          </div></div>

        <div class="field" id="f-url" style="display:${t.action === 'url' ? '' : 'none'}">
          <label>网址</label><input class="input" id="t-url" value="${escapeHtml(t.url || '')}" placeholder="https://..."></div>

        <div class="field" id="f-notify" style="display:${t.action === 'notify' ? '' : 'none'}">
          <label>提醒内容</label><input class="input" id="t-msg" value="${escapeHtml(t.message || '')}" placeholder="该起床啦 "></div>`,
      onOpen: (mask) => {
        let typeNow = t.type, actNow = t.action, wd = t.weekday == null ? 1 : t.weekday;
        const show = () => {
          mask.querySelector('#f-once').style.display = typeNow === 'once' ? '' : 'none';
          mask.querySelector('#f-daily').style.display = typeNow === 'daily' ? '' : 'none';
          mask.querySelector('#f-weekly').style.display = typeNow === 'weekly' ? '' : 'none';
          mask.querySelector('#f-interval').style.display = typeNow === 'interval' ? '' : 'none';
          mask.querySelector('#f-agent').style.display = actNow === 'agent' ? '' : 'none';
          mask.querySelector('#f-media').style.display = (actNow === 'image' || actNow === 'video') ? '' : 'none';
          mask.querySelector('#f-url').style.display = actNow === 'url' ? '' : 'none';
          mask.querySelector('#f-notify').style.display = actNow === 'notify' ? '' : 'none';
          mask.querySelector('#t-act-desc').textContent = ACTIONS[actNow] ? ACTIONS[actNow].desc : '';
        };
        mask.querySelectorAll('[data-ttype]').forEach(b => b.onclick = () => {
          mask.querySelectorAll('[data-ttype]').forEach(x => x.classList.remove('active'));
          b.classList.add('active'); typeNow = b.dataset.ttype; show();
        });
        mask.querySelectorAll('[data-tact]').forEach(b => b.onclick = () => {
          mask.querySelectorAll('[data-tact]').forEach(x => x.classList.remove('active'));
          b.classList.add('active'); actNow = b.dataset.tact; show();
        });
        mask.querySelectorAll('[data-wd]').forEach(b => b.onclick = () => {
          mask.querySelectorAll('[data-wd]').forEach(x => x.classList.remove('active'));
          b.classList.add('active'); wd = parseInt(b.dataset.wd, 10);
        });
      },
      actions: [
        { text: '取消', cls: 'gray' },
        {
          text: isNew ? '创建' : '保存', onClick: (mask, close) => {
            const g = (id) => { const el = mask.querySelector(id); return el ? el.value.trim() : ''; };
            const typeEl = mask.querySelector('[data-ttype].active');
            const actEl = mask.querySelector('[data-tact].active');
            const data = {
              name: g('#t-name') || '未命名任务',
              type: typeEl ? typeEl.dataset.ttype : 'daily',
              action: actEl ? actEl.dataset.tact : 'agent',
              enabled: t.enabled !== false
            };
            if (data.type === 'once') data.datetime = g('#t-datetime') || new Date(Date.now() + 3600000).toISOString().slice(0, 16);
            if (data.type === 'daily') data.time = g('#t-time') || '09:00';
            if (data.type === 'weekly') { data.time = g('#t-time-w') || '09:00'; data.weekday = wd; }
            if (data.type === 'interval') data.interval = Math.max(5, parseInt(g('#t-interval')) || 60);
            if (data.action === 'agent') { data.agentId = g('#t-agent') || null; data.prompt = g('#t-prompt'); }
            if (data.action === 'image' || data.action === 'video') {
              data.modelId = g('#t-mmodel') || null; data.prompt = g('#t-mprompt');
              data.size = g('#t-size'); data.ratio = g('#t-ratio');
              if (data.action === 'video') data.duration = parseInt(g('#t-dur')) || 5;
            }
            if (data.action === 'url') data.url = g('#t-url');
            if (data.action === 'notify') data.message = g('#t-msg');
            if (!data.name) { toast('请填写任务名称', 'err'); return; }
            if (data.action === 'agent' && !data.prompt) { toast('请填写指令内容', 'err'); return; }
            if ((data.action === 'image' || data.action === 'video') && !data.modelId) { toast('请选择媒体模型', 'err'); return; }
            if (isNew) Tasks.add(data); else Tasks.update(t.id, data);
            toast(isNew ? '✓ 任务已创建' : '✓ 已保存', 'ok');
            close(null);
            window.App.refresh();
          }
        }
      ]
    });
  }

  function toLocalInput(v) {
    if (!v) return new Date(Date.now() + 3600000).toISOString().slice(0, 16);
    const d = new Date(v);
    if (isNaN(d)) return new Date(Date.now() + 3600000).toISOString().slice(0, 16);
    const pad = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /* ---------- 执行任务 ---------- */
  async function execute(task, manual) {
    if (executing.has(task.id) && !manual) return;
    executing.add(task.id);
    window.App.refresh();
    try {
      if (task.action === 'agent') {
        const agent = (task.agentId && Agents.get(task.agentId)) || Agents.active() || Agents.all()[0];
        const model = (agent && agent.modelId && Models.get(agent.modelId)) || Models.defaultChat();
        if (!model) throw new Error('没有可用的对话模型');
        // 与对话页一致：带能力说明的系统提示词 + 工具/子智能体循环（最多 2 轮）
        const msgs = [{ role: 'system', content: window.ChatPage.effectiveSystem(agent) }, { role: 'user', content: task.prompt }];
        let text = '';
        for (let round = 0; round < 2; round++) {
          text = await window.API.chatStream(model, msgs, {});
          const actions = window.AgentTools.parse(text);
          if (!actions.length) break;
          const results = [];
          for (const a of actions) {
            const r = await window.AgentTools.execute(a, { model });
            results.push('【' + a.tool + '】' + (a.arg ? '（' + a.arg.slice(0, 60) + '）' : '') + '\n' + r.text);
          }
          msgs.push({ role: 'assistant', content: text });
          msgs.push({ role: 'user', content: '【系统】工具执行结果：\n\n' + results.join('\n\n') + '\n请基于结果继续，完成后输出最终结果。' });
        }
        const path = '/home/agent/下载/任务-' + new Date().toISOString().slice(0, 10) + '-' + task.id.slice(-5) + '.txt';
        try { FS.writeFile(path, `任务：${task.name}\n时间：${new Date().toLocaleString('zh-CN')}\n\n${text}\n`); } catch (e) {}
        Tasks.markRun(task.id, true, '已完成，结果存至 ' + path);
        toast(' ' + task.name + ' 执行完成', 'ok');
      } else if (task.action === 'image' || task.action === 'video') {
        const model = Models.get(task.modelId);
        if (!model) throw new Error('媒体模型不存在');
        const r = await window.API.generateMedia(model, {
          prompt: task.prompt, size: task.size, ratio: task.ratio,
          duration: task.action === 'video' ? (task.duration || 5) : undefined,
          n: task.action === 'image' ? 1 : undefined
        }, {});
        Media.add({ kind: task.action, modelId: model.id, modelName: model.name, prompt: task.prompt, status: 'done', url: r.url, elapsed: r.elapsed });
        Tasks.markRun(task.id, true, '生成成功：' + r.url.slice(0, 60));
        toast(' ' + task.name + '：媒体已生成', 'ok');
      } else if (task.action === 'url') {
        const r = await Native.openUrl(task.url);
        if (r && r.__unsupported) window.open(task.url, '_blank');
        Tasks.markRun(task.id, true, '已打开 ' + task.url);
      } else if (task.action === 'notify') {
        toast(' ' + (task.message || task.name));
        Tasks.markRun(task.id, true, task.message || '已通知');
      }
    } catch (e) {
      Tasks.markRun(task.id, false, e.message || String(e));
      toast(' ' + task.name + ' 失败：' + (e.message || ''), 'err');
    } finally {
      executing.delete(task.id);
      window.App.refresh();
    }
  }

  /* ---------- 调度器（应用内每 20 秒检查一次） ---------- */
  function startScheduler() {
    if (schedulerId) return;
    schedulerId = setInterval(() => {
      const due = Tasks.due();
      due.forEach(t => execute(t, false));
    }, 20000);
  }

  /* ---------- 事件 ---------- */
  async function onAction(act, el, container) {
    const id = el.dataset.id;
    if (act === 'add-task') { editor(null); return; }
    if (act === 'edit-task') { editor(Tasks.get(id)); return; }
    if (act === 'del-task') {
      const t = Tasks.get(id);
      const ok = await confirmDialog({ title: '删除任务', body: `确定删除「${t.name}」？`, okText: '删除', danger: true });
      if (ok) { Tasks.remove(id); window.App.refresh(); }
      return;
    }
    if (act === 'toggle-task') {
      const t = Tasks.get(id);
      Tasks.update(id, { enabled: !t.enabled });
      window.App.refresh();
      return;
    }
    if (act === 'run-now') {
      const t = Tasks.get(id);
      if (t) await execute(t, true);
      return;
    }
  }

  window.TasksPage = { render, onAction, execute };
})();
