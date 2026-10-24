/* ============ 3D 工坊（v2.2） ============
 * 汇总虚拟磁盘里的 3D 资产（.obj / .stl / Three.js 场景 .js），
 * 点击即用万能预览器打开（可旋转缩放的实时预览）。
 */
(function () {
  const { $, $$, toast, escapeHtml, icons } = window.UI;
  const { FS } = window.Store;

  const extOf = (n) => (String(n || '').match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  const MODEL_EXTS = ['obj', 'stl'];

  /** 递归扫描全盘，收集 3D 资产 */
  function scan3D() {
    const out = [];
    (function walk(node, path) {
      if (!node) return;
      if (node.type === 'dir') {
        (node.children || []).forEach(ch => walk(ch, (path === '/' ? '' : path) + '/' + ch.name));
      } else if (node.type === 'file') {
        const ext = extOf(node.name);
        if (MODEL_EXTS.includes(ext) || (ext === 'js' && /THREE\.|new THREE|WebGLRenderer/.test(node.content || ''))) {
          out.push({ path, name: node.name, ext, size: (node.content || '').length, at: node.updatedAt || node.createdAt || 0 });
        }
      }
    })(FS.root(), '/');
    return out.sort((a, b) => b.at - a.at);
  }

  function render(container) {
    const items = scan3D();
    container.innerHTML = `
      ${items.length ? `
        <div class="muted" style="padding:4px 2px 12px">共 ${items.length} 个 3D 资产，点击即可实时预览（环境反射 + 软阴影，可切换陶瓷/金属/玻璃/哑光材质，拖动旋转、双指缩放）。</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${items.map(it => `
            <button class="list-item" data-act="open" data-path="${escapeHtml(it.path)}">
              <div class="li-icon" style="background:var(--green-50);color:var(--green)">${icons.cube}</div>
              <div class="li-main">
                <div class="li-title">${escapeHtml(it.name)}</div>
                <div class="li-sub">${escapeHtml(it.path)} · ${(it.size / 1024).toFixed(1)} KB</div>
              </div>
              <div class="muted-sm">${it.ext === 'js' ? '场景' : it.ext.toUpperCase()}</div>
            </button>`).join('')}
        </div>` : `
        <div class="empty">
          <div style="margin-bottom:10px">${icons.cube}</div>
          <h3>还没有 3D 模型</h3>
          <p>对主智能体说：<br><b>「画一个 3D 机器人，保存成 obj 文件」</b><br>或<br><b>「写一个旋转立方体的 Three.js 场景」</b><br>智能体会自动创造「3D 建模师」子智能体来完成</p>
          <button class="btn primary mt12" data-act="goto-chat">去对话</button>
        </div>`}`;
  }

  function onAction(act, el) {
    if (act === 'open') window.App.push('preview', { path: el.dataset.path });
    if (act === 'goto-chat') window.App.go('chat');
  }

  window.ThreeDPage = { render, onAction };
})();
