/* ============ 模型 API：OpenAI 兼容 / Anthropic 双协议流式调用 ============ */
(function () {
  const { toast, escapeHtml } = window.UI;

  function normalizeMessages(messages) {
    // 合并连续同角色，保证 user/assistant 交替（Anthropic 要求）
    const out = [];
    for (const m of messages) {
      if (!m.content) continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n\n' + m.content;
      else out.push({ role, content: m.content });
    }
    while (out.length && out[0].role !== 'user') out.shift();
    if (!out.length) out.push({ role: 'user', content: '你好' });
    return out;
  }

  function buildOpenAI(model, messages) {
    const base = (model.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    return {
      url: base + '/chat/completions',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (model.apiKey || '') },
      body: {
        model: model.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        temperature: typeof model.temperature === 'number' ? model.temperature : 0.7,
        max_tokens: typeof model.maxTokens === 'number' ? model.maxTokens : 4096
      }
    };
  }

  function buildAnthropic(model, messages) {
    const base = (model.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    const msgs = normalizeMessages(messages);
    const body = {
      model: model.model,
      max_tokens: model.maxTokens || 4096,
      messages: msgs,
      stream: true
    };
    const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    if (sys) body.system = sys;
    return {
      url: base + '/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': model.apiKey || '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body
    };
  }

  async function readError(res) {
    try {
      const txt = await res.text();
      try {
        const j = JSON.parse(txt);
        return j.error && j.error.message ? j.error.message : (j.message || txt.slice(0, 300));
      } catch { return txt.slice(0, 300) || ('HTTP ' + res.status); }
    } catch { return 'HTTP ' + res.status; }
  }

  function friendlyError(err, model) {
    if (err && err.name === 'AbortError') return null; // 用户主动停止
    let msg = String(err && err.message || err);
    if (/Failed to fetch|NetworkError|Load failed|网络请求失败/i.test(msg))
      msg = '网络请求失败。可能原因：接口地址错误、网络不通，或该接口不允许浏览器跨域(CORS)直接调用。请更换接口地址或改用支持跨域的提供商。';
    else if (/401|Unauthorized|invalid.*key/i.test(msg)) msg = 'API 密钥无效或未授权 (401)，请检查密钥。';
    else if (/403|Forbidden|地区|region/i.test(msg)) msg = '访问被拒绝 (403)，可能是密钥权限不足或地区限制。';
    else if (/404|Not Found/i.test(msg)) msg = '接口不存在 (404)，请检查「调用地址」与「模型名称」是否正确。';
    else if (/429|rate limit/i.test(msg)) msg = '请求过于频繁 (429)，请稍后再试。';
    else if (/max[_\s-]?tokens|too many tokens|token.*(limit|exceed)|maximum.*(length|tokens|context)|exceeds? the (maximum|max)|超出.*(长度|token)/i.test(msg))
      msg = '接口拒绝：本次设置的「最大输出 Tokens」超过该模型单次输出上限。注意它指单条回复的输出长度（并非上下文长度），不同模型上限不同——例如 GLM-5.2 单次输出最高可达 12.8 万 token，可直接按模型文档填；若其它模型上限较低，请下调后重试。';
    else if (/500|502|503/i.test(msg)) msg = '服务端错误 (' + msg.slice(0, 60) + ')，请稍后重试。';
    return msg.slice(0, 400);
  }

  /* SSE 流读取 */
  async function readSSE(res, onData) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    for (; ;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line.startsWith('data:')) onData(line.slice(5).trim());
      }
    }
    if (buf.trim().startsWith('data:')) onData(buf.trim().slice(5).trim());
  }

  /**
   * 流式对话
   * @param model 模型配置 {type:'openai'|'anthropic', baseUrl, apiKey, model, temperature, maxTokens}
   * @param messages [{role, content}]
   * @param opts {onDelta(text), signal}
   */
  async function chatStream(model, messages, opts = {}) {
    const isAnthropic = model.type === 'anthropic';
    const req = isAnthropic ? buildAnthropic(model, messages) : buildOpenAI(model, messages);
    let res;
    try {
      res = await fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: opts.signal
      });
    } catch (e) {
      throw new Error(friendlyError(e, model) || 'aborted');
    }
    if (!res.ok) {
      const detail = await readError(res);
      // 某些接口不支持 stream，降级为非流式
      if (/stream/i.test(detail) && res.status >= 400) {
        try { return await chatOnce(model, messages, opts); } catch (e2) { throw e2; }
      }
      throw new Error(friendlyError(detail, model) || detail);
    }

    let full = '';
    let got = false;
    await readSSE(res, (data) => {
      if (!data || data === '[DONE]') return;
      let j;
      try { j = JSON.parse(data); } catch { return; }
      if (j.error) throw new Error(friendlyError(j.error.message || JSON.stringify(j.error), model));
      let delta = '';
      if (isAnthropic) {
        if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta') delta = j.delta.text || '';
        if (j.type === 'message_stop') return;
        if (j.type === 'error') throw new Error(friendlyError(j.error && j.error.message, model));
      } else {
        if (j.choices && j.choices[0]) {
          const c = j.choices[0].delta || {};
          delta = c.content || '';
        }
        if (j.error) throw new Error(friendlyError(j.error.message, model));
      }
      if (delta) { got = true; full += delta; opts.onDelta && opts.onDelta(delta, full); }
    });
    if (!got) {
      // 流无内容，降级非流式
      try { return await chatOnce(model, messages, opts); } catch (e) { if (e.message !== 'aborted') throw e; }
    }
    return full;
  }

  /* 非流式兜底 */
  async function chatOnce(model, messages, opts = {}) {
    const isAnthropic = model.type === 'anthropic';
    const req = isAnthropic ? buildAnthropic(model, messages) : buildOpenAI(model, messages);
    req.body.stream = false;
    let res;
    try {
      res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal: opts.signal });
    } catch (e) { throw new Error(friendlyError(e, model) || 'aborted'); }
    if (!res.ok) throw new Error(friendlyError(await readError(res), model));
    const j = await res.json();
    let text = '';
    if (isAnthropic) text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    else text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    if (text) opts.onDelta && opts.onDelta(text, text);
    return text;
  }

  /* ============================================================
   * 媒体生成（图片 / 视频）—— 任务式「提交 + 轮询」协议
   * 模型配置（kind=image|video）可覆盖：
   *   submitPath  '/images/generations'   提交地址（默认按 kind）
   *   pollPath    '/images/generations/{id}'  轮询地址（{id} 会被替换）
   *   idPath      'id' | 'data.id' | 'task_id'   任务 ID 取值路径
   *   statusPath  'status'                      状态取值路径
   *   okStatus    'succeeded'                   成功状态值（可 'success|completed'）
   *   failStatus  'failed'                      失败状态值
   *   resultPath  'data[0].url' | 'url' | 'video_url'  结果地址取值路径
   *   pollInterval 5（秒）  timeout 600（秒）
   *   extra {}   提交时附加到 body 的固定参数
   * ============================================================ */
  const MEDIA_DEFAULTS = {
    image: {
      submitPath: '/images/generations',
      pollPath: '/images/generations/{id}',
      idPath: 'data[0].id', statusPath: 'status', okStatus: 'succeeded', failStatus: 'failed',
      resultPath: 'data[0].url', pollInterval: 4, timeout: 300
    },
    video: {
      submitPath: '/videos/generations',
      pollPath: '/videos/generations/{id}',
      idPath: 'id', statusPath: 'status', okStatus: 'succeeded', failStatus: 'failed',
      resultPath: 'url', pollInterval: 8, timeout: 900
    }
  };

  function mediaCfg(model) {
    const kind = model.kind === 'video' ? 'video' : 'image';
    const d = MEDIA_DEFAULTS[kind];
    return Object.assign({}, d, {
      submitPath: model.submitPath || d.submitPath,
      pollPath: model.pollPath || d.pollPath,
      idPath: model.idPath || d.idPath,
      statusPath: model.statusPath || d.statusPath,
      okStatus: model.okStatus || d.okStatus,
      failStatus: model.failStatus || d.failStatus,
      resultPath: model.resultPath || d.resultPath,
      pollInterval: Math.max(2, model.pollInterval || d.pollInterval),
      timeout: Math.max(30, model.timeout || d.timeout)
    });
  }

  function mediaHeaders(model) {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (model.apiKey || '')
    };
  }

  async function mediaFetch(url, init) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      throw new Error(friendlyError(e) || '网络请求失败');
    }
    if (!res.ok) throw new Error(friendlyError(await readError(res)));
    return res;
  }

  /**
   * 生成图片/视频：提交任务 → 轮询直到完成
   * @param model 媒体模型配置
   * @param params {prompt, size, ratio, duration, resolution, n}
   * @param opts {onPoll(status, elapsed), signal}
   * @returns {ok, url, raw} url 可能是 http(s) 或 data:image base64
   */
  async function generateMedia(model, params, opts = {}) {
    const cfg = mediaCfg(model);
    const base = (model.baseUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('请先填写调用地址');

    // 组装提交体
    const body = { model: model.model, prompt: params.prompt || '' };
    if (params.size) body.size = params.size;
    if (params.ratio) body.aspect_ratio = params.ratio;
    if (params.duration) body.duration = params.duration;
    if (params.resolution) body.resolution = params.resolution;
    if (params.n) body.n = params.n;
    if (model.extra && typeof model.extra === 'object') Object.assign(body, model.extra);
    if (opts.extraBody && typeof opts.extraBody === 'object') Object.assign(body, opts.extraBody);

    const t0 = Date.now();
    let j;
    try {
      const res = await mediaFetch(base + cfg.submitPath, {
        method: 'POST', headers: mediaHeaders(model), body: JSON.stringify(body), signal: opts.signal
      });
      j = await res.json();
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new Error('提交失败：' + (e.message || e));
    }

    // 直接返回结果（非任务式）
    let direct = Store.getPath(j, cfg.resultPath);
    if (direct) {
      if (/^[A-Za-z0-9+/=\s]+$/.test(String(direct).slice(0, 64)) && String(direct).length > 200) {
        direct = 'data:image/png;base64,' + String(direct).replace(/\s+/g, '');
      }
      return { ok: true, url: String(direct), raw: j, elapsed: Date.now() - t0 };
    }

    // 任务式：取任务 ID 后轮询
    const taskId = Store.getPath(j, cfg.idPath);
    if (taskId == null) throw new Error('提交响应中找不到任务 ID（检查 idPath 配置）：' + JSON.stringify(j).slice(0, 200));

    const pollUrl = base + cfg.pollPath.replace(/\{id\}/g, encodeURIComponent(taskId));
    const deadline = t0 + cfg.timeout * 1000;
    let lastStatus = '';
    for (;;) {
      if (opts.signal && opts.signal.aborted) throw new DOMException('aborted', 'AbortError');
      await new Promise(r => setTimeout(r, cfg.pollInterval * 1000));
      let pj;
      try {
        const res = await mediaFetch(pollUrl, { method: 'GET', headers: mediaHeaders(model), signal: opts.signal });
        pj = await res.json();
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        // 轮询失败不立即放弃，继续直到超时
        opts.onPoll && opts.onPoll('轮询重试中…', Date.now() - t0);
        if (Date.now() > deadline) throw new Error('轮询失败：' + (e.message || e));
        continue;
      }
      const status = String(Store.getPath(pj, cfg.statusPath) || '');
      lastStatus = status;
      opts.onPoll && opts.onPoll(status || '处理中', Date.now() - t0);

      if (status && cfg.okStatus.split('|').includes(status)) {
        let url = Store.getPath(pj, cfg.resultPath);
        if (url == null) throw new Error('任务完成但找不到结果地址（检查 resultPath 配置）');
        if (/^[A-Za-z0-9+/=\s]+$/.test(String(url).slice(0, 64)) && String(url).length > 200) {
          url = 'data:image/png;base64,' + String(url).replace(/\s+/g, '');
        }
        return { ok: true, url: String(url), raw: pj, elapsed: Date.now() - t0 };
      }
      if (status && cfg.failStatus.split('|').includes(status)) {
        const errMsg = Store.getPath(pj, 'error.message') || Store.getPath(pj, 'error') || status;
        throw new Error('生成失败：' + String(errMsg).slice(0, 200));
      }
      if (Date.now() > deadline) throw new Error('生成超时（' + cfg.timeout + 's），最后状态：' + (lastStatus || '未知'));
    }
  }

  /* 媒体模型测试：提交一个最小任务，验证地址/密钥/模型可用 */
  async function testMediaModel(model) {
    const t0 = Date.now();
    try {
      const isVideo = model.kind === 'video';
      const params = isVideo
        ? { prompt: 'test', duration: 1, ratio: '16:9' }
        : { prompt: 'a green circle', size: '512x512', n: 1 };
      // 只验证提交被接受（拿到任务 ID 或直接结果），不做完整轮询
      const cfg = mediaCfg(model);
      const base = (model.baseUrl || '').replace(/\/+$/, '');
      if (!base) return { ok: false, error: '请先填写调用地址' };
      const body = { model: model.model, prompt: params.prompt };
      if (params.size) body.size = params.size;
      if (params.ratio) body.aspect_ratio = params.ratio;
      if (params.duration) body.duration = params.duration;
      if (params.n) body.n = params.n;
      if (model.extra && typeof model.extra === 'object') Object.assign(body, model.extra);
      const res = await mediaFetch(base + cfg.submitPath, {
        method: 'POST', headers: mediaHeaders(model), body: JSON.stringify(body)
      });
      const j = await res.json();
      const id = Store.getPath(j, cfg.idPath);
      const direct = Store.getPath(j, cfg.resultPath);
      if (id != null || direct) {
        return { ok: true, latency: Date.now() - t0, text: (isVideo ? '视频任务已提交' : '图片任务已提交') + '（' + (id != null ? '任务ID ' + id : '直接返回') + '）' };
      }
      return { ok: false, error: '响应中未找到任务 ID 或结果，请检查 idPath/resultPath 配置' };
    } catch (e) {
      return { ok: false, error: friendlyError(e) || String(e.message || e) };
    }
  }

  /* 测试连接 */
  async function testModel(model) {
    if (model.kind === 'image' || model.kind === 'video') return testMediaModel(model);
    const t0 = Date.now();
    try {
      const text = await chatOnce(model, [{ role: 'user', content: '用一句话证明你在线，例如"连接成功"。' }], {});
      return { ok: true, latency: Date.now() - t0, text: (text || '').slice(0, 120) };
    } catch (e) {
      return { ok: false, error: friendlyError(e, model) || String(e.message || e) };
    }
  }

  window.API = { chatStream, chatOnce, testModel, testMediaModel, generateMedia, normalizeMessages, friendlyError, mediaCfg, MEDIA_DEFAULTS };
})();
