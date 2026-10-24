/* ============ 文件页：真实文件夹工作 + 虚拟磁盘备份 ============ */
(function () {
  const { $, $$, toast, sheet, confirmDialog, escapeHtml, icons, fmtSize, fmtDate, Native, download } = window.UI;
  const { FS, SaveDir } = window.Store;

  let cwd = '/home/agent/workspace';   // 虚拟盘当前目录
  let realCwd = '';                   // 真实文件夹内的相对路径（''=根）
  let realItems = [];                 // 真实文件夹当前目录项

  function realActive() { return !!(SaveDir.get() && Native.available); }

  function render(container) {
    const dir = SaveDir.get();
    const real = realActive();
    container.innerHTML = `
      <div class="page" data-page="files">
        <div class="page-header">
          <h1>文件<span class="sub">${real ? '真实文件夹工作' : '虚拟磁盘 · 可保存到手机文件夹'}</span></h1>
          <button class="icon-btn" data-act="fs-menu">${icons.more}</button>
        </div>
        <div class="page-body">
          <div class="card">
            <div class="card-title">本地保存位置</div>
            <div class="muted" style="margin-bottom:10px">${dir
              ? `已选择：<b style="color:var(--text)">${escapeHtml(dir.name || dir.uri)}</b><br>文件将直接读写到该真实文件夹（Android SAF）`
              : '未选择。点击下方按钮选择手机上的一个文件夹，即可进行真实文件读写与创建文件夹。'}</div>
            <div class="row wrap" style="gap:8px">
              <button class="btn ghost sm" data-act="pick-dir">${dir ? '更换文件夹' : '选择文件夹'}</button>
              ${dir ? `<button class="btn gray sm" data-act="clear-dir">清除</button>` : ''}
            </div>
          </div>

          ${real ? `
          <div class="card" style="margin-bottom:12px">
            <div class="card-title">新建</div>
            <div class="row" style="gap:8px">
              <input class="input" id="real-new-name" placeholder="新文件夹或文件名（如 report.md）" style="flex:1">
              <button class="btn sm" data-act="real-create">创建</button>
            </div>
          </div>
          <div class="fs-breadcrumb" id="fs-crumb"></div>
          <div id="fs-list"></div>
          ` : `
          <div class="fs-breadcrumb" id="fs-crumb"></div>
          <div class="row" style="gap:8px;margin-bottom:12px;flex-wrap:wrap">
            <button class="btn gray sm" data-act="new-file">＋ 文件</button>
            <button class="btn gray sm" data-act="new-dir">＋ 文件夹</button>
            <button class="btn gray sm" data-act="export">导出全部</button>
            <button class="btn gray sm" data-act="import">导入</button>
          </div>
          <div id="fs-list"></div>
          `}
        </div>
      </div>`;
    if (real) loadReal(container); else { drawCrumb(container); drawList(container); }
  }

  /* ---------- 真实文件夹 ---------- */
  async function loadReal(container) {
    const el = container.querySelector('#fs-list');
    el.innerHTML = '<div class="muted center" style="padding:24px 0">读取中…</div>';
    const r = await Native.fsList(realCwd);
    if (!r || !r.ok) {
      el.innerHTML = '<div class="muted center" style="padding:24px 0">' + (r && r.__error ? ('读取失败：' + escapeHtml(r.__error)) : '读取失败') + '</div>';
      return;
    }
    realItems = (r.items || []).slice().sort((a, b) => (b.isDir - a.isDir) || String(a.name).localeCompare(b.name));
    drawCrumb(container);
    drawRealList(container);
  }

  function drawRealList(container) {
    const el = container.querySelector('#fs-list');
    const path = realCwd || '/';
    if (!realItems.length) {
      el.innerHTML = `<div class="empty" style="padding:30px 0"><div class="emo">${icons.folder}</div><h3>空文件夹</h3><p>${escapeHtml(path)}</p></div>`;
      return;
    }
    el.innerHTML = realItems.map(i => {
      const ic = i.isDir ? icons.folder : (/\.(md|txt|json|js|py|html|css)$/i.test(i.name) ? icons.file : icons.file);
      return `
        <div class="fs-item">
          <button style="display:flex;align-items:center;gap:11px;flex:1;min-width:0;text-align:left" data-ropen="${escapeHtml(i.name)}" data-type="${i.isDir ? 'dir' : 'file'}">
            <span class="fi">${ic}</span>
            <span class="fn">${escapeHtml(i.name)}</span>
          </button>
          <span class="fsz">${i.isDir ? '' : fmtSize(i.size || 0)}</span>
          <button class="icon-btn" data-rdel="${escapeHtml(i.name)}" title="删除" style="color:var(--danger)">${icons.trash.replace('<svg', '<svg style="width:16px;height:16px"')}</button>
        </div>`;
    }).join('') + `<div class="muted" style="text-align:center;padding:10px 0 4px">${realItems.length} 个项目 · ${escapeHtml(path)}</div>`;

    el.querySelectorAll('[data-ropen]').forEach(b => b.onclick = async () => {
      const name = b.dataset.ropen;
      if (b.dataset.type === 'dir') { realCwd = (realCwd ? realCwd + '/' : '') + name; loadReal(container); }
      else {
        const rr = await Native.fsRead((realCwd ? realCwd + '/' : '') + name);
        if (rr && rr.ok) { openFile({ name, content: rr.content, path: (realCwd ? realCwd + '/' : '') + name, real: true }, container); }
        else toast('读取失败：' + ((rr && rr.__error) || '未知'), 'err');
      }
    });
    el.querySelectorAll('[data-rdel]').forEach(b => b.onclick = async () => {
      const name = b.dataset.rdel;
      const ok = await confirmDialog({ title: '删除', body: `确定删除「${escapeHtml(name)}」吗？`, okText: '删除', danger: true });
      if (!ok) return;
      const rr = await Native.fsDelete((realCwd ? realCwd + '/' : '') + name);
      if (rr && rr.ok) { toast('已删除', 'ok'); loadReal(container); }
      else toast('删除失败：' + ((rr && rr.__error) || '未知'), 'err');
    });
  }

  async function realCreate(container) {
    const inp = container.querySelector('#real-new-name');
    const name = inp && inp.value.trim();
    if (!name) { toast('请输入名称', 'err'); return; }
    const base = realCwd ? realCwd + '/' : '';
    if (/\/$/.test(name) || !name.includes('.')) {
      const rr = await Native.fsMkdir(base + name.replace(/\/$/, ''));
      if (rr && rr.ok) { if (inp) inp.value = ''; toast('已创建文件夹', 'ok'); loadReal(container); }
      else toast('创建失败：' + ((rr && rr.__error) || '未知'), 'err');
    } else {
      const rr = await Native.fsWrite(base + name, '');
      if (rr && rr.ok) { if (inp) inp.value = ''; toast('已创建文件', 'ok'); loadReal(container); }
      else toast('创建失败：' + ((rr && rr.__error) || '未知'), 'err');
    }
  }

  function drawCrumb(container) {
    const el = container.querySelector('#fs-crumb');
    if (realActive()) {
      const parts = (realCwd || '').split('/').filter(Boolean);
      let html = `<button data-rgo="">根目录 /</button>`;
      let acc = '';
      parts.forEach(p => { acc += (acc ? '/' : '') + p; html += `<span class="sep">›</span><button data-rgo="${escapeHtml(acc)}">${escapeHtml(p)}</button>`; });
      el.innerHTML = html;
      el.querySelectorAll('[data-rgo]').forEach(b => b.onclick = () => { realCwd = b.dataset.rgo; loadReal(container); });
      return;
    }
    const parts = cwd.split('/').filter(Boolean);
    let html = `<button data-go="/">根目录 /</button>`;
    let acc = '';
    parts.forEach((p, i) => { acc += '/' + p; html += `<span class="sep">›</span><button data-go="${acc}">${escapeHtml(p)}</button>`; });
    el.innerHTML = html;
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { cwd = b.dataset.go; drawCrumb(container); drawList(container); });
  }

  function drawList(container) {
    const el = container.querySelector('#fs-list');
    const items = FS.list(cwd);
    const size = FS.sizeOf(cwd);
    if (!items.length) {
      el.innerHTML = `<div class="empty" style="padding:30px 0"><div class="emo">${icons.folder}</div><h3>空文件夹</h3><p>共 ${fmtSize(size)}</p></div>`;
      return;
    }
    el.innerHTML = items.map(i => {
      const isDir = i.type === 'dir';
      const meta = isDir ? FS.list(FS.join(cwd, i.name)).length + ' 项' : fmtSize((i.content || '').length);
      const isExe = !isDir && /\.(exe|app)$/i.test(i.name);
      return `
        <div class="fs-item">
          <button style="display:flex;align-items:center;gap:11px;flex:1;min-width:0;text-align:left" data-open="${escapeHtml(i.name)}" data-type="${i.type}">
            <span class="fi">${isDir ? icons.folder : (isExe ? icons.monitor : (i.name.match(/\.(md|txt)$/i) ? icons.file : icons.file))}</span>
            <span class="fn">${escapeHtml(i.name)}</span>
          </button>
          <span class="fsz">${meta}</span>
          ${isExe ? `<button class="icon-btn" data-run="${escapeHtml(i.name)}" title="在模拟环境运行" style="color:var(--green-700)">${icons.play}</button>` : ''}
          ${!isDir ? `<button class="icon-btn" data-save="${escapeHtml(i.name)}" title="保存到本地文件夹">${icons.folder.replace('<svg', '<svg style="width:17px;height:17px"')}</button>` : ''}
          <button class="icon-btn" data-rename="${escapeHtml(i.name)}" data-type="${i.type}" title="重命名">${icons.edit.replace('<svg', '<svg style="width:16px;height:16px"')}</button>
          <button class="icon-btn" data-del="${escapeHtml(i.name)}" title="删除" style="color:var(--danger)">${icons.trash.replace('<svg', '<svg style="width:16px;height:16px"')}</button>
        </div>`;
    }).join('') + `<div class="muted" style="text-align:center;padding:10px 0 4px">${items.length} 个项目 · 合计 ${fmtSize(size)}</div>`;

    el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
      const p = FS.join(cwd, b.dataset.open);
      if (b.dataset.type === 'dir') { cwd = p; drawCrumb(container); drawList(container); }
      else openFile(p, container);
    });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const p = FS.join(cwd, b.dataset.del);
      const ok = await confirmDialog({ title: '删除', body: `确定删除「${escapeHtml(b.dataset.del)}」吗？`, okText: '删除', danger: true });
      if (ok) { FS.remove(p); toast('已删除'); drawList(container); }
    });
    el.querySelectorAll('[data-rename]').forEach(b => b.onclick = async () => {
      const old = b.dataset.rename;
      const r = await promptName('重命名', '新名称', old);
      if (r && r !== old) { try { FS.rename(FS.join(cwd, old), r); drawList(container); toast('已重命名'); } catch (e) { toast(e.message, 'err'); } }
    });
    el.querySelectorAll('[data-save]').forEach(b => b.onclick = () => saveOne(FS.join(cwd, b.dataset.save)));
    el.querySelectorAll('[data-run]').forEach(b => b.onclick = () => {
      const p = FS.join(cwd, b.dataset.run);
      window.App.openEnv('win');
      setTimeout(() => window.EnvPage.Win.open('runner', { path: p }), 150);
      toast('已在模拟环境中启动程序', 'ok');
    });
  }

  function openFile(pathOrNode, container) {
    let node = pathOrNode;
    if (typeof node === 'string') node = FS.getNode(node);
    if (!node || node.type !== 'file') return;
    if (/\.(exe|app)$/i.test(node.name)) {
      window.App.openEnv('win');
      setTimeout(() => window.EnvPage.Win.open('runner', { path: node.path || node.name }), 150);
      return;
    }
    window.App.push('preview', { path: node.path || node.name, real: node.real, content: node.content });
  }

  /* ---------- 保存单个文件到用户选择的文件夹 ---------- */
  async function saveOne(path) {
    const node = FS.getNode(path);
    if (!node || node.type !== 'file') return;
    const dir = SaveDir.get();
    if (Native.available && dir) {
      toast('正在保存到 ' + (dir.name || '本地文件夹') + ' …');
      const r = await Native.saveToFolder(node.name, node.content || '');
      if (r && r.ok) toast('已保存到本地文件夹', 'ok');
      else if (r && r.__error) toast('保存失败：' + r.__error, 'err');
      else if (r && r.__unsupported) download(node.name, node.content || '', node.mime);
      else toast('保存结果：' + JSON.stringify(r), 'err');
      return;
    }
    if (!dir) {
      const r = await Native.pickFolder();
      if (r && r.uri) { SaveDir.set(r.uri, r.name || '本地文件夹'); Store.save(); window.App.refresh(); }
      else { download(node.name, node.content || '', node.mime); toast('未选择文件夹，已改为下载', ''); return; }
    }
    download(node.name, node.content || '', node.mime);
  }

  function promptName(title, placeholder, value) {
    return new Promise((resolve) => {
      const mask = document.createElement('div');
      mask.className = 'modal-mask';
      mask.innerHTML = `
        <div class="modal">
          <div class="modal-head">${escapeHtml(title)}</div>
          <div class="modal-body"><input class="input" id="fn-input" placeholder="${escapeHtml(placeholder || '')}" value="${escapeHtml(value || '')}"></div>
          <div class="modal-foot">
            <button class="btn gray" data-v="0">取消</button>
            <button class="btn" data-v="1">确定</button>
          </div>
        </div>`;
      document.querySelector('#modal-root').appendChild(mask);
      const inp = mask.querySelector('#fn-input');
      setTimeout(() => { inp.focus(); inp.select(); }, 60);
      mask.addEventListener('click', e => { if (e.target === mask) { mask.remove(); resolve(null); } });
      mask.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { const v = b.dataset.v === '1' ? inp.value.trim() : null; mask.remove(); resolve(v); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') mask.querySelector('[data-v="1"]').click(); });
    });
  }

  function importFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try { FS.import(rd.result); toast('导入成功 ✓', 'ok'); cwd = '/home/agent/workspace'; realCwd = ''; window.App.refresh(); }
        catch (e) { toast('导入失败：文件格式不正确', 'err'); }
      };
      rd.readAsText(f);
    };
    inp.click();
  }

  async function onAction(act, el, container) {
    if (act === 'real-create') { await realCreate(container); return; }
    if (act === 'new-file') {
      const name = await promptName('新建文件', '文件名称（如 note.txt）');
      if (name) { try { FS.writeFile(FS.join(cwd, name), ''); drawList(container); toast('已创建'); } catch (e) { toast(e.message, 'err'); } }
      return;
    }
    if (act === 'new-dir') {
      const name = await promptName('新建文件夹', '文件夹名称');
      if (name) { try { FS.mkdir(FS.join(cwd, name)); drawList(container); } catch (e) { toast(e.message, 'err'); } }
      return;
    }
    if (act === 'export') {
      download('agenthub-workspace-' + new Date().toISOString().slice(0, 10) + '.json', FS.export(), 'application/json');
      toast('已导出工作区备份（JSON）', 'ok');
      return;
    }
    if (act === 'import') { importFile(); return; }
    if (act === 'pick-dir') {
      const r = await Native.pickFolder();
      if (r && r.__unsupported) { toast('请在安装的 APK 中选择文件夹；Web 端可使用「导出/下载」', 'err'); return; }
      if (r && r.uri) { SaveDir.set(r.uri, r.name || '本地文件夹'); realCwd = ''; Store.save(); toast('已设置真实工作文件夹 ✓', 'ok'); window.App.refresh(); }
      return;
    }
    if (act === 'clear-dir') { SaveDir.clear(); realCwd = ''; Store.save(); window.App.refresh(); return; }
    if (act === 'fs-menu') {
      await sheet({
        title: '文件操作',
        body: `
          <button class="list-item" data-act="export" style="margin-bottom:8px"><div class="li-icon">${icons.download}</div><div class="li-main"><div class="li-title">导出虚拟工作区</div><div class="li-sub">保存为 JSON 备份文件</div></div></button>
          <button class="list-item" data-act="import"><div class="li-icon">${icons.file}</div><div class="li-main"><div class="li-title">导入虚拟工作区</div><div class="li-sub">从 JSON 备份恢复（会覆盖当前虚拟磁盘）</div></div></button>`
      });
      return;
    }
  }

  async function saveByPath(path, name, content, mime) {
    if (path) { saveOne(path); return; }
    const dir = SaveDir.get();
    if (window.Native && window.Native.available && dir) {
      toast('正在保存到 ' + (dir.name || '本地文件夹') + ' …');
      const r = await window.Native.saveToFolder(name, content || '');
      if (r && r.ok) toast('已保存到本地文件夹', 'ok');
      else if (r && r.__error) toast('保存失败：' + r.__error, 'err');
      else if (r && r.__unsupported) download(name, content || '', mime);
      else toast('保存结果：' + JSON.stringify(r), 'err');
      return;
    }
    if (!dir) {
      const r = await window.Native.pickFolder();
      if (r && r.uri) { SaveDir.set(r.uri, r.name || '本地文件夹'); window.Store.save(); window.App.refresh(); }
      else { download(name, content || '', mime); toast('未选择文件夹，已改为下载', ''); return; }
    }
    download(name, content || '', mime);
  }

  window.FilesPage = { render, onAction, saveByPath };
})();
