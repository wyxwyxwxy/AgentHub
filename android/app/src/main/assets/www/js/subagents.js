/* ============ 子智能体引擎（v2.2：自繁衍 + 并行 + 技能） ============
 * 主智能体只有一个；需要专业分工时它自己「创造」子智能体：
 *   [[ACTION:spawn|角色名|任务]]   —— 动态创造一个子智能体并执行（可复用、可再次繁衍）
 *   [[ACTION:skill|技能id|任务]]   —— 调用一个已安装技能
 * 一条回复里多个 spawn 会并行执行；全过程通过事件总线实时广播（思维导图消费）。
 */
(function () {
  const { DynamicAgents, Skills, SpawnLog } = window.Store;

  const MAX_DEPTH = 3;        // 主(0) → 子(1) → 孙(2) → 曾孙(3)
  const MAX_CONCURRENT = 40;  // 同时最多运行的子智能体（避免打爆接口）
  const MAX_TOTAL_AGENTS = 300; // 累计可创造的子智能体上限
  let running = 0;
  const queue = [];

  /* ---------- 事件总线 ---------- */
  const listeners = {};
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function off(evt, fn) {
    const a = listeners[evt] || [];
    const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
  }
  function emit(evt, data) {
    (listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) {} });
    (listeners['*'] || []).forEach(fn => { try { fn(Object.assign({ evt }, data)); } catch (e) {} });
  }

  /* ---------- 并发闸门 ---------- */
  function acquire() {
    if (running < MAX_CONCURRENT) { running++; return Promise.resolve(); }
    return new Promise(res => queue.push(res));
  }
  function release() {
    if (queue.length) queue.shift()();
    else running--;
  }

  /* ---------- 工具文档 ---------- */
  const ALL_TOOLS = () => (window.AgentTools && window.AgentTools.TOOLS) || [];

  function toolDoc(allowed, canSpawn) {
    const mine = ALL_TOOLS().filter(t => allowed.indexOf(t.name) >= 0).map(t => '- ' + t.desc);
    if (canSpawn) mine.push('- spawn|角色名|任务 —— 创造一个子智能体并行干活（可多个）');
    if (!mine.length) return '【可用工具】你当前没有可调用的工具，请直接用专业知识完成任务，输出最终结果。';
    return '【可用工具】需要时在回复中输出一行 [[ACTION:工具|参数]]（可多个），系统执行后把结果回给你：\n' + mine.join('\n') +
      '\n规则：拿到结果后直接继续，不要重复相同调用；完成时输出最终结果。';
  }

  /* ---------- 核心：运行一个子智能体 ---------- */
  /**
   * @param role 角色名（动态创造/复用）
   * @param task 任务描述
   * @param opts {model, signal, onStatus, onDelta, depth}
   */
  async function spawn(role, task, opts = {}) {
    const depth = opts.depth || 1;
    if (DynamicAgents.all().length >= MAX_TOTAL_AGENTS) {
      return { ok: false, text: '已达子智能体上限（' + MAX_TOTAL_AGENTS + ' 个），请复用已有角色或清理后再创造。' };
    }
    const da = DynamicAgents.ensure(role);
    DynamicAgents.touch(da.id);
    const canSpawn = depth < MAX_DEPTH;
    const logId = SpawnLog.add({ role: da.name, task: String(task || '').slice(0, 80), agentId: da.id, status: 'running' }).id;
    const t0 = Date.now();
    emit('spawn:start', { id: logId, agentId: da.id, role: da.name, task: String(task || '').slice(0, 80), depth, kind: 'agent' });

    await acquire();
    try {
      const sys = (da.prompt ? da.prompt + '\n\n' : '') +
        '你是主智能体创造出的子智能体「' + da.name + '」，独立完成下面交代的任务。' +
        '只输出你职责范围内的产出，保持精炼；完成后给出最终结果。\n\n' +
        toolDoc(ALL_TOOLS().map(t => t.name).concat('skill'), canSpawn);
      const msgs = [{ role: 'system', content: sys }, { role: 'user', content: String(task || '') }];
      let last = '';
      for (let turn = 0; turn < 4; turn++) {
        let out = '';
        await window.API.chatStream(opts.model, msgs, {
          signal: opts.signal,
          onDelta: (_, full) => {
            out = full;
            emit('spawn:delta', { id: logId, agentId: da.id, role: da.name, type: 'streaming', full });
            emit('spawn:status', { id: logId, agentId: da.id, role: da.name, type: 'streaming', text: '生成中' });
            opts.onDelta && opts.onDelta(full);
          }
        });
        last = out;
        const actions = window.AgentTools.parse(out);
        if (!actions.length) break;
        const results = [];
        for (const a of actions) {
          if (a.tool === 'spawn' && !canSpawn) {
            results.push('【spawn】你已达繁衍深度上限，请自己完成。');
            continue;
          }
          if (opts.signal && opts.signal.aborted) break;
          emit('spawn:status', { id: logId, type: 'tool', text: '→ ' + a.tool });
          opts.onStatus && opts.onStatus(' ' + da.name + ' → ' + a.tool);
          const r = await window.AgentTools.execute(a, {
            model: opts.model, signal: opts.signal, depth,
            onStatus: (s) => { emit('spawn:status', { id: logId, type: 'tool', text: s }); opts.onStatus && opts.onStatus(s); },
            onDelta: (full) => { emit('spawn:delta', { id: logId, full }); opts.onDelta && opts.onDelta(full); }
          });
          results.push('【' + a.tool + '】' + (a.arg ? '（' + a.arg.slice(0, 60) + '）' : '') + '\n' + r.text);
        }
        msgs.push({ role: 'assistant', content: out });
        msgs.push({
          role: 'user',
          content: '【系统】工具执行结果：\n\n' + results.join('\n\n') + '\n\n请基于结果继续；已完成就直接输出最终结果，不要重复相同调用。'
        });
      }
      const text = window.AgentTools.strip(last);
      SpawnLog.update(logId, { status: 'done', ms: Date.now() - t0, text: text.slice(0, 200) });
      emit('spawn:done', { id: logId, agentId: da.id, role: da.name, ok: true, ms: Date.now() - t0, text: text.slice(0, 200) });
      return { ok: true, text, agentId: da.id, logId };
    } catch (e) {
      const aborted = e && (e.name === 'AbortError' || e.message === 'aborted');
      SpawnLog.update(logId, { status: aborted ? 'stopped' : 'failed', ms: Date.now() - t0 });
      emit('spawn:done', { id: logId, agentId: da.id, role: da.name, ok: false, aborted });
      if (aborted) return { ok: false, text: '（' + da.name + ' 已被停止）', agentId: da.id, logId };
      return { ok: false, text: '子智能体「' + da.name + '」执行出错：' + (e.message || String(e)), agentId: da.id, logId };
    } finally {
      release();
    }
  }

  /* ---------- 执行一个已安装技能 ---------- */
  async function runSkill(skillId, task, opts = {}) {
    const sk = Skills.get(skillId);
    if (!sk) {
      const ids = Skills.installed().map(s => s.id).join(', ');
      return { ok: false, text: '未安装的技能：' + skillId + '。已安装：' + (ids || '无，请先到「智能体 → 技能库」安装') };
    }
    if (sk.installed === false) return { ok: false, text: '技能「' + sk.name + '」未安装，请先到技能库安装' };
    const logId = SpawnLog.add({ role: sk.name, task: String(task || '').slice(0, 80), skillId: sk.id, status: 'running' }).id;
    const t0 = Date.now();
    emit('spawn:start', { id: logId, role: sk.name, task: String(task || '').slice(0, 80), skill: sk.id, depth: 1 });
    await acquire();
    try {
      const msgs = [
        { role: 'system', content: sk.prompt + '\n\n' + toolDoc(sk.tools || [], false) },
        { role: 'user', content: String(task || '') }
      ];
      let last = '';
      for (let turn = 0; turn < 4; turn++) {
        let out = '';
        await window.API.chatStream(opts.model, msgs, {
          signal: opts.signal,
          onDelta: (_, full) => {
            out = full;
            emit('spawn:delta', { id: logId, agentId: da.id, role: da.name, type: 'streaming', full });
            emit('spawn:status', { id: logId, agentId: da.id, role: da.name, type: 'streaming', text: '生成中' });
            opts.onDelta && opts.onDelta(full);
          }
        });
        last = out;
        const actions = window.AgentTools.parse(out);
        if (!actions.length) break;
        const results = [];
        for (const a of actions) {
          if ((sk.tools || []).indexOf(a.tool) < 0) {
            results.push('【' + a.tool + '】不在本技能职权范围内，已忽略，请用自身知识完成。');
            continue;
          }
          if (opts.signal && opts.signal.aborted) break;
          opts.onStatus && opts.onStatus(' ' + sk.name + ' → ' + a.tool);
          const r = await window.AgentTools.execute(a, {
            model: opts.model, signal: opts.signal, depth: 1,
            onStatus: (s) => opts.onStatus && opts.onStatus(s)
          });
          results.push('【' + a.tool + '】' + (a.arg ? '（' + a.arg.slice(0, 60) + '）' : '') + '\n' + r.text);
        }
        msgs.push({ role: 'assistant', content: out });
        msgs.push({
          role: 'user',
          content: '【系统】工具执行结果：\n\n' + results.join('\n\n') + '\n\n请基于结果继续；已完成就直接输出最终结果。'
        });
      }
      const text = window.AgentTools.strip(last);
      SpawnLog.update(logId, { status: 'done', ms: Date.now() - t0, text: text.slice(0, 200) });
      emit('spawn:done', { id: logId, role: sk.name, ok: true, ms: Date.now() - t0, text: text.slice(0, 200), skill: sk.id });
      return { ok: true, text, logId };
    } catch (e) {
      const aborted = e && (e.name === 'AbortError' || e.message === 'aborted');
      SpawnLog.update(logId, { status: aborted ? 'stopped' : 'failed', ms: Date.now() - t0 });
      emit('spawn:done', { id: logId, role: sk.name, ok: false, aborted, skill: sk.id });
      if (aborted) return { ok: false, text: '（' + sk.name + ' 已被停止）', logId };
      return { ok: false, text: '技能「' + sk.name + '」执行出错：' + (e.message || String(e)), logId };
    } finally {
      release();
    }
  }

  /* ---------- 并行执行一组作业 ---------- */
  async function runAll(jobs, opts = {}) {
    return Promise.all(jobs.map(j => {
      if (j.type === 'skill') return runSkill(j.id, j.task, opts);
      return spawn(j.role, j.task, opts);
    }));
  }

  /* ---------- 能力说明（注入主智能体系统提示词） ---------- */
  function capsDoc() {
    const tools = ALL_TOOLS().map(t => '- ' + t.desc);
    const skills = Skills.installed().map(s => '- skill|' + s.id + '|任务 —— 「' + s.name + '」：' + s.desc);
    const dyn = DynamicAgents.all().slice(-10).map(a => '- spawn|' + a.name + '|任务 —— （已创造过，可直接复用）');
    return '【行动指令协议】\n' +
      '需要联网、生成媒体、写文件、专业分工时，在回复中输出行动指令（可多个，同类的会并行执行），系统执行后把结果回给你，然后基于结果继续：\n' +
      '格式：[[ACTION:工具|参数]]\n\n' +
      '你可以随时「创造」任何需要的子智能体来并行干活（它们还能再创造下一级，最多两层）：\n' +
      '- spawn|角色名|任务 —— 例：[[ACTION:spawn|贪吃蛇开发员|用 Python 写贪吃蛇并存到 /home/agent/workspace/game.py]]\n\n' +
      '可直接调用的工具：\n' + tools.join('\n') + '\n\n' +
      '已安装的技能（专业能力包，优先使用）：\n' + (skills.join('\n') || '（无）') + '\n\n' +
      (dyn.length ? '你以前创造过的子智能体（同名会复用，不会重复创造）：\n' + dyn.join('\n') + '\n\n' : '') +
      '分工建议：复杂任务拆成多个独立子任务并行派遣；需要设计/3D/代码时用对应技能；拿到结果后汇总回复用户，不要重复相同调用；日常闲聊与简单问答不需要输出指令。';
  }

  /** 主智能体默认系统提示词（已含能力说明） */
  function mainPrompt() {
    return '你是 AgentHub 的主智能体：理解用户意图、规划任务、亲自完成大部分工作；' +
      '需要专业能力或要并行提速时，用 spawn 创造子智能体、用 skill 调用技能，你负责汇总结果。回答使用中文，简洁清晰。\n\n' + capsDoc();
  }

  window.SubAgents = {
    spawn, runSkill, runAll, capsDoc, mainPrompt, toolDoc,
    on, off, emit,
    MAX_DEPTH, MAX_CONCURRENT, MAX_TOTAL_AGENTS,
    get running() { return running; }
  };
})();
