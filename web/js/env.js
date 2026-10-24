/* ============ 环境页：Windows 模拟桌面 + 安卓原生环境 ============ */
(function () {
  const { $, $$, toast, sheet, confirmDialog, escapeHtml, icons, fmtTime, fmtSize, Native } = window.UI;
  const { FS, Agents, Models } = window.Store;

  /* ==================================================
     一、环境入口
  ================================================== */
  function render(container) {
    const device = Native.available ? '' : '';
    container.innerHTML = `
      <div class="page" data-page="env">
        <div class="page-header">
          <h1>运行环境<span class="sub">所有操作均在本地沙箱中执行</span></h1>
        </div>
        <div class="page-body">
          <button class="card" data-act="open-win" style="width:100%;text-align:left;display:block;cursor:pointer">
            <div class="row">
              <div style="font-size:38px"></div>
              <div style="flex:1">
                <div style="font-size:16px;font-weight:700">Windows 模拟环境</div>
                <div class="muted" style="margin-top:2px">完整的桌面沙箱：资源管理器、终端、记事本<br>终端内置 node 命令，可真实执行 JavaScript</div>
              </div>
              <span class="badge">推荐体验</span>
            </div>
          </button>
          <button class="card" data-act="open-and" style="width:100%;text-align:left;display:block;cursor:pointer">
            <div class="row">
              <div style="font-size:38px"></div>
              <div style="flex:1">
                <div style="font-size:16px;font-weight:700">安卓原生环境</div>
                <div class="muted" style="margin-top:2px">设备信息、原生能力调用（选文件夹 / 震动 / 分享）<br>以及一个仿真的安卓桌面</div>
              </div>
            </div>
          </button>
          <div class="card">
            <div class="card-title"> 沙箱说明</div>
            <div class="muted">
              • 文件系统为本地虚拟磁盘，可一键导出<br>
              • 终端内置 node，可真实执行 JavaScript；选择真实文件夹后，ls/cat/echo/mkdir 等命令直接读写手机文件（SAF）<br>
              • 通过「文件」页可将虚拟文件保存到你自选的手机文件夹
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ==================================================
     二、Windows 模拟环境
  ================================================== */
  const Win = {
    wins: [], z: 100, seq: 0,
    open(appId, arg) {
      // 程序运行器支持多实例：同一程序聚焦，不同程序开新窗口
      const samePath = (w) => appId === 'runner' && arg && arg.path && w.argPath === arg.path;
      const exist = Win.wins.find(w => w.app === appId && (appId !== 'runner' || !(arg && arg.path) || samePath(w)));
      if (exist) { Win.focus(exist); return exist; }
      const app = Win.APPS[appId];
      const w = { id: ++Win.seq, app: appId, title: app.title, icon: app.icon, el: null, min: false, argPath: arg && arg.path };
      if (appId === 'runner' && arg && arg.path) w.title = arg.path.split('/').pop() + ' - 运行器';
      const el = document.createElement('div');
      el.className = 'win-window';
      el.dataset.wid = w.id;
      const n = Win.wins.length;
      el.style.left = (128 + n * 16) + 'px';
      el.style.top = (18 + n * 14) + 'px';
      el.style.width = app.w + 'px';
      el.style.height = app.h + 'px';
      el.innerHTML = `
        <div class="win-titlebar">
          <span class="wt-icon">${icons[app.icon] || icons.apps}</span>
          <span class="wt-title">${escapeHtml(w.title || app.title)}</span>
          <div class="win-ctrl">
            <button data-wc="min" title="最小化">—</button>
            <button data-wc="max" title="最大化">▢</button>
            <button data-wc="close" class="close" title="关闭">${icons.close}</button>
          </div>
        </div>
        <div class="win-content"></div>`;
      $('.win-desktop').appendChild(el);
      w.el = el;
      Win.wins.push(w);
      app.render(el.querySelector('.win-content'), w, arg);
      Win.focus(w);
      Win.bindTitlebar(w);
      Win.renderTasks();
      return w;
    },
    focus(w) {
      Win.wins.forEach(x => x.el.style.zIndex = 1);
      w.el.style.zIndex = ++Win.z;
      Win.wins.forEach(x => x.el.querySelector('.win-titlebar').style.background = '');
      w.el.querySelector('.win-titlebar').style.background = 'linear-gradient(180deg,#eafaf0,#dcf5e5)';
      Win.renderTasks();
    },
    close(w) {
      w.el.remove();
      Win.wins = Win.wins.filter(x => x !== w);
      Win.renderTasks();
    },
    minimize(w) {
      w.min = true;
      w.el.style.display = 'none';
      Win.renderTasks();
    },
    toggleMax(w) {
      const el = w.el;
      if (el.dataset.max) {
        delete el.dataset.max;
        el.style.left = w._l; el.style.top = w._t; el.style.width = w._w; el.style.height = w._h;
      } else {
        w._l = el.style.left; w._t = el.style.top; w._w = el.style.width; w._h = el.style.height;
        el.dataset.max = '1';
        el.style.left = '6px'; el.style.top = '6px';
        el.style.width = ($('.win-desktop').clientWidth - 12) + 'px';
        el.style.height = ($('.win-desktop').clientHeight - 70) + 'px';
      }
      Win.focus(w);
    },
    bindTitlebar(w) {
      const bar = w.el.querySelector('.win-titlebar');
      bar.addEventListener('pointerdown', (e) => {
        if (e.target.closest('[data-wc]')) return;
        Win.focus(w);
        const r = w.el.getBoundingClientRect();
        const ox = e.clientX - r.left, oy = e.clientY - r.top;
        const dr = $('.win-desktop').getBoundingClientRect();
        const move = (ev) => {
          let x = ev.clientX - dr.left - ox, y = ev.clientY - dr.top - oy;
          x = Math.max(-r.width + 60, Math.min(x, dr.width - 60));
          y = Math.max(0, Math.min(y, dr.height - 60));
          w.el.style.left = x + 'px'; w.el.style.top = y + 'px';
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
      bar.querySelectorAll('[data-wc]').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const c = b.dataset.wc;
        if (c === 'close') Win.close(w);
        else if (c === 'min') Win.minimize(w);
        else if (c === 'max') Win.toggleMax(w);
      }));
    },
    renderTasks() {
      const bar = $('.win-tasks');
      if (!bar) return;
      bar.innerHTML = Win.wins.map(w =>
        `<button class="win-task ${w.el.style.zIndex == Win.z && !w.min ? 'active' : ''}" data-task="${w.id}"><span class="wtask-ic">${icons[w.icon] || ''}</span> ${escapeHtml(w.title)}</button>`).join('') || '';
      bar.querySelectorAll('[data-task]').forEach(b => b.onclick = () => {
        const w = Win.wins.find(x => x.id == b.dataset.task);
        if (!w) return;
        if (w.min) { w.min = false; w.el.style.display = ''; Win.focus(w); }
        else if (w.el.style.zIndex == Win.z) Win.minimize(w);
        else Win.focus(w);
      });
    },
    APPS: {}
  };

  /* ---------- 终端应用 ---------- */
  Win.APPS.terminal = {
    title: '终端', icon: 'terminal', w: 460, h: 320,
    render(root, w) {
      root.innerHTML = `<div class="term">
        <div class="term-out" id="term-out"></div>
        <div class="term-line"><span class="prompt" id="term-prompt">agent@agenthub:~$</span><input id="term-in" autocomplete="off" spellcheck="false"></div>
      </div>`;
      const out = root.querySelector('#term-out');
      const inp = root.querySelector('#term-in');
      const pr = root.querySelector('#term-prompt');
      let cwd = '/home/agent';
      /* 真实文件夹后端（SAF）：在「文件」页选了真实文件夹后，文件命令默认作用于真实文件 */
      const realDir = () => { try { return (window.Store && window.Store.SaveDir) ? window.Store.SaveDir.get() : null; } catch (e) { return null; } };
      const realReady = () => !!(realDir() && Native.available);
      let useReal = realReady();
      let rcwd = ''; // 真实文件夹内相对路径
      const realName = () => { const d = realDir(); return d ? (d.name || d.uri || '已选文件夹') : ''; };
      const realPath = (p) => {
        if (!p || p === '~' || p === '/') return rcwd;
        if (p.startsWith('/')) return p.replace(/^\/+/, '');
        return (rcwd ? rcwd + '/' : '') + p;
      };
      const promptStr = () => 'agent@agenthub:' + (useReal ? '~(real/' + (rcwd || '') + ')' : cwd) + '$';
      const syncPrompt = () => { pr.textContent = promptStr(); };
      const resolve = (p) => (p && p.startsWith('/')) ? p : FS.join(cwd, p || '');
      const print = (html, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.innerHTML = html; out.appendChild(d); out.scrollTop = out.scrollHeight; };
      const raw = (t, cls) => print(escapeHtml(t), cls);
      const realLs = async (rel) => { const r = await Native.fsList(rel || ''); return (r && r.ok) ? (r.items || []) : null; };
      raw('AgentHub OS [版本 2.4] 混合终端（WebView 真实 JS 运行时）', 't-dim');
      raw('输入 help 查看命令；node -e "代码" / node <文件.js> 真实执行 JavaScript', 't-dim');
      if (useReal) raw('已连接真实文件夹「' + realName() + '」：ls/cd/cat/echo>/touch/mkdir/rm/node 均作用于真实文件', 't-ok');
      else raw('当前为虚拟磁盘模式。在「文件」页选择真实文件夹后，终端会自动切换到真实模式（或输入 real pick）。', 't-dim');
      raw('', '');
      setTimeout(() => inp.focus(), 50);
      inp.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        const line = inp.value.trim();
        inp.value = '';
        raw(promptStr() + ' ' + line, 't-ok');
        if (!line) return;
        const [cmd, ...rest] = line.split(/\s+/);
        const argstr = rest.join(' ');
        try {
          switch (cmd) {
            case 'help':
              raw('可用命令：\n  help               帮助\n  ls [路径]          列出目录\n  cd <路径>          切换目录\n  pwd                当前路径\n  cat <文件>         查看文件\n  echo <文本>        输出文本（支持 > 写文件）\n  touch <文件>       新建文件\n  mkdir <目录>       新建目录\n  rm <路径>          删除\n  node <文件.js>     真实运行 JS 文件\n  node -e "代码"     执行 JavaScript（真）\n  compile <文件|目录> 编译检查并运行（虚拟盘）\n  run <文件>         在程序运行器中运行\n  real [on|off|pick] 真实文件夹模式 / 选择文件夹\n  python "代码"      演示（回显）\n  clear              清屏\n  date               当前时间\n  whoami             当前用户\n  ver                系统版本\n  neofetch           系统信息\n  exit               关闭终端');
              break;
            case 'real': {
              const a = rest[0];
              if (a === 'off') { useReal = false; raw('已切换到虚拟磁盘模式', 't-dim'); }
              else if (a === 'on') { if (realReady()) { useReal = true; raw('已切换到真实文件夹模式：' + realName(), 't-ok'); } else raw('尚未选择真实文件夹，请先 real pick 或在「文件」页选择', 't-err'); }
              else if (a === 'pick') {
                const r = await Native.pickFolder();
                if (r && r.uri) { try { window.Store.SaveDir.set(r.uri, r.name || '已选择文件夹'); window.Store.save(); } catch (e) {} useReal = true; rcwd = ''; raw('已选择真实文件夹：' + (r.name || r.uri) + '，已进入真实模式', 't-ok'); }
                else raw('已取消选择', 't-dim');
              } else if (useReal) raw('真实文件夹模式：' + realName() + ' · 目录 /' + rcwd, 't-ok');
              else raw('虚拟磁盘模式（输入 real pick 选择真实文件夹）', 't-dim');
              break;
            }
            case 'ls': {
              if (useReal) {
                const items = await realLs(realPath(rest[0]));
                if (items === null) { raw('ls: 读取失败（路径不存在或无权限）', 't-err'); break; }
                if (!items.length) raw('（空目录）', 't-dim');
                else raw(items.map(i => i.isDir ? '▸ ' + i.name : '  ' + i.name).join('\n'));
              } else {
                const p = resolve(rest[0]) || cwd;
                const items = FS.list(p);
                if (!items.length) raw('（空目录）', 't-dim');
                else raw(items.map(i => i.type === 'dir' ? '▸ ' + i.name : '  ' + i.name).join('\n'));
              }
              break;
            }
            case 'cd': {
              if (useReal) {
                if (!rest[0] || rest[0] === '~' || rest[0] === '/') { rcwd = ''; break; }
                const target = realPath(rest[0]);
                const parent = target.includes('/') ? target.replace(/\/[^/]*$/, '') : '';
                const items = await realLs(parent);
                const nm = target.split('/').pop();
                if (items && items.find(i => i.isDir && i.name === nm)) rcwd = target;
                else raw('cd: 不是目录或不存在: ' + target, 't-err');
              } else {
                const p = !rest[0] || rest[0] === '~' ? '/home/agent' : rest[0].startsWith('/') ? rest[0] : FS.join(cwd, rest[0]);
                const node = FS.getNode(p);
                if (node && node.type === 'dir') { cwd = p.replace(/\/+$/, '') || '/'; } else raw('cd: 目录不存在: ' + rest[0], 't-err');
              }
              break;
            }
            case 'pwd': raw(useReal ? ('real:/' + (rcwd || '')) : cwd); break;
            case 'cat': {
              if (!rest[0]) { raw('用法: cat <文件>', 't-err'); break; }
              if (useReal) {
                const r = await Native.fsRead(realPath(rest[0]));
                if (r && r.ok) raw(r.content || '（空文件）');
                else raw('cat: 读取失败: ' + ((r && r.__error) || rest[0]), 't-err');
              } else {
                const p = resolve(rest[0]); const node = FS.getNode(p);
                if (!node) raw('cat: 文件不存在: ' + p, 't-err');
                else if (node.type === 'dir') raw('cat: ' + p + ' 是一个目录', 't-err');
                else raw(node.content || '（空文件）');
              }
              break;
            }
            case 'echo': {
              const m = argstr.match(/^(.*?)\s*>\s*(\S+)$/);
              if (m) {
                const txt = m[1].replace(/^["']|["']$/g, '') + '\n';
                if (useReal) { const r = await Native.fsWrite(realPath(m[2]), txt); if (r && r.ok) raw('已写入真实文件 ' + realPath(m[2]), 't-dim'); else raw('echo: ' + ((r && r.__error) || '写入失败'), 't-err'); }
                else { try { FS.writeFile(resolve(m[2]), txt); raw('已写入 ' + resolve(m[2]), 't-dim'); } catch (err) { raw('echo: ' + err.message, 't-err'); } }
              } else raw(argstr.replace(/^["']|["']$/g, ''));
              break;
            }
            case 'touch': {
              if (!rest[0]) { raw('用法: touch <文件>', 't-err'); break; }
              if (useReal) { const r = await Native.fsWrite(realPath(rest[0]), ''); if (r && r.ok) raw('已创建 ' + realPath(rest[0]), 't-dim'); else raw('touch: ' + ((r && r.__error) || '失败'), 't-err'); }
              else { const p = resolve(rest[0]); try { FS.writeFile(p, FS.getNode(p) ? FS.readFile(p) : ''); raw('已创建 ' + p, 't-dim'); } catch (err) { raw('touch: ' + err.message, 't-err'); } }
              break;
            }
            case 'mkdir': {
              if (!rest[0]) { raw('用法: mkdir <目录>', 't-err'); break; }
              if (useReal) { const r = await Native.fsMkdir(realPath(rest[0])); if (r && r.ok) raw('已创建目录 ' + realPath(rest[0]), 't-dim'); else raw('mkdir: ' + ((r && r.__error) || '失败'), 't-err'); }
              else { const p = resolve(rest[0]); try { FS.mkdir(p); raw('已创建目录 ' + p, 't-dim'); } catch (err) { raw('mkdir: ' + err.message, 't-err'); } }
              break;
            }
            case 'rm': {
              if (!rest[0]) { raw('用法: rm <路径>', 't-err'); break; }
              if (useReal) { const r = await Native.fsDelete(realPath(rest[0])); if (r && r.ok) raw('已删除 ' + realPath(rest[0]), 't-dim'); else raw('rm: ' + ((r && r.__error) || '失败'), 't-err'); }
              else { const p = resolve(rest[0]); try { FS.remove(p); raw('已删除 ' + p, 't-dim'); } catch (err) { raw('rm: ' + err.message, 't-err'); } }
              break;
            }
            case 'clear': out.innerHTML = ''; break;
            case 'date': raw(new Date().toLocaleString('zh-CN')); break;
            case 'whoami': raw('agent'); break;
            case 'ver': raw('AgentHub OS 2.4 (WebView 真实运行时 + SAF)'); break;
            case 'neofetch':
              raw('        agent@agenthub\n        ───────────────\n        OS      AgentHub OS 2.4\n        Shell   agsh 2.0\n        Runtime WebView（真实执行 JavaScript）\n        FS      ' + (useReal ? '真实文件夹「' + realName() + '」（SAF）' : 'virtual-disk (localStorage)') + '\n        Models  ' + Models.list().length + ' 个已配置\n        Agents  ' + Agents.list().length + ' 个在线');
              break;
            case 'node': {
              if (rest[0] === '-v' || rest[0] === '--version') { raw('v22.13.0 (WebView 真实运行时)'); break; }
              if (rest[0] === '-e') {
                const code = argstr.replace(/^-e\s+/, '').replace(/^["']|["']$/g, '');
                try {
                  const logs = [];
                  const sandboxConsole = { log: (...a) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')), error: (...a) => logs.push(a.join(' ')), info: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('! ' + a.join(' ')) };
                  let r;
                  try { r = new Function('console', '"use strict"; return (' + code + '\n);')(sandboxConsole); }
                  catch (e1) { r = new Function('console', '"use strict";' + code)(sandboxConsole); }
                  if (r !== undefined) logs.push('→ ' + (typeof r === 'object' ? JSON.stringify(r) : String(r)));
                  raw(logs.join('\n') || '（执行完成，无输出）', 't-ok');
                } catch (err) { raw('' + err, 't-err'); }
              } else if (rest[0]) {
                let content = null;
                if (useReal) { const fr = await Native.fsRead(realPath(rest[0])); if (fr && fr.ok) content = fr.content; else { raw('node: 文件不存在: ' + realPath(rest[0]), 't-err'); break; } }
                else { const node = FS.getNode(resolve(rest[0])); if (!node || node.type !== 'file') { raw('node: 文件不存在: ' + resolve(rest[0]), 't-err'); break; } content = node.content || ''; }
                try {
                  const logs = [];
                  const sb = { log: (...a) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')), error: (...a) => logs.push(a.join(' ')), info: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('! ' + a.join(' ')) };
                  const rr = new Function('console', '"use strict";\n' + content)(sb);
                  if (rr !== undefined) logs.push('→ ' + (typeof rr === 'object' ? JSON.stringify(rr) : String(rr)));
                  raw(logs.join('\n') || '（执行完成，无输出）', 't-ok');
                  raw('✓ 退出码 0', 't-ok');
                } catch (e) { raw('✗ 运行时错误：' + e.message, 't-err'); raw('退出码 1', 't-err'); }
              } else raw('用法: node -v、node -e "代码" 或 node <文件.js>', 't-err');
              break;
            }
            case 'compile': {
              if (!rest[0]) { raw('用法: compile <文件或目录>', 't-err'); break; }
              const C = window.Compiler;
              if (!C) { raw('compile: 编译器未加载', 't-err'); break; }
              const p = resolve(rest[0]);
              const node = FS.getNode(p);
              if (!node) { raw('compile: 路径不存在: ' + p, 't-err'); break; }
              const r = node.type === 'dir' ? C.compileDir(p, '', { run: false }) : C.compileFile(p);
              raw(r.text, r.ok ? 't-ok' : 't-err');
              break;
            }
            case 'run': {
              if (!rest[0]) { raw('用法: run <文件>', 't-err'); break; }
              const p = useReal ? realPath(rest[0]) : resolve(rest[0]);
              Win.open('runner', { path: p, real: useReal });
              raw('已在程序运行器中打开 ' + p, 't-dim');
              break;
            }
            case 'python': { raw('[演示] Python 3.11 (sandbox) — 仅回显代码', 't-dim'); raw('>>> ' + argstr.replace(/^["']|["']$/g, ''), 't-ok'); break; }
            case 'exit': Win.close(w); break;
            default: raw('agsh: 命令不存在: ' + cmd + '（输入 help 查看帮助）', 't-err');
          }
        } catch (err) { raw('错误: ' + err.message, 't-err'); }
        syncPrompt();
        out.scrollTop = out.scrollHeight;
      });
      syncPrompt();
    }
  };

  /* ---------- 文件资源管理器 ---------- */
  Win.APPS.files = {
    title: '文件资源管理器', icon: 'folder', w: 460, h: 340,
    render(root, w, arg) {
      let cwd = (arg && arg.path) || '/home/agent/workspace';
      const draw = () => {
        const items = FS.list(cwd);
        const parts = cwd.split('/').filter(Boolean);
        root.innerHTML = `
          <div class="explorer">
            <div class="explorer-bar">
              <button class="btn gray sm" data-e="up">« 上级</button>
              <button class="btn gray sm" data-e="newfolder">＋文件夹</button>
              <button class="btn gray sm" data-e="newfile">＋文本</button>
              <div class="explorer-path">${escapeHtml(cwd)}</div>
            </div>
            <div class="explorer-list">
              ${cwd !== '/' ? `<button class="exp-item" data-e="up"><span class="fi">↩</span> . .</button>` : ''}
              ${items.length ? items.map(i => {
                const isDir = i.type === 'dir';
                const size = isDir ? (FS.list(FS.join(cwd, i.name)).length + ' 项') : fmtSize((i.content || '').length);
                return `<button class="exp-item" data-open="${escapeHtml(i.name)}" data-type="${i.type}">
                  <span class="fi">${isDir ? icons.folder : icons.file}</span>
                  <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${escapeHtml(i.name)}</span>
                  <span class="fm">${size}</span>
                </button>`;
              }).join('') : '<div class="empty" style="padding:30px"><div class="emo"></div><h3>空文件夹</h3></div>'}
            </div>
          </div>`;
        root.querySelectorAll('[data-e]').forEach(b => b.onclick = async () => {
          const e = b.dataset.e;
          if (e === 'up') { cwd = FS.dirname(cwd) || '/'; draw(); }
          if (e === 'newfolder') {
            const name = await promptName('新建文件夹', '文件夹名称');
            if (name) { try { FS.mkdir(FS.join(cwd, name)); draw(); } catch (err) { toast(err.message, 'err'); } }
          }
          if (e === 'newfile') {
            const name = await promptName('新建文本文件', '文件名称（如 note.txt）');
            if (name) { try { FS.writeFile(FS.join(cwd, name), ''); draw(); } catch (err) { toast(err.message, 'err'); } }
          }
        });
        root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
          const name = b.dataset.open;
          const p = FS.join(cwd, name);
          if (b.dataset.type === 'dir') { cwd = p; draw(); }
          else if (/\.(exe|app)$/i.test(name)) Win.open('runner', { path: p });
          else Win.open('notepad', { path: p });
        });
      };
      draw();
    }
  };

  /* ---------- 记事本 ---------- */
  Win.APPS.notepad = {
    title: '记事本', icon: 'pen', w: 420, h: 320,
    render(root, w, arg) {
      let path = (arg && arg.path) || '/home/agent/workspace/未命名.txt';
      const draw = () => {
        const node = FS.getNode(path);
        root.innerHTML = `
          <div class="notepad">
            <textarea id="np-text" spellcheck="false">${escapeHtml(node ? node.content : '')}</textarea>
            <div class="notepad-bar">
              <span class="fname">${escapeHtml(path)}</span>
              <button class="btn gray sm" data-n="open">打开</button>
              <button class="btn ghost sm" data-n="save">保存</button>
              <button class="btn gray sm" data-n="saveas">另存为</button>
            </div>
          </div>`;
        root.querySelector('[data-n="save"]').onclick = () => {
          try { FS.writeFile(path, root.querySelector('#np-text').value); toast('已保存 ' + path, 'ok'); }
          catch (e) { toast(e.message, 'err'); }
        };
        root.querySelector('[data-n="saveas"]').onclick = async () => {
          const name = await promptName('另存为', '新路径（如 /home/agent/a.txt）', path);
          if (name) { FS.writeFile(name, root.querySelector('#np-text').value); path = name; draw(); toast('已另存为 ' + path, 'ok'); }
        };
        root.querySelector('[data-n="open"]').onclick = async () => {
          const p = await filePicker();
          if (p) { path = p; draw(); }
        };
      };
      draw();
    }
  };

  /* ---------- 程序运行器：运行虚拟磁盘里的 .exe / 用户程序 ---------- */
  /* .exe 内容约定：
     1) JSON 定义：{"app":"notepad|cmd|calc|browser|files","arg":{...},"name":"..","desc":".."} → 映射到内置应用
     2) JavaScript 代码 → 在 WebView 沙箱中真实执行（console 输出回显）
     3) 其他文本 → 以程序信息卡形式展示 */
  function detectProgram(content) {
    const t = String(content || '').trim();
    if (!t) return { kind: 'empty' };
    if (t[0] === '{' || t[0] === '[') {
      try {
        const def = JSON.parse(t);
        if (def && typeof def === 'object' && def.app) {
          return { kind: 'app', def, name: def.name || def.app, desc: def.desc || '', icon: def.icon || 'cube' };
        }
        return { kind: 'json', def };
      } catch (e) { /* 不是合法 JSON，继续按代码判断 */ }
    }
    // JS 启发式：可成功解析为函数即视为脚本
    try { new Function(t); return { kind: 'js' }; } catch (e) { return { kind: 'text', err: e.message }; }
  }
  function runProgram(root, path, isReal) {
    (async () => {
      let node = null, content = '';
      if (isReal) {
        const fr = await Native.fsRead(path);
        if (!fr || !fr.ok) { toast('真实文件读取失败', 'err'); return; }
        content = fr.content || ''; node = { name: path.split('/').pop() };
      } else {
        node = FS.getNode(path);
        if (!node || node.type !== 'file') { toast('程序文件不存在', 'err'); return; }
        content = String(node.content || '');
      }
      const info = detectProgram(content);
      const name = (node.name || '').replace(/\.exe$/i, '');
      const box = root.querySelector('#run-out');
      if (!box) return;
      const say = (html, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.innerHTML = html; box.appendChild(d); box.scrollTop = box.scrollHeight; };
      box.innerHTML = '';
      say('» 启动 ' + escapeHtml(node.name) + ' …', 't-dim');
      // 诚实提示：Android 无法运行 Windows/macOS 原生程序
      const isNative = /\.(exe|app|dll|so|dmg|bin)$/i.test(name);
      if (isNative && info.kind !== 'js' && info.kind !== 'json' && info.kind !== 'app') {
        say('! ' + escapeHtml(name) + ' 是 Windows/macOS/原生二进制程序，Android 无法运行。', 't-err');
        say('  本运行器仅能真实执行 JavaScript 脚本与 JSON；请用 node <文件.js> 运行 JS。', 't-dim');
        return;
      }
      if (info.kind === 'app') { say('· 识别为内置应用映射：' + escapeHtml(info.def.app), 't-ok'); Win.open(info.def.app, info.def.arg || {}); return; }
      if (info.kind === 'json') { say('· 程序为 JSON 数据文件（未声明 app 字段），已按数据展示：', 't-dim'); say(escapeHtml(JSON.stringify(info.def, null, 2).slice(0, 2000)), ''); return; }
      if (info.kind === 'empty') { say('（空程序，无可执行内容）', 't-err'); return; }
      if (info.kind === 'text') { say('· 非可执行脚本，按文本显示：', 't-dim'); say(escapeHtml(content.slice(0, 3000)), ''); return; }
      // JS 沙箱真实执行
      const logs = [];
      const sb = {
        log: (...a) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')),
        info: (...a) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')),
        warn: (...a) => logs.push('! ' + a.map(x => String(x)).join(' ')),
        error: (...a) => logs.push('x ' + a.map(x => String(x)).join(' '))
      };
      try {
        const r = new Function('console', '"use strict";\n' + content)(sb);
        if (r !== undefined) logs.push('→ ' + (typeof r === 'object' ? JSON.stringify(r) : String(r)));
        logs.forEach(l => say(escapeHtml(l), 't-ok'));
        if (!logs.length) say('（执行完成，无输出）', 't-dim');
        say('✓ 退出码 0', 't-ok');
      } catch (e) {
        logs.forEach(l => say(escapeHtml(l), 't-ok'));
        say('x 运行时错误：' + escapeHtml(e.message), 't-err');
        say('退出码 1', 't-err');
      }
    })();
  }
  Win.APPS.runner = {
    title: '程序运行器', icon: 'gear', w: 470, h: 400,
    render(root, w, arg) {
      const isReal = !!(arg && arg.real);
      let path = (arg && arg.path) || '';
      let realContent = null, realFileName = path ? path.split('/').pop() : '';
      const draw = async () => {
        let node = null, info = null;
        if (isReal) {
          if (realContent === null && path) { try { const fr = await Native.fsRead(path); realContent = (fr && fr.ok) ? (fr.content || '') : null; } catch (e) { realContent = null; } }
          if (realContent !== null) { node = { name: realFileName, type: 'file', content: realContent }; info = detectProgram(realContent); }
        } else {
          node = path ? FS.getNode(path) : null;
          info = node ? detectProgram(String(node.content || '')) : null;
        }
        const kindLabel = { app: '内置应用映射', json: 'JSON 数据', js: 'JavaScript 脚本', text: '文本/其他', empty: '空文件' };
        root.innerHTML = `
          <div style="display:flex;flex-direction:column;height:100%">
            <div style="padding:12px 14px;border-bottom:1px solid var(--border);background:var(--surface)">
              ${node ? `
                <div class="row" style="gap:10px;align-items:center">
                  <div style="font-size:30px" class="run-ico">${info && info.kind === 'app' ? (icons[info.icon] || icons.cube) : icons.monitor}</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:14px;font-weight:700">${escapeHtml(node.name)}</div>
                    <div class="muted" style="font-size:11.5px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(path)}</div>
                  </div>
                  <span class="chip active" style="pointer-events:none">${kindLabel[info ? info.kind : 'text'] || '未知'}</span>
                </div>
                ${info && info.kind === 'app' ? `<div class="muted" style="font-size:12px;margin-top:6px">${escapeHtml(info.desc || '启动内置应用：' + info.def.app)}</div>` : ''}
                <div class="row" style="gap:8px;margin-top:10px">
                  <button class="btn sm" data-r="run" style="flex:1">» 运行</button>
                  <button class="btn gray sm" data-r="pick"> 选择程序</button>
                  <button class="btn gray sm" data-r="edit"> 编辑源码</button>
                </div>`
          : `<div class="empty" style="padding:24px 0"><div class="emo">${icons.gear}</div><h3>选择要运行的程序</h3><p>支持真实文件夹与虚拟盘中的 .js 程序文件；.exe 无法在 Android 运行</p><button class="btn" data-r="pick" style="margin-top:10px"> 选择程序</button></div>`}
            </div>
            <div class="term" style="flex:1;min-height:0"><div class="term-out" id="run-out" style="padding-top:12px"></div></div>
          </div>`;
        root.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => {
          const r = b.dataset.r;
          if (r === 'run') runProgram(root, path, isReal);
          else if (r === 'edit') Win.open('notepad', { path });
          else if (r === 'pick') {
            const p = await filePicker();
            if (p) { path = p; draw(); }
          }
        });
      };
      draw();
    }
  };

  /* ---------- 计算器 ---------- */
  Win.APPS.calc = {
    title: '计算器', icon: 'calc', w: 260, h: 340,
    render(root) {
      root.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%;background:#fbfefb">
          <div id="calc-disp" style="padding:14px 14px 10px;font-size:26px;font-weight:700;text-align:right;color:var(--text);font-variant-numeric:tabular-nums;word-break:break-all;min-height:56px">0</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;flex:1;background:var(--border);border-top:1px solid var(--border)">
            ${[['C', 'clear'], ['⌫', 'back'], ['%', 'op'], ['÷', 'op'],
            ['7', 'num'], ['8', 'num'], ['9', 'num'], ['×', 'op'],
            ['4', 'num'], ['5', 'num'], ['6', 'num'], ['-', 'op'],
            ['1', 'num'], ['2', 'num'], ['3', 'num'], ['+', 'op'],
            ['±', 'neg'], ['0', 'num'], ['.', 'dot'], ['=', 'eq']]
          .map(([t, k]) => `<button class="calc-key" data-k="${t}" data-t="${k}">${t}</button>`).join('')}
          </div>
        </div>`;
      const disp = root.querySelector('#calc-disp');
      let expr = '';
      const render = () => { disp.textContent = expr || '0'; };
      root.querySelectorAll('.calc-key').forEach(b => b.onclick = () => {
        const t = b.dataset.t, k = b.dataset.k;
        if (t === 'clear') expr = '';
        else if (t === 'back') expr = expr.slice(0, -1);
        else if (t === 'eq') {
          try {
            const js = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/%/g, '/100');
            if (!/^[-+*/().\d\s]+$/.test(js)) throw new Error('表达式不合法');
            const r = Function('"use strict";return(' + (js || '0') + ')')();
            expr = (r === undefined || r === null || !isFinite(r)) ? '' : String(Math.round(r * 1e10) / 1e10);
          } catch (e) { expr = ''; toast('计算错误：' + e.message, 'err'); }
        }
        else if (t === 'neg') { if (expr && !expr.startsWith('-')) expr = '-' + expr; else if (expr) expr = expr.slice(1); }
        else expr += k;
        render();
      });
      render();
    }
  };

  /* ---------- 内置浏览器（沙箱演示） ---------- */
  const BROWSE_PRESETS = [
    { name: '百度', url: 'https://www.baidu.com', icon: 'globe' },
    { name: '必应', url: 'https://www.bing.com', icon: 'search' },
    { name: 'GitHub', url: 'https://github.com', icon: 'code' },
    { name: 'AgentHub 帮助', url: 'agenthub://help', icon: 'sparkles' }
  ];
  function browserRenderPage(root, frame, url) {
    const u = String(url || '').trim();
    const isSearch = u && !/^(https?:\/\/|agenthub:\/\/)/i.test(u) && !/^www\./i.test(u) && !/\.\w{2,}(\/|$)/.test(u);
    const q = isSearch ? u : (u.match(/[?&]q=([^&]+)/) ? decodeURIComponent(u.match(/[?&]q=([^&]+)/)[1]) : '');
    if (u.startsWith('agenthub://help') || !u) {
      frame.innerHTML = `
        <div style="padding:20px 18px;font-family:system sans-serif">
          <div style="font-size:20px;font-weight:800;color:var(--green-700)"> AgentHub 帮助中心</div>
          <p style="font-size:13px;color:var(--text-2);line-height:1.8">这是沙箱内置浏览器的本地页面。在地址栏输入关键词可模拟搜索，输入网址可尝试加载真实网页。</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
            ${BROWSE_PRESETS.map(p => `<button class="list-item" data-go="${p.url}" style="border:1px solid var(--border)"><div class="li-icon">${icons[p.icon] || icons.globe}</div><div class="li-main"><div class="li-title">${p.name}</div><div class="li-sub">${p.url}</div></div></button>`).join('')}
          </div>
        </div>`;
    } else if (q || isSearch) {
      const results = [
        { t: q + ' - 百度百科', u: 'https://baike.baidu.com/item/' + encodeURIComponent(q), d: '百度百科收录了关于「' + q + '」的词条解释、历史与相关资料。' },
        { t: q + ' 的最新相关信息', u: 'https://www.bing.com/search?q=' + encodeURIComponent(q), d: '聚合新闻、问答与网页结果，沙箱演示环境生成的摘要卡片。' },
        { t: q + ' - 知乎讨论', u: 'https://www.zhihu.com/search?q=' + encodeURIComponent(q), d: '知乎上关于「' + q + '」的高赞回答与讨论（模拟数据）。' },
        { t: q + ' - 视频结果', u: 'https://www.bilibili.com/search?q=' + encodeURIComponent(q), d: '相关视频列表（模拟数据，点击不会真实跳转）。' }
      ];
      frame.innerHTML = `
        <div style="padding:14px 16px;font-family:system sans-serif">
          <div class="muted" style="font-size:11.5px;margin-bottom:10px"> 「${escapeHtml(q)}」的搜索结果 · 沙箱演示（模拟数据）</div>
          ${results.map(r => `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="color:#1a0dab;font-size:14px;font-weight:600">${escapeHtml(r.t)}</div>
            <div style="color:#0b6b3a;font-size:11.5px;margin:2px 0">${escapeHtml(r.u)}</div>
            <div style="color:var(--text-2);font-size:12.5px">${escapeHtml(r.d)}</div>
          </div>`).join('')}
        </div>`;
    } else {
      const full = /^https?:\/\//i.test(u) ? u : 'https://' + u;
      frame.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%">
          <div style="padding:10px 14px;font-size:12px;color:var(--text-2);border-bottom:1px solid var(--border);background:var(--surface)">正在加载 ${escapeHtml(full)} …</div>
          <iframe src="${escapeHtml(full)}" sandbox="allow-scripts allow-same-origin allow-forms" referrerpolicy="no-referrer" style="flex:1;border:0;background:#fff;width:100%"></iframe>
          <div style="padding:8px 14px;font-size:11px;color:var(--muted);border-top:1px solid var(--border)">提示：多数真实网站禁止被嵌入iframe（X-Frame-Options），空白属于正常安全策略。</div>
        </div>`;
    }
    frame.querySelectorAll('[data-go]').forEach(b => b.onclick = () => browserRenderPage(root, frame, b.dataset.go));
  }
  Win.APPS.browser = {
    title: '浏览器', icon: 'browser', w: 520, h: 440,
    render(root, w, arg) {
      root.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%">
          <div style="display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid var(--border);background:var(--surface);align-items:center">
            <button class="icon-btn" data-b="back" title="后退">${icons.back}</button>
            <button class="icon-btn" data-b="reload" title="刷新">${icons.refresh}</button>
            <input class="input" id="br-url" style="flex:1;font-size:12.5px" placeholder="搜索或输入网址（如 agenthub://help）" value="agenthub://help">
            <button class="btn sm" data-b="go">前往</button>
          </div>
          <div id="br-page" style="flex:1;overflow:auto;background:#fff"></div>
        </div>`;
      const frame = root.querySelector('#br-page');
      const input = root.querySelector('#br-url');
      const history = [];
      let hi = -1;
      const nav = (u, push = true) => {
        if (push) { history.length = hi + 1; history.push(u); hi = history.length - 1; }
        input.value = u;
        browserRenderPage(root, frame, u);
      };
      nav('agenthub://help', true);
      root.querySelector('[data-b="go"]').onclick = () => nav(input.value.trim());
      input.addEventListener('keydown', e => { if (e.key === 'Enter') nav(input.value.trim()); });
      root.querySelector('[data-b="reload"]').onclick = () => browserRenderPage(root, frame, input.value.trim());
      root.querySelector('[data-b="back"]').onclick = () => { if (hi > 0) { hi--; nav(history[hi], false); } };
    }
  };

  /* ---------- 关于 ---------- */
  Win.APPS.about = {
    title: '关于 AgentHub', icon: 'sparkles', w: 320, h: 240,
    render(root) {
      root.innerHTML = `
        <div style="padding:22px;text-align:center">
          <div style="font-size:44px"></div>
          <h3 style="margin:8px 0 2px">AgentHub OS</h3>
          <div class="muted" style="font-size:12px">版本 1.0.25100 · 本地沙箱版</div>
          <div class="divider"></div>
          <div style="font-size:12.5px;color:var(--text-2);text-align:left;line-height:1.9">
            内核：WebView 沙箱<br>
            存储：虚拟磁盘 + 本机持久化<br>
            模型：${Models.list().length} 个已配置<br>
            智能体：${Agents.list().length} 个在线<br>
            网络：仅访问你配置的接口地址
          </div>
        </div>`;
    }
  };

  /* ---------- 小工具：输入框 ---------- */
  function promptName(title, placeholder, value) {
    return new Promise((resolve) => {
      const mask = document.createElement('div');
      mask.className = 'modal-mask';
      mask.innerHTML = `
        <div class="modal">
          <div class="modal-head">${escapeHtml(title)}</div>
          <div class="modal-body"><input class="input" id="pn-input" placeholder="${escapeHtml(placeholder || '')}" value="${escapeHtml(value || '')}"></div>
          <div class="modal-foot">
            <button class="btn gray" data-v="0">取消</button>
            <button class="btn" data-v="1">确定</button>
          </div>
        </div>`;
      document.querySelector('#modal-root').appendChild(mask);
      const inp = mask.querySelector('#pn-input');
      setTimeout(() => { inp.focus(); inp.select(); }, 60);
      mask.addEventListener('click', e => { if (e.target === mask) { mask.remove(); resolve(null); } });
      mask.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
        const v = b.dataset.v === '1' ? inp.value.trim() : null;
        mask.remove(); resolve(v);
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') mask.querySelector('[data-v="1"]').click(); });
    });
  }

  /* ---------- 小工具：文件选择（递归列出所有文件） ---------- */
  function allFiles(dir, base) {
    const out = [];
    for (const it of FS.list(dir)) {
      const p = FS.join(dir, it.name);
      if (it.type === 'file') out.push(p);
      else out.push(...allFiles(p, base));
    }
    return out;
  }
  function filePicker() {
    return new Promise((resolve) => {
      const files = allFiles('/', '/');
      const mask = document.createElement('div');
      mask.className = 'modal-mask';
      mask.innerHTML = `
        <div class="modal">
          <div class="modal-head">打开文件</div>
          <div class="modal-body" style="max-height:50dvh;overflow:auto">
            ${files.length ? files.map(f => `<button class="exp-item" data-f="${escapeHtml(f)}"><span class="fi">${icons.file}</span><span style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis">${escapeHtml(f)}</span></button>`).join('') : '<div class="empty"><div class="emo"></div><h3>暂无文件</h3></div>'}
          </div>
          <div class="modal-foot"><button class="btn gray" data-v="0">取消</button></div>
        </div>`;
      document.querySelector('#modal-root').appendChild(mask);
      mask.addEventListener('click', e => { if (e.target === mask) { mask.remove(); resolve(null); } });
      mask.querySelector('[data-v="0"]').onclick = () => { mask.remove(); resolve(null); };
      mask.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { const f = b.dataset.f; mask.remove(); resolve(f); });
    });
  }

  /* ---------- 打开 Windows 环境 ---------- */
  function orientBtn() {
    const cur = (window.Store.state.orientation) || 'portrait';
    const landscape = cur === 'landscape';
    return `<button class="icon-btn" data-act="toggle-orient" title="切换横屏/竖屏" style="font-size:16px">${landscape ? icons.phone : icons.monitor}</button>`;
  }
  function setOrientation(mode) {
    const st = window.Store.state;
    st.orientation = mode;
    window.Store.save();
    const N = window.UI.Native;
    if (N.available) N.setOrientation(mode === 'landscape' ? 'landscape' : 'portrait');
    else toast(mode === 'landscape' ? '已请求横屏（APK 中生效；Web 预览可缩放窗口体验宽屏布局）' : '已请求竖屏', 'ok');
  }
  function openWindows(container) {
    container.innerHTML = `
      <div class="env-page" data-page="win">
        <div class="env-topbar">
          <button class="icon-btn" data-act="close-env">${icons.back}</button>
          <div class="env-title"> Windows 模拟环境</div>
          ${orientBtn()}
          <span class="badge" style="background:rgba(22,163,74,.25);color:#bbf7d0;border-color:rgba(22,163,74,.4)">本地沙箱</span>
        </div>
        <div class="win-desktop" id="win-desktop">
          <div class="win-icons">
            ${Object.entries(Win.APPS).map(([k, a]) => `
              <button class="win-icon" data-app="${k}"><span class="wi">${icons[a.icon] || icons.apps}</span>${a.title}</button>`).join('')}
          </div>
          <div class="win-taskbar">
            <button class="win-start" data-act="start">⊞ 开始</button>
            <div class="win-tasks"></div>
            <div class="win-clock" id="win-clock"></div>
          </div>
        </div>
      </div>`;

    // 桌面图标
    container.querySelectorAll('[data-app]').forEach(b => {
      b.addEventListener('dblclick', () => Win.open(b.dataset.app));
      b.addEventListener('click', () => {
        container.querySelectorAll('.win-icon').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel');
        if (b._tapTimer) clearTimeout(b._tapTimer);
        b._tapTimer = setTimeout(() => b.classList.remove('sel'), 400);
        Win.open(b.dataset.app);
      });
    });

    // 开始菜单
    let smOpen = false;
    container.querySelector('[data-act="start"]').onclick = (e) => {
      e.stopPropagation();
      const old = container.querySelector('.win-startmenu');
      if (old) { old.remove(); smOpen = false; return; }
      const sm = document.createElement('div');
      sm.className = 'win-startmenu';
      sm.innerHTML = `
        <div class="sm-head">已固定的应用</div>
        ${Object.entries(Win.APPS).map(([k, a]) => `<button class="sm-item" data-app="${k}"><span class="smi">${icons[a.icon] || icons.apps}</span>${a.title}</button>`).join('')}
        <div class="sm-foot"><span>AgentHub OS 1.0</span><span></span></div>`;
      container.querySelector('.win-desktop').appendChild(sm);
      smOpen = true;
      sm.querySelectorAll('[data-app]').forEach(b => b.onclick = () => { Win.open(b.dataset.app); sm.remove(); smOpen = false; });
      setTimeout(() => document.addEventListener('click', function h(ev) {
        if (!ev.target.closest('.win-startmenu') && !ev.target.closest('[data-act="start"]')) { sm.remove(); document.removeEventListener('click', h); }
      }), 0);
    };

    // 时钟
    const clock = container.querySelector('#win-clock');
    const tick = () => {
      const d = new Date();
      clock.innerHTML = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}<br>${d.getMonth() + 1}月${d.getDate()}日`;
    };
    tick();
    const timer = setInterval(tick, 20000);
    container._timer = timer;

    // 默认打开欢迎窗口
    setTimeout(() => Win.open('terminal'), 250);
  }

  /* ==================================================
     三、安卓原生环境
  ================================================== */
  async function openAndroid(container) {
    let info = { model: 'Web 预览', brand: 'Browser', android: '-', sdk: '-', screen: screen.width + '×' + screen.height, ram: '-', cpu: navigator.hardwareConcurrency + ' 核' };
    if (Native.available) {
      const r = await Native.deviceInfo();
      if (r && !r.__unsupported && !r.__error) info = Object.assign(info, r);
    }
    container.innerHTML = `
      <div class="env-page" data-page="and" style="background:#fff">
        <div class="env-topbar">
          <button class="icon-btn" data-act="close-env">${icons.back}</button>
          <div class="env-title"> 安卓原生环境</div>
          ${orientBtn()}
          <span class="badge" style="background:rgba(22,163,74,.25);color:#bbf7d0;border-color:rgba(22,163,74,.4)">${Native.available ? '已连接原生桥' : 'Web 预览模式'}</span>
        </div>
        <div class="and-statusbar">
          <span id="and-clock">--:--</span>
          <div class="right">
            <span>${icons.signal}</span><span>${icons.wifi}</span><span id="and-batt">${icons.battery} --</span>
          </div>
        </div>
        <div class="and-body">
          <div class="and-wallpaper">
            <div style="font-size:13px;font-weight:700;color:var(--green-700);margin-bottom:12px">应用启动台</div>
            <div class="and-grid">
              ${[
      ['chat', 'chat', '对话'], ['agents', 'agents', '智能体'], ['env', 'env', '环境'],
      ['models', 'models', '模型'], ['files', 'folder', '文件'], ['term', 'terminal', '终端'],
      ['about', 'sparkles', '关于'], ['settings', 'gear', '设置']
    ].map(([k, ic, n]) => `<button class="and-app" data-launch="${k}"><span class="ai">${icons[ic] || ic}</span>${n}</button>`).join('')}
            </div>
          </div>
          <div class="and-widget">
            <h4> 设备信息（真实读取）</h4>
            <div class="kv"><span class="k">设备型号</span><span class="v">${escapeHtml(info.model || '-')}</span></div>
            <div class="kv"><span class="k">品牌</span><span class="v">${escapeHtml(info.brand || '-')}</span></div>
            <div class="kv"><span class="k">系统版本</span><span class="v">${escapeHtml(info.android || '-')}</span></div>
            <div class="kv"><span class="k">SDK 等级</span><span class="v">${escapeHtml(info.sdk || '-')}</span></div>
            <div class="kv"><span class="k">屏幕</span><span class="v">${escapeHtml(info.screen || '-')}</span></div>
            <div class="kv"><span class="k">处理器</span><span class="v">${escapeHtml(info.cpu || '-')}</span></div>
            <div class="kv"><span class="k">运行内存</span><span class="v">${escapeHtml(info.ram || '-')}</span></div>
          </div>
          <div class="and-widget">
            <h4> 原生能力测试</h4>
            <div class="row wrap" style="gap:8px">
              <button class="btn ghost sm" data-act="pick-folder"> 选择保存文件夹</button>
              <button class="btn ghost sm" data-act="vib">震动</button>
              <button class="btn ghost sm" data-act="share">分享文本</button>
              <button class="btn ghost sm" data-act="ntoast"> 系统 Toast</button>
            </div>
            <div class="hint" style="margin-top:8px">${Native.available ? '这些操作通过原生桥调用真实的 Android 系统能力。' : '在浏览器预览模式下不可用，安装 APK 后即可体验。'}</div>
          </div>
          <div class="and-widget">
            <h4> 沙箱状态</h4>
            <div class="kv"><span class="k">已配置模型</span><span class="v">${Models.list().length} 个</span></div>
            <div class="kv"><span class="k">在线智能体</span><span class="v">${Agents.list().length} 个</span></div>
            <div class="kv"><span class="k">虚拟磁盘占用</span><span class="v">${fmtSize(FS.sizeOf('/'))}</span></div>
            <div class="kv"><span class="k">保存文件夹</span><span class="v">${escapeHtml((Store.SaveDir.get() || {}).name || '未选择')}</span></div>
          </div>
          <div style="height:20px"></div>
        </div>
      </div>`;

    const timer2 = setInterval(() => {
      const c = container.querySelector('#and-clock');
      if (!c) { clearInterval(timer2); return; }
      const d = new Date();
      c.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }, 20000);
    const c0 = container.querySelector('#and-clock');
    if (c0) c0.textContent = fmtTime(Date.now());

    if (navigator.getBattery) {
      navigator.getBattery().then(b => {
        const el = container.querySelector('#and-batt');
        if (!el) return;
        const up = () => el.textContent = '电量 ' + Math.round(b.level * 100) + '%' + (b.charging ? ' · 充电中' : '');
        up(); b.addEventListener('levelchange', up);
      }).catch(() => { });
    }

    container.querySelectorAll('[data-launch]').forEach(b => b.onclick = () => {
      const k = b.dataset.launch;
      window.App.closeEnv();
      if (k === 'chat' || k === 'agents') window.App.go(k);
      else if (k === 'canvas') window.App.go('canvas');
      else if (k === 'apps') window.App.go('apps');
      else if (k === 'settings') window.App.go('settings');
      else if (k === 'models') window.App.push('models');
      else if (k === 'files') window.App.push('files');
      else if (k === 'term') { window.App.openEnv('win'); setTimeout(() => Win.open('terminal'), 150); }
      else if (k === 'about') { window.App.openEnv('win'); setTimeout(() => Win.open('about'), 150); }
      else toast('设置页开发中', 'err');
    });

    container.querySelector('[data-act="pick-folder"]').onclick = async () => {
      const r = await Native.pickFolder();
      if (r && r.__unsupported) { toast('请在安装的 APK 中使用', 'err'); return; }
      if (r && r.uri) { Store.SaveDir.set(r.uri, r.name || '已选择文件夹'); Store.save(); toast('已设置保存文件夹：' + (r.name || ''), 'ok'); window.App.refresh(); }
    };
    container.querySelector('[data-act="vib"]').onclick = async () => {
      const r = await Native.vibrate(60);
      if (r && r.__unsupported && navigator.vibrate) navigator.vibrate(60);
      else toast('已震动');
    };
    container.querySelector('[data-act="share"]').onclick = async () => {
      const r = await Native.share('来自 AgentHub 的分享测试 ✓', 'AgentHub');
      if (r && r.__unsupported) {
        if (navigator.share) { try { await navigator.share({ title: 'AgentHub', text: '来自 AgentHub 的分享测试 ✓' }); } catch { } }
        else toast('当前环境不支持分享', 'err');
      } else toast('已调起系统分享');
    };
    container.querySelector('[data-act="ntoast"]').onclick = async () => {
      const r = await Native.toast('Hello from AgentHub');
      if (r && r.__unsupported) toast('Hello from AgentHub');
    };
  }

  /* ==================================================
     四、事件分发
  ================================================== */
  function onAction(act, el, container) {
    if (act === 'open-win') { window.App.openEnv('win'); return; }
    if (act === 'open-and') { window.App.openEnv('android'); return; }
    if (act === 'close-env') { window.App.closeEnv(); return; }
    if (act === 'toggle-orient') {
      const cur = (window.Store.state.orientation) || 'portrait';
      const next = cur === 'landscape' ? 'portrait' : 'landscape';
      setOrientation(next);
      // 刷新当前环境页以更新按钮图标
      const envOpen = window.App._envOpen ? window.App._envOpen() : null;
      if (envOpen) { window.App.openEnv(envOpen.page === 'androidenv' ? 'android' : 'win'); }
      return;
    }
  }

  window.EnvPage = { render, onAction, Win, openWindows, openAndroid };
})();
