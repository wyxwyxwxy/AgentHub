/* ============ 模型配置页（v2：对话 / 图片 / 视频三类模型） ============ */
(function () {
  const { $, $$, toast, sheet, confirmDialog, escapeHtml, maskKey, icons } = window.UI;
  const { Models } = window.Store;

  /* ---------- 预设平台 ---------- */
  const CHAT_PRESETS = [
    { name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', color: '#10a37f', logo: 'O' },
    { name: 'Claude', type: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5-20250929', color: '#d97757', logo: 'C' },
    { name: 'DeepSeek', type: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', color: '#4d6bfe', logo: 'D' },
    { name: '通义千问', type: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', color: '#615ced', logo: 'Q' },
    { name: 'Kimi', type: 'openai', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2-0905-preview', color: '#111827', logo: 'K' },
    { name: '智谱 GLM', type: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus', color: '#3859ff', logo: 'G' },
    { name: 'OpenRouter', type: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', color: '#8b5cf6', logo: 'R' },
    { name: '硅基流动', type: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct', color: '#0ea5e9', logo: 'S' },
    { name: 'xAI Grok', type: 'openai', baseUrl: 'https://api.x.ai/v1', model: 'grok-3-mini', color: '#111827', logo: 'X' },
    { name: 'Groq', type: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', color: '#f55036', logo: 'G' },
    { name: 'Together AI', type: 'openai', baseUrl: 'https://api.together.xyz/v1', model: 'Qwen/Qwen2.5-72B-Instruct-Turbo', color: '#0f62fe', logo: 'T' },
    { name: '百度千帆', type: 'openai', baseUrl: 'https://qianfan.baidubce.com/v2', model: 'ernie-4.5-8k-preview', color: '#2932e1', logo: 'B' },
    { name: '腾讯混元', type: 'openai', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', model: 'hunyuan-turbos-latest', color: '#0052d9', logo: 'H' },
    { name: '讯飞星火', type: 'openai', baseUrl: 'https://spark-api-open.xf-yun.com/v1', model: '4.0Ultra', color: '#0e6ffd', logo: 'F' },
    { name: 'MiniMax', type: 'openai', baseUrl: 'https://api.minimax.chat/v1', model: 'MiniMax-Text-01', color: '#e23c46', logo: 'M' },
    { name: '火山方舟', type: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-1.5-pro-32k', color: '#1664ff', logo: 'D' },
    { name: 'Ollama 本地', type: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b', color: '#374151', logo: 'L' }
  ];

  const IMAGE_PRESETS = [
    { name: 'OpenAI 图片', kind: 'image', baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-1', color: '#10a37f', logo: 'O',
      resultPath: 'data[0].b64_json', pollInterval: 4, timeout: 300,
      caps: { resolutions: ['1024x1024', '1024x1536', '1536x1024'], ratios: ['1:1', '2:3', '3:2'] } },
    { name: '智谱 CogView', kind: 'image', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'cogview-4', color: '#3859ff', logo: 'G',
      resultPath: 'data[0].url', pollInterval: 4, timeout: 300,
      caps: { resolutions: ['1024x1024'], ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'] } },
    { name: '通义万相', kind: 'image', baseUrl: 'https://dashscope.aliyuncs.com/api/v1', model: 'wanx2.1-t2i-turbo', color: '#615ced', logo: 'Q',
      submitPath: '/services/aigc/text2image/image-synthesis', pollPath: '/tasks/{id}', idPath: 'output.task_id',
      statusPath: 'output.task_status', okStatus: 'SUCCEEDED', failStatus: 'FAILED', resultPath: 'output.results[0].url',
      pollInterval: 5, timeout: 600,
      caps: { resolutions: ['720p', '1080p'], ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'] } },
    { name: '硅基流动图片', kind: 'image', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen-Image', color: '#0ea5e9', logo: 'S',
      resultPath: 'images[0].url', pollInterval: 4, timeout: 300,
      caps: { resolutions: ['1024x1024'], ratios: ['1:1', '16:9', '9:16'] } },
    { name: 'Stability AI', kind: 'image', baseUrl: 'https://api.stability.ai/v2beta', model: 'stable-image-core', color: '#7c3aed', logo: 'S',
      submitPath: '/stable-image/generate/core', resultPath: 'image', pollInterval: 4, timeout: 300,
      caps: { resolutions: ['1024x1024', '1152x896', '896x1152'], ratios: ['1:1', '9:7', '7:9'] } },
    { name: '即梦 AI', kind: 'image', baseUrl: 'https://visual.volcengineapi.com', model: 'jimeng_t2i', color: '#1664ff', logo: 'J',
      submitPath: '/images/generations', pollPath: '/images/generations/{id}', idPath: 'data.id',
      statusPath: 'data.status', okStatus: 'succeeded', failStatus: 'failed', resultPath: 'data.image_urls[0]',
      pollInterval: 5, timeout: 600,
      caps: { resolutions: ['720p', '1080p', '2k', '4k'], ratios: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'] } },
    { name: 'Agnes 图片', kind: 'image', baseUrl: 'https://api.agnes.ai/v1', model: 'agnes-image-1', color: '#ec4899', logo: 'A',
      resultPath: 'data[0].url', pollInterval: 4, timeout: 300,
      caps: { resolutions: ['1024x1024', '2048x2048'], ratios: ['1:1', '16:9', '9:16'] } }
  ];

  const VIDEO_PRESETS = [
    { name: '可灵 Kling', kind: 'video', baseUrl: 'https://api-singapore.klingai.com/v1', model: 'kling-v2.1', color: '#0ea5e9', logo: 'K',
      submitPath: '/videos/text2video', pollPath: '/videos/text2video/{id}', idPath: 'data.task_id',
      statusPath: 'data.task_status', okStatus: 'succeed', failStatus: 'failed', resultPath: 'data.task_result.videos[0].url',
      pollInterval: 8, timeout: 900,
      caps: { resolutions: ['720p', '1080p'], ratios: ['16:9', '9:16', '1:1'], maxSeconds: 10 } },
    { name: '智谱 CogVideoX', kind: 'video', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'cogvideox-3', color: '#3859ff', logo: 'G',
      submitPath: '/videos/generations', pollPath: '/videos/generations/{id}', idPath: 'id',
      statusPath: 'status', okStatus: 'SUCCESS', failStatus: 'FAIL', resultPath: 'video_result[0].url',
      pollInterval: 8, timeout: 900,
      caps: { resolutions: ['720p', '1080p'], ratios: ['16:9', '9:16', '1:1', '4:3'], maxSeconds: 6 } },
    { name: '通义万相视频', kind: 'video', baseUrl: 'https://dashscope.aliyuncs.com/api/v1', model: 'wanx2.1-t2v-turbo', color: '#615ced', logo: 'Q',
      submitPath: '/services/aigc/video-generation/video-synthesis', pollPath: '/tasks/{id}', idPath: 'output.task_id',
      statusPath: 'output.task_status', okStatus: 'SUCCEEDED', failStatus: 'FAILED', resultPath: 'output.video_url',
      pollInterval: 8, timeout: 900,
      caps: { resolutions: ['480p', '720p', '1080p'], ratios: ['16:9', '9:16', '1:1'], maxSeconds: 5 } },
    { name: 'MiniMax 视频', kind: 'video', baseUrl: 'https://api.minimax.chat/v1', model: 'MiniMax-Hailuo-02', color: '#e23c46', logo: 'M',
      submitPath: '/video_generation', pollPath: '/video_generation/{id}', idPath: 'task_id',
      statusPath: 'status', okStatus: 'Success', failStatus: 'Fail', resultPath: 'file.url',
      pollInterval: 8, timeout: 900,
      caps: { resolutions: ['720p', '1080p'], ratios: ['16:9', '9:16', '1:1'], maxSeconds: 10 } },
    { name: '火山方舟视频', kind: 'video', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedance-1.0', color: '#1664ff', logo: 'D',
      submitPath: '/contents/generations/tasks', pollPath: '/contents/generations/tasks/{id}', idPath: 'id',
      statusPath: 'status', okStatus: 'succeeded', failStatus: 'failed', resultPath: 'content.video_url',
      pollInterval: 8, timeout: 900,
      caps: { resolutions: ['480p', '720p', '1080p'], ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], maxSeconds: 12 } },
    { name: 'Runway', kind: 'video', baseUrl: 'https://api.dev.runwayml.com/v1', model: 'gen4_turbo', color: '#111827', logo: 'R',
      submitPath: '/text_to_video', pollPath: '/tasks/{id}', idPath: 'id',
      statusPath: 'status', okStatus: 'SUCCEEDED', failStatus: 'FAILED', resultPath: 'output[0]',
      pollInterval: 8, timeout: 900,
      caps: { resolutions: ['720p'], ratios: ['16:9', '9:16', '1:1', '4:3'], maxSeconds: 10 } },
    { name: 'Luma', kind: 'video', baseUrl: 'https://api.lumalabs.ai/dream-machine/v1', model: 'ray-2', color: '#f59e0b', logo: 'L',
      submitPath: '/generations', pollPath: '/generations/{id}', idPath: 'id',
      statusPath: 'state', okStatus: 'completed', failStatus: 'failed', resultPath: 'assets.video',
      pollInterval: 8, timeout: 900,
      caps: { resolutions: ['540p', '720p', '1080p'], ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], maxSeconds: 10 } },
    { name: 'Agnes 视频', kind: 'video', baseUrl: 'https://api.agnes.ai/v1', model: 'agnes-video-1', color: '#ec4899', logo: 'A',
      submitPath: '/videos/generations', pollPath: '/videos/generations/{id}', idPath: 'data.id',
      statusPath: 'data.status', okStatus: 'succeeded', failStatus: 'failed', resultPath: 'data.url',
      pollInterval: 8, timeout: 900,
      caps: { resolutions: ['720p', '1080p'], ratios: ['16:9', '9:16', '1:1'], maxSeconds: 10 } }
  ];

  const PRESETS = [].concat(CHAT_PRESETS, IMAGE_PRESETS, VIDEO_PRESETS);
  const kindName = (k) => k === 'video' ? '视频' : k === 'image' ? '图片' : '对话';
  const kindCls = (k) => k === 'video' ? 'purple' : k === 'image' ? 'blue' : 'green';
  const typeName = (t) => t === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容';
  const presetOf = (m) => PRESETS.find(p => p.name === m.name) || { color: '#16a34a', logo: 'A' };

  let curKind = 'chat'; // 当前页签

  function render(container) {
    const all = Models.all();
    const list = curKind === 'all' ? all : Models.ofKind(curKind);
    container.innerHTML = `
      <div class="page" data-page="models">
        <div class="page-header">
          <h1>模型配置<span class="sub">自定义接口 · 仅保存在本机</span></h1>
          <button class="icon-btn primary" data-act="add-model">${icons.plus}</button>
        </div>
        <div class="page-body">
          <div class="seg tabs3">
            <button class="seg-btn ${curKind === 'chat' ? 'active' : ''}" data-act="kind" data-kind="chat"> 对话${all.filter(m => (m.kind || 'chat') === 'chat').length ? ' · ' + all.filter(m => (m.kind || 'chat') === 'chat').length : ''}</button>
            <button class="seg-btn ${curKind === 'image' ? 'active' : ''}" data-act="kind" data-kind="image"> 图片${all.filter(m => m.kind === 'image').length ? ' · ' + all.filter(m => m.kind === 'image').length : ''}</button>
            <button class="seg-btn ${curKind === 'video' ? 'active' : ''}" data-act="kind" data-kind="video"> 视频${all.filter(m => m.kind === 'video').length ? ' · ' + all.filter(m => m.kind === 'video').length : ''}</button>
          </div>

          ${list.length === 0 ? `
            <div class="empty">
              <div class="emo">${curKind === 'video' ? icons.video : curKind === 'image' ? icons.image : icons.models}</div>
              <h3>${curKind === 'chat' ? '添加你的第一个对话模型' : curKind === 'image' ? '添加图片生成模型' : '添加视频生成模型'}</h3>
              <p>${curKind === 'chat'
                ? '输入 API 密钥、调用地址与模型名称即可对话<br>支持 OpenAI 兼容与 Anthropic 两种接口'
                : '选择平台预设或手动配置提交/轮询协议<br>生成参数（分辨率、比例、时长）在「媒体工坊」使用'}</p>
            </div>
            <div class="card">
              <div class="card-title"> 快速预设（点击填入）</div>
              <div class="row wrap" style="gap:8px">
                ${(curKind === 'chat' ? CHAT_PRESETS : curKind === 'image' ? IMAGE_PRESETS : VIDEO_PRESETS).map((p, i) => `<button class="chip" data-act="preset" data-name="${escapeHtml(p.name)}"><span class="dot" style="background:${p.color}"></span>${p.name}</button>`).join('')}
              </div>
            </div>
          ` : list.map(m => {
            const p = presetOf(m);
            const caps = m.caps || {};
            return `
            <div class="model-card" data-id="${m.id}">
              <div class="mc-head">
                <div class="mc-logo" style="background:${p.color}">${p.logo}</div>
                <div class="mc-name">${escapeHtml(m.name)}</div>
                <span class="badge ${kindCls(m.kind)}">${kindName(m.kind)}</span>
                ${(m.kind || 'chat') === 'chat' ? `<span class="badge ${m.type === 'anthropic' ? 'purple' : 'blue'}">${typeName(m.type)}</span>` : ''}
              </div>
              <div class="mc-rows">
                <div>模型：<b>${escapeHtml(m.model || '未填写')}</b></div>
                <div>地址：<b>${escapeHtml(m.baseUrl || '默认')}</b></div>
                <div>密钥：<b>${escapeHtml(maskKey(m.apiKey))}</b></div>
                ${m.kind === 'video' && caps.maxSeconds ? `<div>最长 ${caps.maxSeconds} 秒 · ${(caps.ratios || []).join(' / ')}</div>` : ''}
                ${m.kind === 'image' && (caps.ratios || []).length ? `<div>比例：${(caps.ratios || []).join(' / ')}</div>` : ''}
              </div>
              <div class="mc-acts">
                <button class="btn ghost sm" data-act="test" data-id="${m.id}">测试连接</button>
                <button class="btn gray sm" data-act="edit" data-id="${m.id}">编辑</button>
                <button class="btn danger sm" data-act="del" data-id="${m.id}">删除</button>
              </div>
            </div>`;
          }).join('')}
          <div class="card">
            <div class="card-title"> 隐私说明</div>
            <div class="muted">所有模型配置、密钥与会话记录均仅存储于本机（WebView 本地存储），不会上传到任何服务器。请求直接从你的设备发往你配置的接口地址。</div>
          </div>
        </div>
        ${list.length ? `<button class="fab" data-act="add-model">${icons.plus}</button>` : ''}
      </div>`;
  }

  /* ---------- 新增 / 编辑弹窗 ---------- */
  function editor(model, forceNew) {
    const isNew = !model || !!forceNew;
    const m = model || { name: '', kind: curKind === 'all' ? 'chat' : curKind, type: 'openai', baseUrl: '', apiKey: '', model: '', temperature: 0.7, maxTokens: 4096, caps: {} };
    const kind = m.kind || 'chat';
    const caps = m.caps || {};
    const isMedia = kind !== 'chat';
    const v = (x) => x == null ? '' : escapeHtml(String(x));
    sheet({
      title: isNew ? '添加模型' : '编辑模型',
      body: `
        <div class="field">
          <label>显示名称 <span class="req">*</span></label>
          <input class="input" id="m-name" placeholder="例如：我的 GPT-4o" value="${v(m.name)}">
        </div>
        <div class="field">
          <label>模型种类</label>
          <div class="row" style="gap:8px">
            <button class="chip ${kind === 'chat' ? 'active' : ''}" data-kind="chat"> 对话</button>
            <button class="chip ${kind === 'image' ? 'active' : ''}" data-kind="image"> 图片</button>
            <button class="chip ${kind === 'video' ? 'active' : ''}" data-kind="video"> 视频</button>
          </div>
        </div>
        <div class="field" id="f-type" style="${isMedia ? 'display:none' : ''}">
          <label>接口类型</label>
          <div class="row" style="gap:8px">
            <button class="chip ${m.type !== 'anthropic' ? 'active' : ''}" data-type="openai">OpenAI 兼容</button>
            <button class="chip ${m.type === 'anthropic' ? 'active' : ''}" data-type="anthropic">Anthropic</button>
          </div>
          <div class="hint">OpenAI 兼容适用于 OpenAI、DeepSeek、通义、Kimi、GLM、OneAPI 等；Anthropic 适用于 Claude 官方接口</div>
        </div>
        <div class="field">
          <label>调用地址（Base URL）</label>
          <input class="input" id="m-url" placeholder="${kind === 'anthropic' ? 'https://api.anthropic.com' : kind === 'chat' ? 'https://api.openai.com/v1' : 'https://api.example.com/v1'}" value="${v(m.baseUrl)}">
          <div class="hint">OpenAI 兼容填到 /v1 为止；Anthropic 填到域名即可，自动拼接 /v1/messages</div>
        </div>
        <div class="field">
          <label>API 密钥 <span class="req">*</span></label>
          <input class="input" id="m-key" type="password" placeholder="sk-..." value="${v(m.apiKey)}" autocomplete="off">
        </div>
        <div class="field">
          <label>模型名称 <span class="req">*</span></label>
          <input class="input" id="m-model" placeholder="${kind === 'video' ? '例如：kling-v2.1' : kind === 'image' ? '例如：gpt-image-1' : '例如：gpt-4o-mini / claude-sonnet-4-5'}" value="${v(m.model)}">
        </div>
        <div class="row" style="gap:10px;${isMedia ? 'display:none' : ''}" id="f-chat-params">
          <div class="field" style="flex:1">
            <label>温度（0~2）</label>
            <input class="input" id="m-temp" type="number" step="0.1" min="0" max="2" value="${m.temperature ?? 0.7}">
          </div>
          <div class="field" style="flex:1">
            <label>最大 Tokens</label>
            <input class="input" id="m-max" type="number" step="256" min="256" value="${m.maxTokens || 4096}">
            <div class="hint">单条回复的<b>最大输出</b>长度（不是上下文长度）。GLM 等多数模型输出上限远低于 128K 上下文，填 128000 会被接口拒绝；一般 4096~8192 即可。</div>
          </div>
        </div>

        <div id="f-media" style="${isMedia ? '' : 'display:none'}">
          <div class="card" style="margin-top:4px">
            <div class="card-title">生成能力参数</div>
            <div class="field">
              <label>支持的分辨率（逗号分隔）</label>
              <input class="input" id="m-res" placeholder="例如：720p, 1080p" value="${v((caps.resolutions || []).join(', '))}">
            </div>
            <div class="field">
              <label>支持的比例（逗号分隔）</label>
              <input class="input" id="m-ratio" placeholder="例如：16:9, 9:16, 1:1" value="${v((caps.ratios || []).join(', '))}">
            </div>
            <div class="field" id="f-sec-wrap" style="${kind === 'video' ? '' : 'display:none'}">
              <label>视频最长秒数</label>
              <input class="input" id="m-sec" type="number" min="1" max="60" value="${caps.maxSeconds || 10}">
            </div>
          </div>
          <details class="card" style="margin-top:10px">
            <div class="card-title"> 媒体提交/轮询协议（高级）</div>
            <div class="hint" style="margin:6px 0 10px">任务式接口：先提交任务拿到 ID，再轮询状态直到完成。预设已填好常见平台的值，自定义平台时按实际接口填写。</div>
            <div class="row" style="gap:10px">
              <div class="field" style="flex:1"><label>提交地址</label><input class="input" id="m-submit" value="${v(m.submitPath)}" placeholder="/images/generations"></div>
              <div class="field" style="flex:1"><label>轮询地址</label><input class="input" id="m-poll" value="${v(m.pollPath)}" placeholder="/images/generations/{id}"></div>
            </div>
            <div class="row" style="gap:10px">
              <div class="field" style="flex:1"><label>任务ID路径</label><input class="input" id="m-idpath" value="${v(m.idPath)}" placeholder="data.id"></div>
              <div class="field" style="flex:1"><label>状态路径</label><input class="input" id="m-statuspath" value="${v(m.statusPath)}" placeholder="status"></div>
            </div>
            <div class="row" style="gap:10px">
              <div class="field" style="flex:1"><label>成功状态值</label><input class="input" id="m-ok" value="${v(m.okStatus)}" placeholder="succeeded"></div>
              <div class="field" style="flex:1"><label>失败状态值</label><input class="input" id="m-fail" value="${v(m.failStatus)}" placeholder="failed"></div>
            </div>
            <div class="row" style="gap:10px">
              <div class="field" style="flex:1"><label>结果地址路径</label><input class="input" id="m-resultpath" value="${v(m.resultPath)}" placeholder="data[0].url"></div>
              <div class="field" style="flex:1"><label>轮询间隔(秒)</label><input class="input" id="m-interval" type="number" min="2" max="60" value="${m.pollInterval || 5}"></div>
            </div>
          </details>
        </div>`,
      onOpen: (mask) => {
        let kindNow = kind;
        const typeWrap = mask.querySelector('#f-type');
        const mediaWrap = mask.querySelector('#f-media');
        const chatParams = mask.querySelector('#f-chat-params');
        const secWrap = mask.querySelector('#f-sec-wrap');
        mask.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => {
          mask.querySelectorAll('[data-kind]').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          kindNow = b.dataset.kind;
          typeWrap.style.display = kindNow === 'chat' ? '' : 'none';
          mediaWrap.style.display = kindNow === 'chat' ? 'none' : '';
          chatParams.style.display = kindNow === 'chat' ? '' : 'none';
          secWrap.style.display = kindNow === 'video' ? '' : 'none';
        });
        mask.querySelectorAll('[data-type]').forEach(b => b.onclick = () => {
          mask.querySelectorAll('[data-type]').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          mask.querySelector('#m-url').placeholder = b.dataset.type === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';
        });
      },
      actions: [
        { text: '取消', cls: 'gray' },
        {
          text: isNew ? '添加' : '保存', onClick: (mask, close) => {
            const kindSel = mask.querySelector('[data-kind].active');
            const kindNow = kindSel ? kindSel.dataset.kind : kind;
            const data = {
              name: mask.querySelector('#m-name').value.trim(),
              kind: kindNow,
              baseUrl: mask.querySelector('#m-url').value.trim(),
              apiKey: mask.querySelector('#m-key').value.trim(),
              model: mask.querySelector('#m-model').value.trim(),
              temperature: parseFloat(mask.querySelector('#m-temp').value) || 0.7,
              maxTokens: parseInt(mask.querySelector('#m-max').value) || 4096
            };
            if (kindNow === 'chat') {
              const t = mask.querySelector('[data-type].active');
              data.type = t ? t.dataset.type : 'openai';
            } else {
              const splitList = (s) => s.split(/[,，]/).map(x => x.trim()).filter(Boolean);
              data.caps = {
                resolutions: splitList(mask.querySelector('#m-res').value),
                ratios: splitList(mask.querySelector('#m-ratio').value)
              };
              if (kindNow === 'video') data.caps.maxSeconds = parseInt(mask.querySelector('#m-sec').value) || 10;
              const p = (id, d) => { const el = mask.querySelector(id); return el && el.value.trim() ? el.value.trim() : undefined; };
              const submitPath = p('#m-submit'), pollPath = p('#m-poll'), idPath = p('#m-idpath');
              const statusPath = p('#m-statuspath'), okStatus = p('#m-ok'), failStatus = p('#m-fail');
              const resultPath = p('#m-resultpath');
              const interval = parseInt(mask.querySelector('#m-interval').value);
              if (submitPath) data.submitPath = submitPath;
              if (pollPath) data.pollPath = pollPath;
              if (idPath) data.idPath = idPath;
              if (statusPath) data.statusPath = statusPath;
              if (okStatus) data.okStatus = okStatus;
              if (failStatus) data.failStatus = failStatus;
              if (resultPath) data.resultPath = resultPath;
              if (interval) data.pollInterval = interval;
            }
            if (!data.name || !data.apiKey || !data.model) { toast('请填写名称、密钥和模型名称', 'err'); return; }
            if (isNew) Models.add(data); else Models.update(m.id, data);
            toast(isNew ? '已添加模型 ✓' : '已保存修改 ✓', 'ok');
            close(null);
            window.App.refresh();
          }
        }
      ]
    });
  }

  /* ---------- 预设选择弹窗 ---------- */
  function presetPicker() {
    const groups = [
      { title: ' 对话模型', list: CHAT_PRESETS },
      { title: ' 图片生成', list: IMAGE_PRESETS },
      { title: ' 视频生成', list: VIDEO_PRESETS }
    ];
    sheet({
      title: '选择服务商预设',
      body: groups.map(g => `
        <div class="card-title" style="margin:12px 0 8px">${g.title}</div>
        <div class="row wrap" style="gap:8px">
          ${g.list.map(p => `<button class="chip" data-preset="${escapeHtml(p.name)}"><span class="dot" style="background:${p.color}"></span>${p.name}</button>`).join('')}
        </div>`).join('') + `
        <button class="btn gray block" style="margin-top:14px" data-preset="">自定义（空白配置）</button>
        <div class="hint" style="margin-top:10px">预设仅用于预填地址、模型名与协议参数，密钥需要你自己输入。任何 OpenAI 兼容接口都可以手动添加。</div>`,
      onOpen: (mask, close) => {
        mask.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
          const name = b.dataset.preset;
          const p = PRESETS.find(x => x.name === name);
          close(null);
          setTimeout(() => editor(p ? { ...p, apiKey: '' } : null, true), 60);
        });
      }
    });
  }

  /* ---------- 事件 ---------- */
  async function onAction(act, el, container) {
    const id = el.dataset.id;
    if (act === 'add-model') { presetPicker(); return; }
    if (act === 'kind') { curKind = el.dataset.kind || 'chat'; window.App.refresh(); return; }
    if (act === 'preset') {
      const p = PRESETS.find(x => x.name === el.dataset.name);
      if (p) curKind = p.kind || 'chat';
      editor(p ? { ...p, apiKey: '' } : null, true);
      return;
    }
    if (act === 'edit') { editor(Models.get(id)); return; }
    if (act === 'del') {
      const m = Models.get(id);
      const ok = await confirmDialog({ title: '删除模型', body: `确定删除「${escapeHtml(m.name)}」吗？`, okText: '删除', danger: true });
      if (ok) { Models.remove(id); toast('已删除'); window.App.refresh(); }
      return;
    }
    if (act === 'test') {
      const m = Models.get(id);
      const btn = el; btn.disabled = true; btn.textContent = '测试中…';
      toast('正在连接 ' + m.name + ' …');
      const r = await window.API.testModel(m);
      btn.disabled = false; btn.textContent = '测试连接';
      if (r.ok) toast(`✓ 连接成功（${r.latency}ms）：${r.text}`, 'ok');
      else toast('✗ ' + r.error, 'err');
      return;
    }
  }

  window.ModelsPage = { render, onAction, PRESETS, CHAT_PRESETS, IMAGE_PRESETS, VIDEO_PRESETS };
})();
