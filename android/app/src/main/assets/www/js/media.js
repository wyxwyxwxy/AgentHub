/* ============ 媒体工坊：图片 / 视频生成 ============ */
(function () {
  const { $, $$, toast, sheet, confirmDialog, icons, escapeHtml, Native, download } = window.UI;
  const { Models, Media, SaveDir, getPath } = window.Store;

  let kind = 'image';                 // image | video
  let modelId = null;                 // 当前选中的媒体模型
  let size = '';                      // 图片分辨率 / 视频分辨率
  let ratio = '';                     // 比例
  let duration = 5;                   // 视频秒数
  let runningJobId = null;            // 正在生成的任务
  let abortCtl = null;
  let pollTimer = null;

  const kindName = (k) => k === 'video' ? '视频' : '图片';

  function models() { return kind === 'video' ? Models.video() : Models.image(); }

  function currentModel() { return models().find(m => m.id === modelId) || models()[0] || null; }

  function capsOf(m) { return (m && m.caps) || {}; }

  /* ---------- 渲染 ---------- */
  function render(container) {
    const list = models();
    const m = currentModel();
    if (m && m.id !== modelId) modelId = m.id;
    const caps = capsOf(m);
    const resolutions = caps.resolutions && caps.resolutions.length ? caps.resolutions : (kind === 'video' ? ['720p', '1080p'] : ['1024x1024']);
    const ratios = caps.ratios && caps.ratios.length ? caps.ratios : ['1:1', '16:9', '9:16'];
    const maxSec = caps.maxSeconds || 10;
    if (!size || !resolutions.includes(size)) size = resolutions[0];
    if (!ratio || !ratios.includes(ratio)) ratio = ratios[0];
    if (duration > maxSec) duration = maxSec;

    const jobs = Media.all().filter(j => j.kind === kind);

    container.innerHTML = `
      <div class="seg">
        <button class="seg-btn ${kind === 'image' ? 'active' : ''}" data-act="kind" data-kind="image"> 图片</button>
        <button class="seg-btn ${kind === 'video' ? 'active' : ''}" data-act="kind" data-kind="video"> 视频</button>
      </div>

      ${list.length === 0 ? `
        <div class="empty">
          <div class="emo">${kind === 'video' ? icons.video : icons.image}</div>
          <h3>还没有${kindName(kind)}生成模型</h3>
          <p>请先在「设置 → 模型配置」中添加${kindName(kind)}类模型<br>支持 OpenRouter、通义万相、可灵、智谱等平台预设</p>
          <button class="btn primary mt12" data-act="goto-models">去添加模型</button>
        </div>
      ` : `
        <div class="card">
          <div class="card-title"> 选择${kindName(kind)}模型</div>
          <div class="row wrap" style="gap:8px">
            ${list.map(x => `<button class="chip ${x.id === (m && m.id) ? 'active' : ''}" data-act="pick-model" data-id="${x.id}">${escapeHtml(x.name)}</button>`).join('')}
          </div>
          ${m ? `<div class="hint mt8">模型：${escapeHtml(m.model)} · 地址：${escapeHtml(m.baseUrl || '默认')}</div>` : ''}
        </div>

        <div class="card mt12">
          <div class="card-title">画面描述（Prompt）</div>
          <textarea class="textarea" id="media-prompt" rows="3" placeholder="${kind === 'video' ? '描述你想生成的视频画面，例如：一只橘猫在夕阳下的草地上奔跑，电影感光线' : '描述你想生成的图片，例如：一片洁白的 seedling 在晨露中闪光，微距摄影'}">${escapeHtml(lastPrompt)}</textarea>
        </div>

        <div class="card mt12">
          <div class="card-title">生成参数</div>
          <div class="field">
            <label>${kind === 'video' ? '分辨率' : '尺寸 / 分辨率'}</label>
            <div class="row wrap" style="gap:8px">
              ${resolutions.map(r => `<button class="chip ${size === r ? 'active' : ''}" data-act="pick-size" data-v="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label>比例</label>
            <div class="row wrap" style="gap:8px">
              ${ratios.map(r => `<button class="chip ${ratio === r ? 'active' : ''}" data-act="pick-ratio" data-v="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join('')}
            </div>
          </div>
          ${kind === 'video' ? `
            <div class="field">
              <label>时长：<b id="dur-label">${duration}</b> 秒（最长 ${maxSec} 秒）</label>
              <input type="range" id="media-dur" min="1" max="${maxSec}" value="${duration}" step="1" style="width:100%">
            </div>
          ` : ''}
        </div>

        <button class="btn primary block mt12" data-act="generate" ${runningJobId ? 'disabled' : ''}>
          ${runningJobId ? '生成中…' : ' 开始生成'}
        </button>
      `}

      <div id="media-progress"></div>

      ${jobs.length ? `
        <div class="card-title mt16"> ${kindName(kind)}历史（${jobs.length}）</div>
        <div class="media-grid">
          ${jobs.map(jobCell).join('')}
        </div>
      ` : ''}
    `;

    // 时长滑块
    const dur = container.querySelector('#media-dur');
    if (dur) dur.oninput = () => {
      duration = parseInt(dur.value, 10);
      container.querySelector('#dur-label').textContent = duration;
    };
    // 恢复进行中任务的轮询 UI
    if (runningJobId) {
      const job = Media.get(runningJobId);
      if (job && job.status === 'running') showProgress(job);
    }
  }

  let lastPrompt = '';

  function jobCell(j) {
    const time = new Date(j.createdAt).toLocaleString('zh-CN', { hour12: false });
    if (j.status === 'running') {
      return `<div class="media-cell" data-id="${j.id}">
        <div class="gen-pulse"><div class="gen-spinner"></div><div>${escapeHtml(j.progress || '生成中…')}</div></div>
      </div>`;
    }
    if (j.status === 'failed') {
      return `<div class="media-cell" data-id="${j.id}" style="aspect-ratio:auto;padding:10px;display:flex;flex-direction:column;justify-content:center">
        <div style="font-size:20px">!</div>
        <div class="muted-sm" style="margin:6px 0">${escapeHtml((j.error || '生成失败').slice(0, 80))}</div>
        <div class="row" style="gap:6px">
          <button class="btn ghost sm" data-act="retry" data-id="${j.id}">重试</button>
          <button class="btn danger sm" data-act="del-job" data-id="${j.id}">删除</button>
        </div>
      </div>`;
    }
    const media = j.kind === 'video'
      ? `<video src="${escapeHtml(j.url)}" controls playsinline preload="metadata"></video>`
      : `<img src="${escapeHtml(j.url)}" alt="" loading="lazy">`;
    return `<div class="media-cell" data-id="${j.id}">
      ${media}
      <button class="mc-save" data-act="save-job" data-id="${j.id}">${icons.save} 保存</button>
      <button class="mc-del" data-act="del-job" data-id="${j.id}">×</button>
    </div>`;
  }

  /* ---------- 进度显示 ---------- */
  function showProgress(job) {
    const box = $('#media-progress');
    if (!box) return;
    const elapsed = job.elapsed || 0;
    box.innerHTML = `
      <div class="card mt12">
        <div class="gen-pulse">
          <div class="gen-spinner"></div>
          <div>${escapeHtml(job.progress || '任务已提交，等待处理…')}</div>
          <div class="muted-sm">已用时 ${Math.floor(elapsed / 1000)} 秒 · ${escapeHtml(job.modelName || '')}</div>
          <button class="btn gray sm mt8" data-act="cancel-gen">取消生成</button>
        </div>
      </div>`;
  }

  /* ---------- 生成 ---------- */
  async function generate(container) {
    const m = currentModel();
    if (!m) { toast('请先选择模型', 'err'); return; }
    const promptEl = container.querySelector('#media-prompt');
    const prompt = (promptEl ? promptEl.value : '').trim();
    if (!prompt) { toast('请先输入画面描述', 'err'); return; }
    lastPrompt = prompt;

    const params = { prompt, ratio, n: kind === 'image' ? 1 : undefined };
    if (kind === 'video') { params.resolution = size; params.duration = duration; }
    else params.size = size;

    const job = Media.add({
      kind, modelId: m.id, modelName: m.name, prompt, params: { size, ratio, duration: kind === 'video' ? duration : undefined },
      status: 'running', progress: '正在提交任务…', elapsed: 0
    });
    runningJobId = job.id;
    abortCtl = new AbortController();
    render(container);
    showProgress(job);

    const t0 = Date.now();
    pollTimer = setInterval(() => {
      const j = Media.get(job.id);
      if (j && j.status === 'running') {
        Media.update(job.id, { elapsed: Date.now() - t0 });
        showProgress(Media.get(job.id));
      }
    }, 1000);

    try {
      const r = await window.API.generateMedia(m, params, {
        signal: abortCtl.signal,
        onPoll: (status, elapsed) => {
          Media.update(job.id, { progress: '状态：' + status, elapsed });
          showProgress(Media.get(job.id));
        }
      });
      clearInterval(pollTimer); pollTimer = null;
      Media.update(job.id, { status: 'done', url: r.url, elapsed: r.elapsed, progress: '' });
      runningJobId = null;
      toast('✓ 生成完成', 'ok');
      Native.vibrate(30);
      render(container);
    } catch (e) {
      clearInterval(pollTimer); pollTimer = null;
      if (e && e.name === 'AbortError') {
        Media.update(job.id, { status: 'failed', error: '已取消生成' });
        toast('已取消生成');
      } else {
        Media.update(job.id, { status: 'failed', error: e.message || String(e) });
        toast('✗ ' + (e.message || '生成失败'), 'err');
      }
      runningJobId = null;
      render(container);
    }
  }

  /* ---------- 保存媒体到本地 ---------- */
  async function saveJob(job) {
    const ext = job.kind === 'video' ? 'mp4' : 'png';
    const mime = job.kind === 'video' ? 'video/mp4' : 'image/png';
    const name = 'agenthub-' + new Date(job.createdAt).toISOString().slice(0, 10) + '-' + job.id.slice(-6) + '.' + ext;
    let base64 = null;
    if (/^data:/.test(job.url)) {
      base64 = job.url.split(',')[1];
    } else {
      toast('正在下载媒体文件…');
      try {
        const res = await fetch(job.url);
        const blob = await res.blob();
        base64 = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result).split(',')[1]);
          fr.onerror = () => reject(new Error('读取失败'));
          fr.readAsDataURL(blob);
        });
      } catch (e) {
        // 跨域等导致无法直接下载时，用系统打开链接
        const r = await Native.openUrl(job.url);
        if (r && r.__unsupported) window.open(job.url, '_blank');
        toast('已在新窗口打开，可长按保存');
        return;
      }
    }
    const r = await Native.saveBinaryToFolder(name, mime, base64);
    if (r && r.__unsupported) {
      // Web 预览环境：直接触发下载
      const bin = atob(base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      download(name, arr, mime);
      toast('已保存到浏览器下载目录');
      return;
    }
    if (r && r.ok) toast('✓ 已保存到本地文件夹');
    else toast('✗ 保存失败：' + ((r && r.__error) || '未知错误'), 'err');
  }

  /* ---------- 事件 ---------- */
  async function onAction(act, el, container) {
    if (act === 'kind') {
      kind = el.dataset.kind;
      modelId = null; size = ''; ratio = '';
      render(container);
      return;
    }
    if (act === 'goto-models') { window.App.push('models'); return; }
    if (act === 'pick-model') { modelId = el.dataset.id; size = ''; ratio = ''; render(container); return; }
    if (act === 'pick-size') { size = el.dataset.v; render(container); return; }
    if (act === 'pick-ratio') { ratio = el.dataset.v; render(container); return; }
    if (act === 'generate') { await generate(container); return; }
    if (act === 'cancel-gen') {
      if (abortCtl) abortCtl.abort();
      return;
    }
    if (act === 'save-job') {
      const job = Media.get(el.dataset.id);
      if (job) await saveJob(job);
      return;
    }
    if (act === 'del-job') {
      const job = Media.get(el.dataset.id);
      const ok = await confirmDialog({ title: '删除记录', body: '删除这条生成记录？', okText: '删除', danger: true });
      if (ok) { Media.remove(el.dataset.id); render(container); }
      return;
    }
    if (act === 'retry') {
      const job = Media.get(el.dataset.id);
      if (!job) return;
      Media.remove(job.id);
      // 用原参数重新生成
      const promptEl = container.querySelector('#media-prompt');
      if (promptEl) promptEl.value = job.prompt;
      if (job.params) {
        if (job.params.size) size = job.params.size;
        if (job.params.ratio) ratio = job.params.ratio;
        if (job.params.duration) duration = job.params.duration;
      }
      render(container);
      setTimeout(() => generate(container), 50);
      return;
    }
  }

  window.MediaPage = { render, onAction };
})();
