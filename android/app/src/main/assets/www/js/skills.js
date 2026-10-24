/* ============ 技能库页（v2.2） ============
 * 浏览 / 安装 / 编写技能：技能 = 提示词 + 工具白名单的专业能力包，
 * 主智能体通过 [[ACTION:skill|技能id|任务]] 调用。
 */
(function () {
  const { $, $$, toast, sheet, confirmDialog, escapeHtml, icons } = window.UI;
  const { Skills } = window.Store;

  const ICON_CHOICES = ['web', 'cube', 'code', 'shield', 'chart', 'pen', 'search', 'image', 'video', 'brain', 'zap', 'file', 'sparkles', 'layers', 'eye', 'wind'];
  const ALL_TOOLS = window.AgentTools.TOOLS.map(t => t.name);

  function iconHtml(key, cls) {
    const svg = icons[key] || icons.zap;
    return cls ? svg.replace('<svg', `<svg class="${cls}"`) : svg;
  }

  function render(container) {
    const skills = Skills.all();
    container.innerHTML = `
      <div class="muted" style="padding:4px 2px 12px">主智能体遇到专业任务时会调用已安装技能；也可以自己编写技能，定义提示词与可用工具。</div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <button class="btn primary sm" data-act="new-skill">${icons.close.replace('d="M6 6L18 18M18 6L6 18"', 'd="M12 5v14M5 12h14"')} 新建技能</button>
      </div>
          <div class="apps-grid">
            ${skills.map(s => `
              <div class="app-tile skill-card" style="border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;gap:8px;${s.installed === false ? 'opacity:.55' : ''}">
                <div class="skill-head">
                  <div class="skill-icon" style="width:38px;height:38px;flex:none;border-radius:11px;display:flex;align-items:center;justify-content:center;background:var(--green-50);border:1px solid var(--green-200)">${iconHtml(s.icon)}</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:14px;font-weight:700">${escapeHtml(s.name)}</div>
                    <div style="font-size:11px;color:var(--muted)">${s.builtin ? '内置' : '自定义'}</div>
                  </div>
                  <input type="checkbox" class="switch" data-skill-sw="${s.id}" ${s.installed !== false ? 'checked' : ''} title="安装/卸载">
                </div>
                <div style="font-size:12px;color:var(--muted);line-height:1.5">${escapeHtml(s.desc || '')}</div>
                <div style="display:flex;flex-wrap:wrap;gap:5px">
                  ${(s.tools || []).map(t => `<span class="tool-chip">${escapeHtml(t)}</span>`).join('') || '<span class="muted-sm">纯推理</span>'}
                </div>
                <div class="skill-acts" style="display:flex;gap:8px;margin-top:2px">
                  <button class="btn gray sm" data-skill-edit="${s.id}" style="flex:1;padding:7px 0;font-size:12.5px">编辑</button>
                  ${s.builtin ? '' : `<button class="btn gray sm" data-skill-del="${s.id}" style="flex:1;padding:7px 0;font-size:12.5px">删除</button>`}
                </div>
              </div>`).join('')}
          </div>
        </div>`;

    container.querySelectorAll('[data-skill-sw]').forEach(cb => {
      cb.onchange = () => {
        Skills.setInstalled(cb.dataset.skillSw, cb.checked);
        toast(cb.checked ? '已安装 ✓' : '已卸载');
        render(container);
      };
    });
    container.querySelectorAll('[data-skill-edit]').forEach(b => b.onclick = () => editor(Skills.get(b.dataset.skillEdit)));
    container.querySelectorAll('[data-skill-del]').forEach(b => b.onclick = async () => {
      const s = Skills.get(b.dataset.skillDel);
      const ok = await confirmDialog(`删除技能「${s.name}」？`, '删除后主智能体将无法调用该技能。');
      if (!ok) return;
      Skills.remove(s.id);
      toast('已删除');
      render(container);
    });
  }

  /* ---------- 技能编辑器 ---------- */
  function editor(skill) {
    const isNew = !skill;
    const s = skill || { name: '', desc: '', prompt: '', icon: 'zap', tools: [] };
    sheet({
      title: isNew ? '新建技能' : '编辑技能',
      body: `
        <div class="field">
          <label>名称 <span class="req">*</span></label>
          <input class="input" id="sk-name" placeholder="例如：小红书文案" value="${escapeHtml(s.name)}">
        </div>
        <div class="field">
          <label>图标</label>
          <div class="row wrap" style="gap:6px">
            ${ICON_CHOICES.map(ic => `<button class="chip" data-sk-ic="${ic}" style="padding:6px 8px;${ic === s.icon ? 'background:var(--green);color:#fff;border-color:var(--green)' : ''}">${iconHtml(ic)}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>一句话描述</label>
          <input class="input" id="sk-desc" placeholder="例如：写带 emoji 的小红书爆款文案" value="${escapeHtml(s.desc || '')}">
        </div>
        <div class="field">
          <label>技能提示词 <span class="req">*</span></label>
          <textarea class="textarea" id="sk-prompt" rows="5" placeholder="定义这个技能执行时的角色、步骤与产出要求……">${escapeHtml(s.prompt || '')}</textarea>
        </div>
        <div class="field">
          <label>可用工具</label>
          <div class="row wrap" style="gap:6px">
            ${ALL_TOOLS.map(t => `<button class="chip" data-sk-tool="${t}" style="font-size:11.5px;${(s.tools || []).includes(t) ? 'background:var(--green);color:#fff;border-color:var(--green)' : ''}">${t}</button>`).join('')}
          </div>
          <div class="hint">不选则只做纯文本推理。写文件用 fs.write、联网用 browser.*、生成图片视频用 media.*。</div>
        </div>`,
      onOpen: (mask) => {
        const tools = new Set(s.tools || []);
        let icon = s.icon || 'zap';
        mask.querySelectorAll('[data-sk-ic]').forEach(b => b.onclick = () => {
          mask.querySelectorAll('[data-sk-ic]').forEach(x => { x.style.background = ''; x.style.color = ''; x.style.borderColor = ''; });
          b.style.background = 'var(--green)'; b.style.color = '#fff'; b.style.borderColor = 'var(--green)';
          icon = b.dataset.skIc;
        });
        mask.querySelectorAll('[data-sk-tool]').forEach(b => b.onclick = () => {
          const t = b.dataset.skTool;
          if (tools.has(t)) { tools.delete(t); b.style.background = ''; b.style.color = ''; b.style.borderColor = ''; }
          else { tools.add(t); b.style.background = 'var(--green)'; b.style.color = '#fff'; b.style.borderColor = 'var(--green)'; }
        });
        mask._tools = tools; mask._icon = () => icon;
      },
      actions: [
        { text: '取消', cls: 'gray' },
        {
          text: isNew ? '创建' : '保存', onClick: (mask, close) => {
            const data = {
              name: mask.querySelector('#sk-name').value.trim(),
              desc: mask.querySelector('#sk-desc').value.trim(),
              prompt: mask.querySelector('#sk-prompt').value.trim(),
              icon: mask._icon(),
              tools: Array.from(mask._tools)
            };
            if (!data.name) { toast('请填写名称', 'err'); return; }
            if (!data.prompt) { toast('请填写技能提示词', 'err'); return; }
            if (isNew) Skills.add(data); else Skills.update(s.id, data);
            toast(isNew ? '已创建 ✓' : '已保存 ✓', 'ok');
            close(null);
            window.App.refresh();
          }
        }
      ]
    });
  }

  function onAction(act, el, container) {
    if (act === 'new-skill') { editor(null); return; }
  }

  window.SkillsPage = { render, onAction, editor };
})();
