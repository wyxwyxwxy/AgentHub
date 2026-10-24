/* ============ 智能体页（v2.2：单主智能体 + 自繁衍动态智能体 + 技能库） ============
 * 只有一个主智能体自由对话；专业能力由它按需自动 spawn 子智能体（自繁衍），
 * 用户不预分类、不手动创建——所有子智能体都是对话过程中动态诞生的。
 */
(function () {
  const { $, $$, toast, sheet, confirmDialog, escapeHtml, icons } = window.UI;
  const { Agents, Models, DynamicAgents, Skills, SpawnLog } = window.Store;

  const AVATARS = ['agents', 'network', 'brain', 'zap', 'dna', 'layers', 'sparkles', 'cube'];
  const COLORS = ['#16a34a', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#6366f1'];

  function modelName(id) {
    const m = Models.get(id);
    return m ? m.name + ' · ' + m.model : '跟随对话页当前模型';
  }
  function timeAgo(ts) {
    if (!ts) return '';
    const d = Date.now() - ts;
    if (d < 60e3) return '刚刚';
    if (d < 3600e3) return Math.floor(d / 60e3) + ' 分钟前';
    if (d < 86400e3) return Math.floor(d / 3600e3) + ' 小时前';
    return Math.floor(d / 86400e3) + ' 天前';
  }

  function render(container) {
    const active = Agents.active();
    const dyn = DynamicAgents.all();
    const installed = Skills.installed().length;
    const logs = SpawnLog.all().slice(0, 8);
    container.innerHTML = `
      <div class="page" data-page="agents">
        <div class="page-header">
          <h1>智能体<span class="sub">单智能体 · 按需自繁衍子智能体</span></h1>
          <button class="icon-btn" data-act="goto-monitor" title="实时活动看板">${icons.monitor}</button>
        </div>
        <div class="page-body">
          <div class="card">
            <div class="card-title">主智能体</div>
            <div class="row" style="gap:12px;align-items:center;margin-bottom:12px">
              <div class="agent-avatar" style="width:52px;height:52px;font-size:26px;background:${active.color}18;border-color:${active.color}55">${icons[active.avatar] || icons.agents}</div>
              <div class="li-main">
                <div class="li-title" style="font-size:16px">${escapeHtml(active.name)} <span class="badge">使用中</span></div>
                <div class="li-sub">${escapeHtml(active.desc || '')}</div>
                <div class="li-sub" style="margin-top:3px">${icons.models.replace('<svg', '<svg style="width:12px;height:12px;vertical-align:-2px"')} ${escapeHtml(modelName(active.modelId))}</div>
              </div>
            </div>
            <div class="muted" style="margin-bottom:12px">
              只有一个主智能体，在对话页自由聊天。遇到写代码、联网检索、生成图片视频、3D 建模等任务时，它会<strong>自己创造并派遣子智能体</strong>并行去干，最后汇总结果——你不需要预先创建或分类任何智能体。
            </div>
            <div class="row" style="gap:8px">
              <button class="btn ghost" data-act="edit-agent" style="flex:1">编辑主智能体</button>
              <button class="btn ghost" data-act="goto-mindmap" style="flex:1">${icons.network.replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"')} 协作视图</button>
            </div>
          </div>

          <div class="card">
            <div class="card-title">已创造的智能体 <span class="muted-sm" style="font-weight:400">${dyn.length} 个 · 对话中自动诞生</span></div>
            <div class="muted" style="margin-bottom:12px">主智能体执行 <code>[[ACTION:spawn|角色|任务]]</code> 时按需创造，可被反复复用，也能再创造下一级。这里只做查看与管理。</div>
            ${dyn.length ? `<div style="display:flex;flex-direction:column;gap:10px">
              ${dyn.map(a => `
                <div class="subagent-item">
                  <div class="subagent-icon" style="background:var(--green-50);border-color:var(--green-200);color:var(--green)">${icons.dna.replace('<svg', '<svg style="width:18px;height:18px"')}</div>
                  <div class="li-main">
                    <div class="li-title">${escapeHtml(a.name)}</div>
                    <div class="li-sub">派遣 ${a.uses || 0} 次${a.lastAt ? ' · ' + escapeHtml(timeAgo(a.lastAt)) : ''}</div>
                    ${a.prompt ? `<div class="li-sub muted-sm" style="margin-top:3px">${escapeHtml(a.prompt.slice(0, 80))}${a.prompt.length > 80 ? '…' : ''}</div>` : ''}
                  </div>
                  <button class="icon-btn" data-da-del="${a.id}" title="删除">${icons.close}</button>
                </div>`).join('')}
            </div>
            <div class="row" style="gap:8px;margin-top:12px">
              <button class="btn gray sm" data-act="da-clear">全部清空</button>
            </div>` : `
            <div class="empty" style="padding:26px 0">
              <div style="font-size:34px;margin-bottom:8px">${icons.dna}</div>
              <div>还没有创造过子智能体</div>
              <div class="muted-sm" style="margin-top:4px">对主智能体说「帮我写个网站 / 调研某话题 / 画张图」就会自动诞生</div>
            </div>`}
          </div>

          <div class="card">
            <div class="card-title">技能库 <span class="muted-sm" style="font-weight:normal">${installed} 个已安装</span></div>
            <div class="muted" style="margin-bottom:12px">技能是预置了提示词与工具权限的专业能力包，主智能体可按需调用，你也可以安装/编写自己的技能。</div>
            <button class="btn primary block" data-act="goto-skills">${icons.zap.replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"')} 打开技能库</button>
          </div>

          <div class="card">
            <div class="card-title">最近派遣记录</div>
            ${logs.length ? `<div style="display:flex;flex-direction:column;gap:8px">
              ${logs.map(l => `
                <div class="list-row" style="display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:11px">
                  <span style="flex:none">${l.status === 'running' ? '…' : l.status === 'error' ? '!' : '✓'}</span>
                  <div class="li-main" style="min-width:0">
                    <div class="li-title" style="font-size:13px">${escapeHtml(l.role || '子智能体')}</div>
                    <div class="li-sub" style="font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(l.task || '')}</div>
                  </div>
                  <span class="muted-sm" style="flex:none">${escapeHtml(timeAgo(l.at))}</span>
                </div>`).join('')}
            </div>` : '<div class="muted" style="padding:8px 0">暂无记录</div>'}
          </div>

          <div class="card">
            <div class="card-title">协作是怎么发生的</div>
            <div class="muted" style="margin-bottom:10px">你对主智能体说一句话，它自己决定要不要派子智能体。例如你说：</div>
            <div class="code-block">帮我用 Python 写一个贪吃蛇，同时画一个官网首页</div>
            <div class="muted" style="margin:10px 0">主智能体可在一轮里派出多个子智能体并行执行：</div>
            <div class="code-block">[[ACTION:spawn|编程助手|用 Python 写贪吃蛇…]]
[[ACTION:spawn|网页设计师|做一个官网首页…]]</div>
            <div class="muted" style="margin-top:10px">多个行动并行跑，每个都有独立进度卡片；子智能体干完活把结果交回主智能体汇总。点右上角「协作视图」可看实时发散图。</div>
          </div>
        </div>
      </div>`;

    // 删除单个动态智能体
    container.querySelectorAll('[data-da-del]').forEach(b => {
      b.onclick = async () => {
        const ok = await confirmDialog('删除该智能体？', '删除后不影响主智能体，下次需要时会重新创造。');
        if (!ok) return;
        DynamicAgents.remove(b.dataset.daDel);
        toast('已删除');
        render(container);
      };
    });
  }

  /* ---------- 主智能体编辑器 ---------- */
  function editor(agent) {
    const a = agent || Agents.active();
    if (!a) { toast('主智能体缺失', 'err'); return; }
    const models = Models.chat();
    sheet({
      title: '编辑主智能体',
      body: `
        <div class="field">
          <label>名称 <span class="req">*</span></label>
          <input class="input" id="a-name" placeholder="例如：主智能体" value="${escapeHtml(a.name)}">
        </div>
        <div class="field">
          <label>头像</label>
          <div class="row wrap" style="gap:6px">
            ${AVATARS.map(av => `<button class="chip av-chip" data-av="${av}" style="padding:6px 9px;${av === a.avatar ? 'background:var(--green);color:#fff;border-color:var(--green)' : ''}">${icons[av]}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>主题色</label>
          <div class="row wrap" style="gap:8px">
            ${COLORS.map(c => `<button data-color="${c}" style="width:30px;height:30px;border-radius:50%;background:${c};border:2.5px solid ${c === a.color ? 'var(--text)' : 'transparent'};box-shadow:0 1px 4px rgba(0,0,0,.15)"></button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>职责描述</label>
          <input class="input" id="a-desc" placeholder="例如：负责理解意图、规划任务、汇总结果" value="${escapeHtml(a.desc || '')}">
        </div>
        <div class="field">
          <label>绑定模型</label>
          <select class="select" id="a-model">
            <option value="">跟随对话页当前模型</option>
            ${models.map(m => `<option value="${m.id}" ${m.id === a.modelId ? 'selected' : ''}>${escapeHtml(m.name)}（${escapeHtml(m.model)}）</option>`).join('')}
          </select>
          <div class="hint">不绑定则使用对话页顶部选择的模型</div>
        </div>
        <div class="field">
          <label>系统提示词（人设）</label>
          <textarea class="textarea" id="a-prompt" rows="6" placeholder="定义主智能体的角色、语气与专长；留空则使用内置默认提示词（含自繁衍协作协议）……">${escapeHtml(a.systemPrompt || '')}</textarea>
          <div class="row" style="gap:8px;margin-top:8px">
            <button class="btn gray sm" id="a-fill-default">填入默认提示词</button>
            <button class="btn gray sm" id="a-clear">清空</button>
          </div>
          <div class="hint">默认提示词已说明如何按需 spawn 子智能体；自定义后如仍想用协作协议，请保留其中的 [[ACTION:spawn|...]] 说明。</div>
        </div>`,
      onOpen: (mask) => {
        mask.querySelectorAll('[data-av]').forEach(b => b.onclick = () => {
          mask.querySelectorAll('[data-av]').forEach(x => { x.style.background = ''; x.style.color = ''; x.style.borderColor = ''; });
          b.style.background = 'var(--green)'; b.style.color = '#fff'; b.style.borderColor = 'var(--green)';
          mask._avatar = b.dataset.av;
        });
        mask.querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
          mask.querySelectorAll('[data-color]').forEach(x => x.style.borderColor = 'transparent');
          b.style.borderColor = 'var(--text)';
          mask._color = b.dataset.color;
        });
        mask._avatar = a.avatar; mask._color = a.color;
        const ta = mask.querySelector('#a-prompt');
        mask.querySelector('#a-fill-default').onclick = () => { ta.value = window.SubAgents.mainPrompt(); };
        mask.querySelector('#a-clear').onclick = () => { ta.value = ''; };
      },
      actions: [
        { text: '取消', cls: 'gray' },
        {
          text: '保存', onClick: (mask, close) => {
            const data = {
              name: mask.querySelector('#a-name').value.trim(),
              avatar: mask._avatar || a.avatar,
              color: mask._color || a.color,
              desc: mask.querySelector('#a-desc').value.trim(),
              modelId: mask.querySelector('#a-model').value || null,
              systemPrompt: mask.querySelector('#a-prompt').value.trim()
            };
            if (!data.name) { toast('请填写名称', 'err'); return; }
            Agents.update(a.id, data);
            toast('已保存 ✓', 'ok');
            close(null);
            window.App.refresh();
          }
        }
      ]
    });
  }

  /* ---------- 事件 ---------- */
  function onAction(act, el, container) {
    if (act === 'edit-agent') { editor(Agents.active()); return; }
    if (act === 'goto-mindmap') { window.App.push('mindmap'); return; }
    if (act === 'goto-skills') { window.App.push('skills'); return; }
    if (act === 'goto-monitor') { window.App.push('monitor'); return; }
    if (act === 'da-clear') {
      confirmDialog('清空所有已创造智能体？', '仅清空记录，主智能体随时可以重新创造。').then(ok => {
        if (!ok) return;
        DynamicAgents.clear();
        toast('已清空');
        render(container);
      });
    }
  }

  window.AgentsPage = { render, onAction, editor };
})();
