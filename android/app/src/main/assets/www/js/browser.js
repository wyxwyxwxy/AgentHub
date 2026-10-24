/* ============ 内置浏览器：SPA 控制台 + Agent 远程操控桥 ============ */
(function () {
  const { $, $$, toast, sheet, icons, escapeHtml, Native } = window.UI;
  const { BrowserState } = window.Store;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const cmdSeq = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* 搜索引擎 URL（多引擎回退） */
  const ENGINES = {
    bing: (q) => 'https://www.bing.com/search?q=' + encodeURIComponent(q),
    duckduckgo: (q) => 'https://duckduckgo.com/html/?q=' + encodeURIComponent(q),
    baidu: (q) => 'https://www.baidu.com/s?wd=' + encodeURIComponent(q)
  };

  /* ---------- 浏览器自动化桥 ---------- */
  const Browser = {
    available() { return Native.available; },

    /** 打开（或切换）内置浏览器 */
    async open(url) {
      if (!Native.available) { window.open(url, '_blank'); BrowserState.set({ url }); return { ok: true, web: true }; }
      const r = await Native.openBrowser(url);
      BrowserState.set({ url, ready: true });
      return r;
    },

    /** 执行自动化命令：navigate / search / extract / fill / click / wait / state */
    async cmd(type, params = {}, timeout) {
      params = params || {};
      if (!Native.available) return { ok: false, __unsupported: true, error: 'Web 预览环境无原生浏览器' };
      const id = cmdSeq();
      const cmd = Object.assign({ id, type }, params);
      const r = await Native.browserCmd(JSON.stringify(cmd));
      if (r && r.ok === false) throw new Error(r.__error || '命令投递失败');
      const limit = timeout || (type === 'extract' ? 45000 : type === 'navigate' || type === 'search' ? 60000 : 30000);
      const t0 = Date.now();
      for (;;) {
        await sleep(600);
        const res = await Native.autoResult(id);
        if (res && !res.__pending) return res;
        if (Date.now() - t0 > limit) throw new Error('浏览器响应超时（' + Math.round(limit / 1000) + 's）');
      }
    },

    /** 等待搜索结果页就绪（标题出现且非空） */
    async waitReady(timeout = 7000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        try {
          const r = await this.cmd('state', {}, 12000);
          if (r && r.ok && (r.title || '').trim()) return true;
        } catch (e) { /* 继续等 */ }
        await sleep(700);
      }
      return false;
    },

    /**
     * 搜索并提取结果摘要（多引擎回退：Bing → DuckDuckGo → 百度；
     * 全部失败时走 Web 代理兜底，保证"搜索一定能用"）
     */
    async search(query, max, opts = {}) {
      const engines = opts.engines || ['bing', 'duckduckgo', 'baidu'];
      if (!Native.available) return (await webSearch(query, max)) || { ok: false, error: 'Web 预览环境搜索失败' };
      let lastErr = null;
      for (const engine of engines) {
        try {
          await this.cmd('search', { query, engine });
          await this.waitReady();
          const r = await this.cmd('extract', { selector: 'body', max: max || 4000 }, 45000);
          if (r && r.ok && (r.text || '').replace(/\s/g, '').length > 40) return r;
          lastErr = new Error((r && r.error) || '结果为空');
        } catch (e) { lastErr = e; }
      }
      const web = await webSearch(query, max);
      if (web) return web;
      throw lastErr || new Error('所有搜索引擎均失败');
    }
  };

  /** Web 预览环境兜底：经公共阅读代理抓取搜索结果文本 */
  async function webSearch(query, max) {
    const q = encodeURIComponent(query);
    const tries = [
      'https://r.jina.ai/https://www.bing.com/search?q=' + q,
      'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://duckduckgo.com/html/?q=' + q)
    ];
    for (const u of tries) {
      try {
        const resp = await fetch(u);
        if (!resp.ok) continue;
        const text = (await resp.text() || '').replace(/\s+\n/g, '\n').slice(0, max || 4000);
        if (text.replace(/\s/g, '').length > 40) {
          return { ok: true, title: '搜索：' + query, url: u, text, links: [], __web: true };
        }
      } catch (e) { /* 尝试下一个源 */ }
    }
    return null;
  }
  window.Browser = Browser;

  /* ---------- 页面渲染 ---------- */
  let urlInput = '';
  let logLines = [];
  let busy = false;

  function render(container) {
    const st = BrowserState.get();
    container.innerHTML = `
      <div class="browser-bar">
        <input class="input" id="br-url" placeholder="输入网址或搜索关键词" value="${escapeHtml(urlInput || st.url === 'about:blank' ? '' : st.url || '')}">
        <button class="btn primary sm" data-act="br-open" ${busy ? 'disabled' : ''}>打开</button>
      </div>
      <div class="row wrap" style="gap:8px;padding:10px 12px 0">
        <button class="chip" data-act="br-search" ${busy ? 'disabled' : ''}> 搜索</button>
        <button class="chip" data-act="br-extract" ${busy ? 'disabled' : ''}>提取文本</button>
        <button class="chip" data-act="br-state" ${busy ? 'disabled' : ''}>刷新状态</button>
        <button class="chip" data-act="br-fill">填表演示</button>
      </div>
      <div style="padding:10px 12px 0">
        <div class="kv"><span class="k">当前网址</span><span class="v" id="br-cur">${escapeHtml(st.url || '—')}</span></div>
        <div class="kv"><span class="k">页面标题</span><span class="v" id="br-title">${escapeHtml(st.title || '—')}</span></div>
        <div class="kv"><span class="k">浏览器状态</span><span class="v" id="br-status">${busy ? '执行中…' : (Browser.available() ? '原生浏览器就绪' : 'Web 预览（受限）')}</span></div>
      </div>
      <div style="padding:10px 12px 20px">
        <div class="card-title"> 操作日志</div>
        <div class="log-list" id="br-log">${logLines.map(logLineHtml).join('') || '<div class="muted-sm">暂无操作。Agent 在对话中输出 [[ACTION:browser.search|关键词]] 也会驱动这里。</div>'}</div>
        <div id="br-result"></div>
      </div>`;
    const input = container.querySelector('#br-url');
    input.onkeydown = (e) => { if (e.key === 'Enter') doOpen(container); };
  }

  function logLineHtml(l) {
    return `<div class="${l.ok ? 'ok' : 'bad'}">${new Date(l.at).toLocaleTimeString('zh-CN', { hour12: false })} ${escapeHtml(l.msg)}</div>`;
  }

  function log(container, msg, ok) {
    logLines.unshift({ at: Date.now(), msg, ok: ok !== false });
    if (logLines.length > 40) logLines.length = 40;
    const box = container.querySelector('#br-log');
    if (box) box.innerHTML = logLines.map(logLineHtml).join('');
  }

  function setStatus(container, text) {
    const el = container.querySelector('#br-status');
    if (el) el.textContent = text;
  }

  function normalizeUrl(input) {
    const s = (input || '').trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) return 'https://' + s;
    return ENGINES.bing(s);
  }

  async function doOpen(container) {
    const input = container.querySelector('#br-url');
    const url = normalizeUrl(input.value);
    if (!url) { toast('请输入网址或关键词', 'err'); return; }
    urlInput = input.value.trim();
    busy = true; render(container); setStatus(container, '正在打开…');
    log(container, '打开 ' + url);
    try {
      await Browser.open(url);
      log(container, '✓ 已打开', true);
    } catch (e) {
      log(container, '✗ ' + (e.message || e), false);
    }
    busy = false; render(container);
  }

  async function doSearch(container) {
    const input = container.querySelector('#br-url');
    const q = (input.value || '').trim();
    if (!q) { toast('先输入搜索关键词', 'err'); return; }
    busy = true; render(container); setStatus(container, '搜索中…');
    log(container, '搜索：' + q);
    try {
      const r = await Browser.search(q, 4000);
      if (r && r.ok) {
        BrowserState.set({ url: r.url, title: r.title });
        log(container, '✓ 已获取搜索结果（' + (r.text || '').length + ' 字）', true);
        showResult(container, r);
      } else {
        log(container, '!' + ((r && r.error) || '未能提取结果'), false);
      }
    } catch (e) {
      log(container, '✗ ' + (e.message || e), false);
    }
    busy = false; render(container);
  }

  async function doExtract(container) {
    busy = true; render(container); setStatus(container, '提取中…');
    log(container, '提取页面文本');
    try {
      const r = await Browser.cmd('extract', { max: 6000 }, 45000);
      if (r && r.ok) {
        BrowserState.set({ url: r.url, title: r.title });
        log(container, '✓ 提取成功（' + (r.text || '').length + ' 字）', true);
        showResult(container, r);
      } else if (r && r.__unsupported) {
        log(container, '!Web 预览环境：请使用系统浏览器打开后手动复制', false);
        toast('当前为 Web 预览环境，原生浏览器不可用', 'err');
      } else {
        log(container, '!' + ((r && r.error) || '提取失败'), false);
      }
    } catch (e) {
      log(container, '✗ ' + (e.message || e), false);
    }
    busy = false; render(container);
  }

  async function doState(container) {
    try {
      const r = await Browser.cmd('state', {}, 15000);
      if (r && r.ok) {
        BrowserState.set({ url: r.url, title: r.title });
        log(container, '✓ ' + (r.title || r.url), true);
      }
    } catch (e) { log(container, '✗ ' + (e.message || e), false); }
    render(container);
  }

  function showResult(container, r) {
    const box = container.querySelector('#br-result');
    if (!box) return;
    const links = (r.links || []).slice(0, 8);
    box.innerHTML = `
      <div class="card mt12">
        <div class="card-title">${escapeHtml(r.title || '页面内容')}</div>
        <div class="muted-sm" style="word-break:break-all">${escapeHtml(r.url || '')}</div>
        <div style="font-size:12.5px;line-height:1.6;max-height:220px;overflow:auto;margin-top:8px;white-space:pre-wrap">${escapeHtml((r.text || '').slice(0, 1500))}</div>
        ${links.length ? `<div class="card-title mt12">相关链接</div>
          <div class="list-clean">${links.map(l => `<div class="muted-sm" style="padding:3px 0">· ${escapeHtml(l.t)}</div>`).join('')}</div>` : ''}
        <button class="btn ghost sm mt12" data-act="br-copy">复制全文</button>
      </div>`;
    box.querySelector('[data-act="br-copy"]').onclick = () => {
      navigator.clipboard && navigator.clipboard.writeText(r.text || '');
      toast('已复制');
    };
  }

  async function onAction(act, el, container) {
    if (act === 'br-open') return doOpen(container);
    if (act === 'br-search') return doSearch(container);
    if (act === 'br-extract') return doExtract(container);
    if (act === 'br-state') return doState(container);
    if (act === 'br-fill') {
      toast('填表演示：在对话框输入选择器即可（Agent 会自动填表）', 'ok');
      sheet({
        title: '页面填表（演示）',
        body: `<div class="field"><label>CSS 选择器</label><input class="input" id="f-sel" placeholder="例如 #q 或 input[name=wd]"></div>
               <div class="field"><label>填入内容</label><input class="input" id="f-val" placeholder="要输入的文字"></div>`,
        actions: [
          { text: '取消', cls: 'gray' },
          {
            text: '填入', onClick: async (mask, close) => {
              const sel = mask.querySelector('#f-sel').value.trim();
              const val = mask.querySelector('#f-val').value;
              if (!sel) { toast('请填写选择器', 'err'); return; }
              busy = true; render(container);
              log(container, '填表：' + sel);
              try {
                const r = await Browser.cmd('fill', { selector: sel, value: val });
                log(container, r && r.ok ? '✓ 已填入' : '!' + ((r && r.error) || '失败'), !!(r && r.ok));
              } catch (e) { log(container, '✗ ' + (e.message || e), false); }
              busy = false; render(container);
              close(null);
            }
          }
        ]
      });
      return;
    }
  }

  window.BrowserPage = { render, onAction, Browser };
})();
