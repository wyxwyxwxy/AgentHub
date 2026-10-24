/* ============ Agent 工具协议：[[ACTION:工具|参数]] 解析与执行 ============ */
(function () {
  const { toast, Native } = window.UI;
  const { Models, Media, FS, Store } = window.Store;

  const ACTION_RE = /\[\[ACTION:([a-zA-Z][\w.]*)\|([^\]]*)\]\]/g;

  /* 支持的工具栏目（供 UI 提示） */
  const TOOLS = [
    { name: 'spawn', desc: 'spawn|角色名|任务 —— 创造一个子智能体干活（可多个并行、可再繁衍）' },
    { name: 'skill', desc: 'skill|技能id|任务 —— 调用已安装技能（网页/CSS/SVG/3D/编译/游戏/测试/数据库/API/安全/DevOps 等 23 个）' },
    { name: 'compile', desc: 'compile|/路径[|语言] —— 编译检查/运行代码（JS 真实执行、HTML/CSS/JSON 校验、C/Python/Java 结构检查），可传目录批量编译' },
    { name: 'browser.search', desc: 'browser.search|关键词 —— 内置浏览器搜索并提取结果' },
    { name: 'browser.navigate', desc: 'browser.navigate|网址 —— 打开网页并提取正文' },
    { name: 'browser.extract', desc: 'browser.extract|CSS选择器(可选) —— 提取当前页面文本' },
    { name: 'browser.open', desc: 'browser.open|网址 —— 仅打开网页' },
    { name: 'media.image', desc: 'media.image|画面描述 —— 生成图片' },
    { name: 'media.video', desc: 'media.video|画面描述 —— 生成视频' },
    { name: 'fs.write', desc: 'fs.write|/路径::内容 —— 写入虚拟磁盘（自动创建目录）' },
    { name: 'fs.read', desc: 'fs.read|/路径 —— 读取虚拟磁盘文件内容' },
    { name: 'fs.list', desc: 'fs.list|/路径 —— 列出目录内容' },
    { name: 'notify', desc: 'notify|消息 —— 弹出提醒' }
  ];

  function parse(text) {
    if (!text) return [];
    const out = [];
    let m;
    ACTION_RE.lastIndex = 0;
    while ((m = ACTION_RE.exec(text)) !== null) {
      out.push({ raw: m[0], tool: m[1], arg: (m[2] || '').trim() });
    }
    return out;
  }

  /** 去掉 ACTION 标记，返回干净文本 */
  function strip(text) {
    return (text || '').replace(ACTION_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * 执行单个工具
   * @param action {tool, arg}
   * @param opts {model, signal, depth, onStatus, onDelta}
   * @returns {ok, text}  供回喂给模型的结果文本
   */
  async function execute(action, opts = {}) {
    const [tool, sub] = action.tool.split('.');
    try {
      /* ---- 创造一个子智能体（自繁衍） ---- */
      if (tool === 'spawn') {
        const SA = window.SubAgents;
        if (!SA) return { ok: false, text: '子智能体引擎未加载' };
        const idx = action.arg.indexOf('|');
        const role = (idx < 0 ? action.arg : action.arg.slice(0, idx)).trim();
        const task = idx < 0 ? '' : action.arg.slice(idx + 1).trim();
        if (!role) return { ok: false, text: '缺少角色名，格式：[[ACTION:spawn|角色名|任务]]' };
        if (!task) return { ok: false, text: '缺少任务描述，格式：[[ACTION:spawn|' + role + '|任务内容]]' };
        const model = opts.model || (window.ChatPage && window.ChatPage.currentModel && window.ChatPage.currentModel());
        if (!model) return { ok: false, text: '没有可用的对话模型，请先在模型页添加' };
        opts.onStatus && opts.onStatus(' 正在创造子智能体「' + role + '」…');
        const r = await SA.spawn(role, task, {
          model, signal: opts.signal, depth: (opts.depth || 0) + 1,
          onStatus: (s) => opts.onStatus && opts.onStatus(s),
          onDelta: (full) => opts.onDelta && opts.onDelta(full)
        });
        if (!r.ok) return { ok: false, text: r.text };
        return { ok: true, text: '【 子智能体「' + role + '」已完成任务】\n' + r.text };
      }

      /* ---- 调用已安装技能 ---- */
      if (tool === 'skill') {
        const SA = window.SubAgents;
        if (!SA) return { ok: false, text: '技能引擎未加载' };
        const idx = action.arg.indexOf('|');
        const sid = (idx < 0 ? action.arg : action.arg.slice(0, idx)).trim();
        const task = idx < 0 ? '' : action.arg.slice(idx + 1).trim();
        if (!sid) return { ok: false, text: '缺少技能 id，格式：[[ACTION:skill|技能id|任务]]' };
        if (!task) return { ok: false, text: '缺少任务描述，格式：[[ACTION:skill|' + sid + '|任务内容]]' };
        const model = opts.model || (window.ChatPage && window.ChatPage.currentModel && window.ChatPage.currentModel());
        if (!model) return { ok: false, text: '没有可用的对话模型，请先在模型页添加' };
        const sk = window.Store.Skills.get(sid);
        opts.onStatus && opts.onStatus(' 正在调用技能「' + (sk ? sk.name : sid) + '」…');
        const r = await SA.runSkill(sid, task, {
          model, signal: opts.signal,
          onStatus: (s) => opts.onStatus && opts.onStatus(s),
          onDelta: (full) => opts.onDelta && opts.onDelta(full)
        });
        if (!r.ok) return { ok: false, text: r.text };
        return { ok: true, text: '【 技能「' + (sk ? sk.name : sid) + '」已完成】\n' + r.text };
      }

      if (tool === 'browser') {
        const B = window.Browser;
        if (!B) return { ok: false, text: '浏览器模块未加载' };
        if (sub === 'search') {
          if (!action.arg) return { ok: false, text: '缺少搜索关键词' };
          opts.onStatus && opts.onStatus('正在搜索：' + action.arg);
          const r = await B.search(action.arg, 4000);
          if (r && r.ok) return { ok: true, text: formatPage(r) };
          return { ok: false, text: '搜索失败：' + ((r && r.error) || '未知错误') };
        }
        if (sub === 'navigate' || sub === 'open') {
          if (!action.arg) return { ok: false, text: '缺少网址' };
          opts.onStatus && opts.onStatus('正在打开：' + action.arg);
          if (sub === 'open') {
            await B.open(action.arg);
            return { ok: true, text: '已打开网页：' + action.arg };
          }
          await B.cmd('navigate', { url: action.arg });
          await new Promise(r => setTimeout(r, 2000));
          const r = await B.cmd('extract', { max: 4000 }, 45000);
          if (r && r.ok) return { ok: true, text: formatPage(r) };
          return { ok: false, text: '打开失败：' + ((r && r.error) || '未知错误') };
        }
        if (sub === 'extract') {
          opts.onStatus && opts.onStatus('正在提取页面文本');
          const r = await B.cmd('extract', { selector: action.arg || undefined, max: 4000 }, 45000);
          if (r && r.ok) return { ok: true, text: formatPage(r) };
          if (r && r.__unsupported) return { ok: false, text: 'Web 预览环境无原生浏览器，无法提取页面' };
          return { ok: false, text: '提取失败：' + ((r && r.error) || '未知错误') };
        }
        return { ok: false, text: '未知浏览器命令：' + sub };
      }

      if (tool === 'media') {
        const kind = sub === 'video' ? 'video' : 'image';
        const list = Models.ofKind(kind);
        if (!list.length) return { ok: false, text: `没有可用的${kind === 'video' ? '视频' : '图片'}模型，请先在设置中添加` };
        const model = list[0];
        if (!action.arg) return { ok: false, text: '缺少画面描述' };
        opts.onStatus && opts.onStatus((kind === 'video' ? '' : '') + ' 正在生成…');
        const r = await window.API.generateMedia(model, {
          prompt: action.arg,
          n: kind === 'image' ? 1 : undefined
        }, { onPoll: (s) => opts.onStatus && opts.onStatus(s) });
        Media.add({ kind, modelId: model.id, modelName: model.name, prompt: action.arg, status: 'done', url: r.url, elapsed: r.elapsed });
        return { ok: true, text: `已生成${kind === 'video' ? '视频' : '图片'}：${r.url}\n（可在「应用 → 媒体工坊」查看与保存）` };
      }

      if (tool === 'fs') {
        if (sub === 'write') {
          const idx = action.arg.indexOf('::');
          if (idx < 0) return { ok: false, text: '格式应为 fs.write|/路径::内容' };
          const path = action.arg.slice(0, idx).trim();
          const content = action.arg.slice(idx + 2);
          try {
            FS.writeFile(path, content);
            return { ok: true, text: '已写入虚拟磁盘：' + path };
          } catch (e) { return { ok: false, text: '写入失败：' + e.message }; }
        }
        if (sub === 'read') {
          const path = action.arg.trim();
          if (!path) return { ok: false, text: '格式应为 fs.read|/路径' };
          try {
            const content = String(FS.readFile(path) || '');
            if (content.length > 4000) return { ok: true, text: '文件：' + path + '（前 4000 字，共 ' + content.length + ' 字）\n' + content.slice(0, 4000) };
            return { ok: true, text: '文件：' + path + '\n' + content };
          } catch (e) { return { ok: false, text: '读取失败：' + e.message }; }
        }
        if (sub === 'list') {
          const path = action.arg.trim() || '/';
          try {
            const items = FS.list(path);
            if (!items.length) return { ok: true, text: '目录 ' + path + ' 为空' };
            return { ok: true, text: '目录 ' + path + '：\n' + items.map(x => (x.type === 'dir' ? ' ' : '') + x.name).join('\n') };
          } catch (e) { return { ok: false, text: '列出失败：' + e.message }; }
        }
        return { ok: false, text: '未知文件命令：' + sub };
      }

      /* ---- 编译 / 运行 ---- */
      if (tool === 'compile') {
        const idx = action.arg.indexOf('|');
        const path = (idx < 0 ? action.arg : action.arg.slice(0, idx)).trim();
        const lang = idx < 0 ? '' : action.arg.slice(idx + 1).trim();
        if (!path) return { ok: false, text: '格式应为 compile|/路径[|语言]' };
        opts.onStatus && opts.onStatus('正在编译：' + path);
        const node = FS.getNode(path);
        if (node && node.type === 'dir') return compileDir(path, lang, { run: false });
        return compileFile(path, lang);
      }

      if (tool === 'notify') {
        toast(' ' + (action.arg || '提醒'));
        return { ok: true, text: '已发送通知：' + action.arg };
      }

      return { ok: false, text: '未知工具：' + action.tool };
    } catch (e) {
      return { ok: false, text: '工具执行出错：' + (e.message || String(e)) };
    }
  }

  function formatPage(r) {
    let out = `页面标题：${r.title || '未知'}\n网址：${r.url || '未知'}\n\n正文摘录：\n${(r.text || '').slice(0, 2500)}`;
    if (r.links && r.links.length) {
      out += '\n\n相关链接：\n' + r.links.slice(0, 10).map(l => `- ${l.t} (${l.h})`).join('\n');
    }
    return out;
  }

  /* ==================================================
     编译器：compile 工具核心（JS 真实沙箱执行 / 静态校验 / 报告）
     ================================================== */
  const CODE_EXTS = ['js', 'ts', 'jsx', 'tsx', 'html', 'htm', 'css', 'json', 'py', 'c', 'cc', 'cpp', 'h', 'hpp', 'java', 'go', 'rs', 'rb', 'php', 'sql', 'sh', 'exe'];
  const extOf = (p) => (String(p || '').match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  const fmtVal = (v) => typeof v === 'object' && v !== null ? (() => { try { return JSON.stringify(v); } catch (e) { return String(v); } })() : String(v);

  /** 括号配对检查 */
  function balance(code, open, close) {
    let depth = 0, line = 1, minLine = 0;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (ch === '\n') line++;
      else if (ch === open) { if (depth === 0) minLine = line; depth++; }
      else if (ch === close) { depth--; if (depth < 0) return { ok: false, line, msg: `多余的 "${close}"（第 ${line} 行）` }; }
    }
    if (depth > 0) return { ok: false, line: minLine, msg: `"${open}" 未闭合（第 ${minLine} 行开始，缺少 ${depth} 个 "${close}"）` };
    return { ok: true };
  }

  /** 编译单个文件，返回 {ok, text, log} */
  function compileFile(path, lang, opts = {}) {
    const node = FS.getNode(path);
    if (!node || node.type !== 'file') return { ok: false, text: '✗ 文件不存在：' + path };
    const content = String(node.content || '');
    const ext = extOf(path);
    const L = String(lang || ext || '').toLowerCase();
    const run = opts.run !== false;   // JS 默认尝试运行
    const lines = content ? content.split('\n').length : 0;
    const head = ` 编译 ${path}（${L || '未知类型'}，${lines} 行，${(content.length / 1024).toFixed(1)} KB）`;
    const out = [];
    let ok = true;

    if (['js', 'ts', 'jsx', 'tsx', 'javascript', 'exe'].includes(L)) {
      // 语法检查
      try { new Function(content); out.push('✓ 语法检查通过'); }
      catch (e) { ok = false; out.push('✗ 语法错误：' + e.message); }
      // 沙箱运行（默认开启，可用 opts.run=false 关闭）
      if (ok && run) {
        const logs = [];
        const sb = {
          log: (...a) => logs.push(a.map(fmtVal).join(' ')),
          info: (...a) => logs.push(a.map(fmtVal).join(' ')),
          warn: (...a) => logs.push('! ' + a.map(fmtVal).join(' ')),
          error: (...a) => logs.push(' ' + a.map(fmtVal).join(' '))
        };
        try {
          const r = new Function('console', '"use strict";\n' + content)(sb);
          if (r !== undefined) logs.push('→ ' + fmtVal(r));
          out.push(logs.length ? '» 运行输出：\n' + logs.slice(0, 40).join('\n') : '» 运行完成（无输出）');
        } catch (e) { ok = false; out.push('✗ 运行错误：' + e.message); }
      }
    } else if (['html', 'htm'].includes(L)) {
      try {
        const doc = new DOMParser().parseFromString(content, 'text/html');
        const err = doc.querySelector('parsererror');
        if (err) { ok = false; out.push('✗ HTML 解析错误'); }
        else {
          const tags = doc.querySelectorAll('*').length;
          const title = (doc.querySelector('title') || {}).textContent || '';
          const b = balance(content, '<div', '</div');
          out.push(`✓ 结构有效 · ${tags} 个元素${title ? ' · 标题「' + title.trim() + '」' : ''}`);
          if (!b.ok) out.push('! div 标签可能不配对：' + b.msg);
          const hasCss = /<style[\s>]/.test(content), hasJs = /<script[\s>]/.test(content);
          out.push(`内联 ${hasCss ? 'CSS ✓' : 'CSS ✗'} · 脚本 ${hasJs ? '✓' : '✗'}`);
        }
      } catch (e) { ok = false; out.push('✗ ' + e.message); }
    } else if (L === 'css') {
      const b = balance(content, '{', '}');
      if (!b.ok) { ok = false; out.push('✗ ' + b.msg); }
      else {
        const rules = (content.match(/[^{}]+\{[^{}]*\}/g) || []).length;
        const props = (content.match(/[\w-]+\s*:/g) || []).length;
        const media = (content.match(/@media/g) || []).length;
        const vars = (content.match(/--[\w-]+\s*:/g) || []).length;
        out.push(`✓ 样式表有效 · ${rules} 条规则 · ${props} 个声明${media ? ' · ' + media + ' 个媒体查询' : ''}${vars ? ' · ' + vars + ' 个 CSS 变量' : ''}`);
      }
    } else if (L === 'json') {
      try {
        const obj = JSON.parse(content);
        const keys = obj && typeof obj === 'object' ? Object.keys(obj).length : 0;
        out.push(`✓ JSON 有效 · 顶层 ${keys} 个键`);
      } catch (e) { ok = false; out.push('✗ JSON 解析错误：' + e.message); }
    } else if (['py', 'python'].includes(L)) {
      const b1 = balance(content, '(', ')'), b2 = balance(content, '[', ']'), b3 = balance(content, '{', '}');
      const indent = /\t/.test(content) && /^ +/m.test(content) ? '! 检测到 Tab 与空格混用缩进' : '✓ 缩进风格一致';
      out.push(' [沙箱模拟编译] Python 3.11（未链接真实解释器）');
      out.push(b1.ok && b2.ok && b3.ok ? '✓ 括号配对通过' : '✗ 括号不配对：' + (b1.ok ? '' : b1.msg) + (b2.ok ? '' : b2.msg) + (b3.ok ? '' : b3.msg));
      out.push(indent);
      const defs = (content.match(/^\s*def\s+\w+/gm) || []).length;
      const classes = (content.match(/^\s*class\s+\w+/gm) || []).length;
      out.push(`${defs} 个函数 · ${classes} 个类`);
      if (!b1.ok || !b2.ok || !b3.ok) ok = false;
    } else if (['c', 'cc', 'cpp', 'h', 'hpp', 'c++'].includes(L)) {
      const b1 = balance(content, '{', '}'), b2 = balance(content, '(', ')');
      const mains = (content.match(/\bint\s+main\s*\(/g) || []).length;
      out.push(' [沙箱模拟编译] gcc 风格检查（未链接真实工具链）');
      out.push(b1.ok && b2.ok ? '✓ 括号配对通过' : '✗ 括号不配对：' + (b1.ok ? '' : b1.msg) + (b2.ok ? '' : b2.msg));
      out.push(`main 函数 ${mains} 个 · #include ${(content.match(/#include/g) || []).length} 处`);
      if (!b1.ok || !b2.ok) ok = false;
    } else if (L === 'java') {
      const b = balance(content, '{', '}');
      const cls = (content.match(/\bclass\s+\w+/g) || []).length;
      out.push(' [沙箱模拟编译] javac 风格检查（未链接真实工具链）');
      out.push(b.ok ? '✓ 括号配对通过' : '✗ ' + b.msg);
      out.push(`${cls} 个类声明`);
      if (!b.ok) ok = false;
    } else if (['go', 'rs', 'rb', 'php', 'sql', 'sh', 'bash'].includes(L)) {
      const b = balance(content, '{', '}');
      out.push(' [沙箱模拟编译] ' + L.toUpperCase() + '（未链接真实工具链）');
      out.push(b.ok ? '✓ 括号配对通过' : '✗ ' + b.msg);
      if (!b.ok) ok = false;
    } else {
      out.push(`ℹ 文本文件 · ${lines} 行 · ${(content.length / 1024).toFixed(1)} KB（无可编译内容，仅统计）`);
    }

    const verdict = ok ? '✓ 编译通过' : '✗ 编译失败';
    const report = `${head}\n${out.join('\n')}\n\n${verdict} · ${new Date().toLocaleString('zh-CN')}`;
    const logPath = '/home/agent/build/' + (node.name || 'file') + '.build.log';
    try { FS.writeFile(logPath, report); } catch (e) { /* 日志写入失败不影响编译结果 */ }
    return { ok, text: report + '\n\n（构建日志已存为 ' + logPath + '）', log: logPath };
  }

  /** 批量编译目录，返回汇总 */
  function compileDir(dir, lang, opts = {}) {
    const results = [];
    let pass = 0, fail = 0;
    (function walk(d) {
      for (const it of FS.list(d)) {
        const p = FS.join(d, it.name);
        if (it.type === 'dir') walk(p);
        else if (CODE_EXTS.includes(extOf(p))) results.push(compileFile(p, lang, opts));
      }
    })(dir);
    for (const r of results) r.ok ? pass++ : fail++;
    const lines = results.map(r => `${r.ok ? '✓' : '✗'} ${r.text.split('\n')[0].replace(' 编译 ', '')}`);
    const summary = `批量编译 ${dir}：共 ${results.length} 个文件 · 通过 ${pass} · 失败 ${fail}\n\n${lines.join('\n')}`;
    try { FS.writeFile('/home/agent/build/build-' + Date.now().toString(36) + '.log', summary); } catch (e) { }
    return { ok: fail === 0, text: summary };
  }

  window.AgentTools = { parse, execute, strip, TOOLS };
  window.Compiler = { compileFile, compileDir };  // 供模拟环境终端（node -e）复用
})();
