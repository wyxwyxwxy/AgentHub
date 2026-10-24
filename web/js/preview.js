/* ============ 万能预览器（v2.2） ============
 * 什么格式都能看：网页/界面（iframe 设备框）、代码/Markdown/JSON/CSV、
 * 图片/音频/视频、3D 模型（OBJ/STL，Three.js 实时渲染可旋转缩放）。
 * 入口：文件页点击文件，或 App.push('preview', {path} | {name, content, mime})
 */
(function () {
  const { $, $$, toast, escapeHtml, download, icons } = window.UI;
  const { FS, SaveDir } = window.Store;

  const extOf = (name) => (String(name || '').match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();

  const CATS = {
    html: ['html', 'htm'],
    svg: ['svg'],
    image: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico', 'avif'],
    audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'],
    video: ['mp4', 'webm', 'mov', 'm4v'],
    model3d: ['obj', 'stl'],
    markdown: ['md', 'markdown'],
    json: ['json'],
    csv: ['csv', 'tsv'],
    text: ['txt', 'log', 'yml', 'yaml', 'toml', 'ini', 'conf'],
    code: ['js', 'ts', 'jsx', 'tsx', 'css', 'scss', 'less', 'py', 'java', 'kt', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'dart', 'lua', 'r', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'vue', 'svelte', 'xml', 'gradle', 'properties', 'gitignore', 'env']
  };
  function catOf(ext) {
    for (const k in CATS) if (CATS[k].includes(ext)) return k;
    return 'text';
  }
  const CAT_LABEL = { html: '网页', svg: '矢量图', image: '图片', audio: '音频', video: '视频', model3d: '3D 模型', markdown: '文档', json: '数据', csv: '表格', text: '文本', code: '代码' };

  /* 当前视图状态 */
  let cur = { name: '', content: '', mime: '', path: '', cat: 'text', mode: '' };

  /* ---------- 工具 ---------- */
  function dataUriOf(content, mime) {
    if (!content) return '';
    if (/^data:/i.test(content)) return content;
    if (/^https?:/i.test(content)) return content;
    const m = mime || 'image/png';
    const b64 = content.replace(/\s+/g, '');
    return 'data:' + m + ';base64,' + b64;
  }
  function looksBase64(s) { return s && s.length > 64 && /^[A-Za-z0-9+/=\s]+$/.test(s.slice(0, 200)); }

  /* ---------- 各类渲染 ---------- */
  function renderHtml(c, content) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="seg" style="margin-bottom:10px">
        <button class="seg-btn active" data-mode="phone"> 手机框</button>
        <button class="seg-btn" data-mode="desktop"> 桌面</button>
        <button class="seg-btn" data-mode="raw">⟨⟩ 代码</button>
      </div>
      <div class="pv-frame" id="pv-stage">
        <div class="pv-toolbar"><span class="pv-title">${escapeHtml(cur.name)}</span><span id="pv-size"></span></div>
        <iframe class="pv-device" id="pv-frame" sandbox="allow-scripts allow-forms allow-modals" referrerpolicy="no-referrer"></iframe>
      </div>`;
    c.appendChild(wrap);
    const iframe = wrap.querySelector('#pv-frame');
    const stage = wrap.querySelector('#pv-stage');
    const setMode = (mode) => {
      wrap.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      if (mode === 'raw') {
        iframe.style.display = 'none';
        let pre = wrap.querySelector('#pv-raw');
        if (!pre) {
          pre = document.createElement('pre');
          pre.id = 'pv-raw';
          pre.className = 'code-block';
          pre.style.cssText = 'max-height:60vh;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:0;border-radius:0';
          pre.textContent = content;
          stage.appendChild(pre);
        }
        pre.style.display = '';
      } else {
        const raw = wrap.querySelector('#pv-raw');
        if (raw) raw.style.display = 'none';
        iframe.style.display = '';
        iframe.style.cssText = mode === 'phone'
          ? 'width:390px;height:min(72vh,760px);border:0;background:#fff;display:block;margin:0 auto;border-left:1px solid var(--border);border-right:1px solid var(--border)'
          : 'width:100%;height:62vh;border:0;background:#fff;display:block';
        iframe.srcdoc = content;
      }
    };
    wrap.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
    setMode('phone');
  }

  function renderCodeLike(c, content, lang) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<pre class="code-block" style="max-height:66vh;overflow:auto;white-space:pre-wrap;word-break:break-all">${escapeHtml(content.slice(0, 20000))}${content.length > 20000 ? '\n…（仅预览前 20000 字）' : ''}</pre>`;
    c.appendChild(wrap);
  }

  /* ---------- CSS：效果预览 + 代码 + 应用到 HTML ---------- */
  const CSS_DEMO = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;padding:16px;font-family:system-ui,-apple-system,sans-serif;background:#fafafa;color:#222}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
</style><style>__CSS__</style></head><body>
  <div class="row"><h1 style="margin:0">H1 标题</h1><span class="chip">chip 标签</span><span class="badge">badge 徽章</span></div>
  <h2>H2 标题</h2>
  <h3>H3 标题</h3>
  <p>正文段落：预设的样式会作用在这些常见元素上（h1-h3、p、a、button、input、ul、table）。Aa Bb Cc 123 <a href="#">链接 Link</a> <code>inline code</code></p>
  <div class="row">
    <button class="btn">.btn 主按钮</button>
    <button class="btn gray">.btn.gray 次按钮</button>
    <button class="btn ghost">.btn.ghost 幽灵按钮</button>
  </div>
  <div class="row"><input class="input" placeholder=".input 输入框"></div>
  <div class="card" style="max-width:420px"><div class="card-title">.card 卡片标题</div><div class="muted">.muted 辅助文字 · .card 容器</div></div>
  <ul><li>列表项一</li><li>列表项二</li></ul>
  <table><thead><tr><th>表头</th><th>列</th></tr></thead><tbody><tr><td>单元格</td><td>cell</td></tr></tbody></table>
  <div class="box" style="padding:20px;border:1px dashed #bbb">自定义选择器元素（.box / #id / [attr] 均可生效）</div>
</body></html>`;
  function htmlFilesInFs() {
    const out = [];
    (function walk(dir) {
      for (const it of FS.list(dir)) {
        const p = FS.join(dir, it.name);
        if (it.type === 'dir') walk(p);
        else if (/\.(html?|htm)$/i.test(it.name)) out.push(p);
      }
    })('/');
    return out;
  }
  function renderCss(c, content) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="seg" style="margin-bottom:10px">
        <button class="seg-btn active" data-mode="preview"> 效果预览</button>
        <button class="seg-btn" data-mode="code">⟨⟩ 代码</button>
        <button class="seg-btn" data-mode="apply">应用到 HTML</button>
      </div>
      <div id="css-body"></div>`;
    c.appendChild(wrap);
    const body = wrap.querySelector('#css-body');
    const frame = () => {
      const f = document.createElement('div');
      f.className = 'pv-frame';
      f.innerHTML = `<div class="pv-toolbar"><span class="pv-title">${escapeHtml(cur.name)}</span><span class="muted-sm">样式示例页</span></div>
        <iframe class="pv-device" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer" style="width:100%;height:52vh;border:0;background:#fff;display:block"></iframe>`;
      return f;
    };
    const showPreview = () => {
      body.innerHTML = '';
      const f = frame();
      body.appendChild(f);
      f.querySelector('iframe').srcdoc = CSS_DEMO.replace('__CSS__', () => content);
    };
    const showCode = () => { body.innerHTML = ''; renderCodeLike(body, content, 'css'); };
    const showApply = async () => {
      const files = htmlFilesInFs();
      if (!files.length) { toast('虚拟磁盘中还没有 HTML 文件', 'err'); return; }
      const pick = await new Promise((resolve) => {
        const mask = document.createElement('div');
        mask.className = 'modal-mask';
        mask.innerHTML = `
          <div class="modal">
            <div class="modal-head">选择要应用样式的 HTML 文件</div>
            <div class="modal-body" style="max-height:50dvh;overflow:auto">
              ${files.map(f => `<button class="exp-item" data-f="${escapeHtml(f)}"><span class="fi">${icons.file}</span><span style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis">${escapeHtml(f)}</span></button>`).join('')}
            </div>
            <div class="modal-foot"><button class="btn gray" data-v="0">取消</button></div>
          </div>`;
        document.querySelector('#modal-root').appendChild(mask);
        mask.addEventListener('click', e => { if (e.target === mask) { mask.remove(); resolve(null); } });
        mask.querySelector('[data-v="0"]').onclick = () => { mask.remove(); resolve(null); };
        mask.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { mask.remove(); resolve(b.dataset.f); });
      });
      if (!pick) return;
      const node = FS.getNode(pick);
      const html = String((node && node.content) || '');
      const styled = /<\/head>/i.test(html)
        ? html.replace(/<\/head>/i, '<style>\n' + content + '\n</style></head>')
        : '<style>\n' + content + '\n</style>\n' + html;
      body.innerHTML = '';
      const f = frame();
      f.querySelector('.pv-title').textContent = pick.split('/').pop() + ' + ' + cur.name;
      f.querySelector('.muted-sm').textContent = '已注入样式';
      body.appendChild(f);
      f.querySelector('iframe').srcdoc = styled;
      const bar = document.createElement('div');
      bar.className = 'row';
      bar.style.cssText = 'gap:8px;margin-top:10px';
      bar.innerHTML = `<button class="btn gray sm" data-s="save" style="flex:1">另存为合并文件</button><button class="btn gray sm" data-s="copy" style="flex:1">复制合并后代码</button>`;
      body.appendChild(bar);
      bar.querySelector('[data-s="save"]').onclick = () => {
        const out = pick.replace(/\.(html?|htm)$/i, '') + '.styled.html';
        try { FS.writeFile(out, styled); toast('已保存 ' + out + '（文件页可查看）', 'ok'); }
        catch (e) { toast(e.message, 'err'); }
      };
      bar.querySelector('[data-s="copy"]').onclick = async () => {
        try { await navigator.clipboard.writeText(styled); toast('已复制到剪贴板', 'ok'); }
        catch (e) { toast('复制失败：' + e.message, 'err'); }
      };
    };
    wrap.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      wrap.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('active', x === b));
      const m = b.dataset.mode;
      if (m === 'preview') showPreview();
      else if (m === 'code') showCode();
      else showApply();
    });
    showPreview();
  }

  /* ---------- SVG：渲染 / 代码 双视图（脚本已剥离，动画自动播放） ---------- */
  function sanitizeSvg(svgText) {
    try {
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      const bad = doc.querySelector('parsererror');
      if (bad) return null;
      doc.querySelectorAll('script, foreignObject').forEach(n => n.remove());
      doc.querySelectorAll('*').forEach(n => {
        [...n.attributes].forEach(a => {
          const an = a.name.toLowerCase();
          if (an.startsWith('on')) n.removeAttribute(a.name);
          else if ((an === 'href' || an === 'xlink:href') && /javascript:/i.test(a.value)) n.removeAttribute(a.name);
        });
      });
      return '<?xml version="1.0" encoding="UTF-8"?>' + new XMLSerializer().serializeToString(doc.documentElement);
    } catch (e) { return null; }
  }
  function renderSvg(c, content) {
    const clean = sanitizeSvg(content);
    const animated = /<animate|@keyframes|animation\s*:|animateTransform/i.test(content);
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="seg" style="margin-bottom:10px">
        <button class="seg-btn active" data-mode="render">渲染</button>
        <button class="seg-btn" data-mode="code">⟨⟩ 代码</button>
      </div>
      <div id="svg-body"></div>`;
    c.appendChild(wrap);
    const body = wrap.querySelector('#svg-body');
    const showRender = () => {
      body.innerHTML = '';
      if (!clean) {
        body.innerHTML = `<div class="card"><div class="muted">SVG 解析失败，已切换到代码视图</div></div>`;
        renderCodeLike(body, content, 'svg');
        return;
      }
      const b64 = btoa(unescape(encodeURIComponent(clean)));
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'text-align:center;padding:18px;background:repeating-conic-gradient(#f1f5f9 0% 25%, #fff 0% 50%) 50%/18px 18px';
      card.innerHTML = `<img src="data:image/svg+xml;base64,${b64}" alt="${escapeHtml(cur.name)}" style="max-width:100%;max-height:56vh;display:block;margin:0 auto">
        <div class="muted" style="font-size:11.5px;margin-top:10px">${animated ? '» 检测到动画（SMIL/CSS），播放中' : '静态矢量图'} · 已剥离脚本，可安全预览</div>`;
      body.appendChild(card);
    };
    wrap.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      wrap.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('active', x === b));
      if (b.dataset.mode === 'render') showRender();
      else { body.innerHTML = ''; renderCodeLike(body, content, 'svg'); }
    });
    showRender();
  }

  /* Three.js 场景代码：代码视图 + 一键运行（内联 three.js 到 iframe） */
  let threeSrcCache = null;
  async function loadThreeSrc() {
    if (threeSrcCache) return threeSrcCache;
    const resp = await fetch('js/vendor/three.min.js');
    threeSrcCache = await resp.text();
    return threeSrcCache;
  }
  function isThreeScene(content) {
    return /THREE\.|new THREE|WebGLRenderer|requestAnimationFrame/.test(content);
  }
  function renderRunnable(c, content) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="seg" style="margin-bottom:10px">
        <button class="seg-btn active" data-mode="code">⟨⟩ 代码</button>
        <button class="seg-btn" data-mode="run">» 运行 3D 场景</button>
      </div>
      <div id="pv-run-body"></div>`;
    c.appendChild(wrap);
    const body = wrap.querySelector('#pv-run-body');
    const showCode = () => {
      body.innerHTML = '';
      renderCodeLike(body, content, 'js');
    };
    const showRun = async () => {
      body.innerHTML = '<div class="muted" style="padding:20px;text-align:center">正在加载 3D 引擎…</div>';
      try {
        const threeSrc = await loadThreeSrc();
        const frame = document.createElement('div');
        frame.className = 'pv-frame';
        frame.innerHTML = `<div class="pv-toolbar"><span class="pv-title">${escapeHtml(cur.name)}</span><span class="muted-sm">Three.js 实时渲染</span></div>
          <iframe class="pv-device" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>`;
        body.innerHTML = '';
        body.appendChild(frame);
        const iframe = frame.querySelector('iframe');
        iframe.srcdoc = '<scr' + 'ipt>' + threeSrc + '</scr' + 'ipt>\n<scr' + 'ipt>\nwindow.onerror = function(m){ document.title = "ERR:" + m; };\n' + content + '\n</scr' + 'ipt>';
      } catch (e) {
        body.innerHTML = `<div class="card"><div class="muted">加载 3D 引擎失败：${escapeHtml(e.message)}</div></div>`;
      }
    };
    wrap.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      wrap.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('active', x === b));
      if (b.dataset.mode === 'code') showCode(); else showRun();
    });
    showCode();
  }

  function renderMarkdown(c, content) {
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.innerHTML = `<div class="markdown-body">${window.UI.renderMarkdown(content.slice(0, 20000))}</div>`;
    c.appendChild(wrap);
  }

  function renderJson(c, content) {
    let pretty = content;
    try { pretty = JSON.stringify(JSON.parse(content), null, 2); } catch (e) { /* 原样 */ }
    renderCodeLike(c, pretty, 'json');
  }

  function renderCsv(c, content) {
    const rows = content.replace(/\r/g, '').split('\n').filter(Boolean).slice(0, 200).map(l => l.split(','));
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.style.padding = '0';
    wrap.style.overflow = 'auto';
    let html = '<table style="border-collapse:collapse;width:100%;font-size:12.5px">';
    rows.forEach((cols, i) => {
      html += '<tr>' + cols.map((cell, j) => {
        const tag = i === 0 ? 'th' : 'td';
        return `<${tag} style="border:1px solid var(--border);padding:6px 9px;${i === 0 ? 'background:var(--green-50);font-weight:700;position:sticky;top:0' : ''}">${escapeHtml(cell)}</${tag}>`;
      }).join('') + '</tr>';
    });
    html += '</table>';
    wrap.innerHTML = html;
    c.appendChild(wrap);
  }

  function renderImage(c, content, mime) {
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.style.textAlign = 'center';
    const uri = dataUriOf(content, mime);
    wrap.innerHTML = `<img src="${uri}" alt="${escapeHtml(cur.name)}" style="max-width:100%;max-height:60vh;border-radius:10px;border:1px solid var(--border)">`;
    c.appendChild(wrap);
  }

  function renderMedia(c, content, kind) {
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.innerHTML = `<${kind === 'audio' ? 'audio' : 'video'} controls style="width:100%;${kind === 'audio' ? '' : 'max-height:58vh;border-radius:10px'}"><source src="${dataUriOf(content, cur.mime)}">当前环境不支持播放该${kind === 'audio' ? '音频' : '视频'}</${kind === 'audio' ? 'audio' : 'video'}>`;
    c.appendChild(wrap);
  }

  /* 3D 预览：OBJ / STL —— Three.js + 环境反射 + 软阴影 + 物理材质预设 */
  /* 程序化渐变环境贴图（equirectangular）：天空渐变 + 柔光箱亮斑，经 PMREM 预滤波产生真实反射 */
  function makeEnvTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#f2fff8'); g.addColorStop(0.42, '#c7ecd6'); g.addColorStop(0.60, '#6b9681'); g.addColorStop(1, '#1d3a2b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
    const blob = (x, y, r, a) => {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,' + a + ')'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    blob(118, 54, 95, 0.95); blob(382, 36, 72, 0.85); blob(258, 148, 130, 0.22);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }
  /* 物理材质预设：陶瓷 / 金属 / 玻璃 / 哑光 / 线框 */
  const MAT_PRESETS = {
    ceramic: {
      label: '陶瓷', make: () => new THREE.MeshPhysicalMaterial({
        color: 0x22c55e, roughness: 0.26, metalness: 0.0,
        clearcoat: 1.0, clearcoatRoughness: 0.06, envMapIntensity: 1.15
      })
    },
    metal: {
      label: '金属', make: () => new THREE.MeshStandardMaterial({
        color: 0xd9e6de, roughness: 0.16, metalness: 1.0, envMapIntensity: 1.5
      })
    },
    glass: {
      label: '玻璃', make: () => new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.04, metalness: 0.0,
        transmission: 0.96, thickness: 1.4, ior: 1.45, clearcoat: 1.0, envMapIntensity: 1.3
      })
    },
    matte: {
      label: '哑光', make: () => new THREE.MeshStandardMaterial({
        color: 0x3f7a58, roughness: 0.88, metalness: 0.0, envMapIntensity: 0.45
      })
    },
    wire: {
      label: '线框', make: () => new THREE.MeshBasicMaterial({ color: 0x16a34a, wireframe: true })
    }
  };
  function render3D(c, content, ext) {
    if (!window.THREE || !(ext === 'obj' ? THREE.OBJLoader : THREE.STLLoader)) {
      renderCodeLike(c, content, ext);
      toast('3D 渲染库未加载，已按文本显示', 'err');
      return;
    }
    /* 先解析模型（失败则按文本降级，不挂载 3D 界面） */
    let object = null;
    try {
      if (ext === 'obj') {
        object = new THREE.OBJLoader().parse(content);
        // OBJ 常无法线：补齐顶点法线，保证光感正确
        object.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals(); });
      } else {
        const geo = new THREE.STLLoader().parse(content);
        geo.computeVertexNormals();
        object = new THREE.Mesh(geo, MAT_PRESETS.ceramic.make());
      }
    } catch (e) {
      toast('模型解析失败，已按文本显示', 'err');
      renderCodeLike(c, content, ext);
      return;
    }
    if (!object) { toast('模型为空', 'err'); renderCodeLike(c, content, ext); return; }

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="pv-toolbar" style="border:1px solid var(--border);border-radius:12px 12px 0 0">
        <span class="pv-title">${escapeHtml(cur.name)}</span>
        <span class="muted-sm">拖动旋转 · 双指缩放</span>
      </div>
      <div class="row wrap" style="gap:6px;padding:8px 10px;border:1px solid var(--border);border-top:0;background:var(--surface)">
        <span class="muted-sm">材质</span>
        ${Object.entries(MAT_PRESETS).map(([k, p]) =>
          `<button class="chip${k === 'ceramic' ? ' active' : ''}" data-mat="${k}" style="font-size:12px">${p.label}</button>`).join('')}
      </div>
      <canvas class="pv-canvas" style="border:1px solid var(--border);border-top:0;border-radius:0 0 12px 12px"></canvas>`;
    c.appendChild(wrap);
    const canvas = wrap.querySelector('canvas');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (e) {
      // 无 WebGL 环境（低端机/无头浏览器）：降级为 2D 模型信息卡
      const geoInfo = (() => {
        try {
          if (ext === 'obj') {
            const m = content.match(/^v\s/gm); const f = content.match(/^f\s/gm);
            return `顶点 ${m ? m.length : 0} · 面 ${f ? f.length : 0}`;
          }
          const t = content.match(/facet normal/gi);
          return `三角面 ${t ? t.length : 0}`;
        } catch (e2) { return ''; }
      })();
      wrap.querySelector('.pv-toolbar .muted-sm').textContent = '当前环境不支持 3D 渲染（' + (geoInfo || ext.toUpperCase()) + '）';
      canvas.style.cssText = 'display:block;width:100%;height:30vh;border:1px solid var(--border);border-top:0;border-radius:0 0 12px 12px;background:var(--surface)';
      const ctx2d = canvas.getContext('2d');
      if (ctx2d) {
        canvas.width = canvas.clientWidth * 2; canvas.height = canvas.clientHeight * 2;
        ctx2d.fillStyle = '#f0fdf4'; ctx2d.fillRect(0, 0, canvas.width, canvas.height);
        ctx2d.fillStyle = '#16a34a'; ctx2d.font = '28px sans-serif'; ctx2d.textAlign = 'center';
        ctx2d.fillText('' + ext.toUpperCase() + ' 模型', canvas.width / 2, canvas.height / 2 - 10);
        ctx2d.font = '20px sans-serif'; ctx2d.fillStyle = '#64748b';
        ctx2d.fillText(geoInfo || '模型数据已就绪', canvas.width / 2, canvas.height / 2 + 26);
      }
      return;
    }
    /* ---- 渲染器：sRGB + ACES 电影级色调映射 + 软阴影 ---- */
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const scene = new THREE.Scene();
    /* ---- 环境反射：程序化渐变贴图 → PMREM 预滤波 ---- */
    let envRT = null;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      envRT = pmrem.fromEquirectangular(makeEnvTexture());
      scene.environment = envRT.texture;
      pmrem.dispose();
    } catch (e) { /* 环境反射不可用时退化为纯灯光 */ }
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);

    /* ---- 三点布光 + 环境光 ---- */
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2f4a3c, 0.55));
    const key = new THREE.DirectionalLight(0xfff6e8, 1.25);   // 主光（暖）
    key.position.set(4, 6.5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1; key.shadow.camera.far = 30;
    key.shadow.camera.left = -8; key.shadow.camera.right = 8;
    key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0004; key.shadow.radius = 4;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xcdeedd, 0.4);   // 补光（冷绿）
    fill.position.set(-5, 2.5, 3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xe6fff0, 0.55);   // 轮廓背光
    rim.position.set(-2, 3, -6);
    scene.add(rim);

    // 归一化尺寸并居中
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 4 / maxDim;
    object.scale.setScalar(scale);
    object.position.sub(center.multiplyScalar(scale));
    object.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(object);

    // 接触阴影承接面 + 网格
    const groundY = box.min.y * scale - 0.002;
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ opacity: 0.22, color: 0x0b3d22 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = groundY;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);
    const grid = new THREE.GridHelper(12, 24, 0xbbf7d0, 0xe5e7eb);
    grid.position.y = groundY + 0.001;
    scene.add(grid);

    /* ---- 材质预设切换（实时换材质，不重建场景） ---- */
    const applyPreset = (k) => {
      const mat = MAT_PRESETS[k].make();
      object.traverse(o => { if (o.isMesh) o.material = mat; });
      wrap.querySelectorAll('[data-mat]').forEach(b => b.classList.toggle('active', b.dataset.mat === k));
    };
    applyPreset('ceramic');
    wrap.querySelectorAll('[data-mat]').forEach(b => b.onclick = () => applyPreset(b.dataset.mat));

    // 简易轨道控制
    let theta = Math.PI / 4, phi = Math.PI / 3, radius = 8, auto = true;
    const fit = () => {
      const w = canvas.clientWidth || 320, h = canvas.clientHeight || 300;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    let last = null, pinch = 0;
    canvas.addEventListener('pointerdown', e => { last = { x: e.clientX, y: e.clientY }; auto = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!last) return;
      theta -= (e.clientX - last.x) * 0.008;
      phi = Math.min(Math.PI - 0.05, Math.max(0.05, phi - (e.clientY - last.y) * 0.008));
      last = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', () => { last = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); radius = Math.min(30, Math.max(3, radius + e.deltaY * 0.02)); }, { passive: false });
    let touches = [];
    canvas.addEventListener('touchstart', e => { touches = [...e.touches]; auto = false; }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[0].clientY, e.touches[1].clientX - e.touches[1].clientY);
        if (pinch) radius = Math.min(30, Math.max(3, radius * (pinch / d)));
        pinch = d;
      }
      touches = [...e.touches];
    }, { passive: true });
    canvas.addEventListener('touchend', () => { pinch = 0; touches = []; });

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    (function loop() {
      if (!canvas.isConnected) { ro.disconnect(); if (envRT) envRT.dispose(); return; }
      if (auto) theta += 0.004;
      camera.position.set(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- 页面 ---------- */
  function render(container, opts) {
    opts = opts || {};
    let name = opts.name || '', content = opts.content || '', mime = opts.mime || '', path = opts.path || '';
    if (path) {
      const node = FS.getNode(path);
      if (!node || node.type !== 'file') { toast('文件不存在', 'err'); window.App.pop && window.App.pop(); return; }
      name = node.name; content = node.content || ''; mime = node.mime || '';
    }
    const ext = extOf(name);
    const cat = catOf(ext);
    cur = { name, content, mime, path, cat, mode: '' };

    container.innerHTML = `
      <div class="row" style="gap:8px;align-items:center;margin-bottom:12px">
        <span class="chip active" style="pointer-events:none">${CAT_LABEL[cat] || '文件'}</span>
        <span class="muted-sm" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(name)}${path ? ' · ' + escapeHtml(path) : ''} · ${(content.length / 1024).toFixed(1)} KB</span>
      </div>
      <div id="pv-body"></div>
      <div class="row" style="gap:8px;margin-top:14px">
        <button class="btn gray" data-act="pv-download" style="flex:1">↓ 下载</button>
        <button class="btn gray" data-act="pv-save" style="flex:1">存到本地文件夹</button>
      </div>`;

    const body = container.querySelector('#pv-body');
    try {
      if (cat === 'html') renderHtml(body, content);
      else if (cat === 'svg') renderSvg(body, content);
      else if (ext === 'css' || ext === 'scss' || ext === 'less') renderCss(body, content);
      else if (cat === 'image') renderImage(body, content, mime || 'image/png');
      else if (cat === 'audio') renderMedia(body, content, 'audio');
      else if (cat === 'video') renderMedia(body, content, 'video');
      else if (cat === 'model3d') render3D(body, content, ext);
      else if (cat === 'markdown') renderMarkdown(body, content);
      else if (cat === 'json') renderJson(body, content);
      else if (cat === 'csv') renderCsv(body, content);
      else if (ext === 'js' && isThreeScene(content)) renderRunnable(body, content);
      else renderCodeLike(body, content, cat);
    } catch (e) {
      body.innerHTML = `<div class="card"><div class="muted">预览失败：${escapeHtml(e.message)}</div></div>`;
    }
  }

  function onAction(act, el, container) {
    if (act === 'pv-download') {
      download(cur.name, cur.content, cur.mime);
      toast('已开始下载');
    }
    if (act === 'pv-save') {
      window.FilesPage && window.FilesPage.saveByPath
        ? window.FilesPage.saveByPath(cur.path, cur.name, cur.content, cur.mime)
        : download(cur.name, cur.content, cur.mime);
    }
  }

  window.PreviewPage = { render, onAction };
})();
