package com.agenthub.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * 内置浏览器活动：独立的 WebView，可被 Agent 通过 AutoBus 远程操控
 * （导航 / 填表 / 点击 / 等待 / 提取页面文本与链接）。
 */
public class BrowserActivity extends Activity {

    private static final String TAG = "AgentHub-Browser";
    private WebView webView;
    private TextView statusText;
    private boolean busy = false;

    /** 注入到目标页面的自动化脚本：解析命令并回传结果 */
    private static final String AUTO_SCRIPT =
            "(function(){\n" +
            "  if (window.__autoExec) return;\n" +
            "  window.__autoExec = function(cmd){\n" +
            "    var id = cmd && cmd.id;\n" +
            "    function done(payload){ try { AndroidAuto.post(id, JSON.stringify(payload)); } catch(e){} }\n" +
            "    try {\n" +
            "      if (cmd.type === 'navigate') { if (cmd.url) location.href = cmd.url; done({ok:true, url: cmd.url}); }\n" +
            "      else if (cmd.type === 'search') {\n" +
            "        var eng = cmd.engine || 'bing';\n" +
            "        var q = encodeURIComponent(cmd.query || '');\n" +
            "        var url = eng === 'duckduckgo' ? 'https://duckduckgo.com/html/?q=' + q\n" +
            "                : eng === 'baidu' ? 'https://www.baidu.com/s?wd=' + q\n" +
            "                : 'https://www.bing.com/search?q=' + q;\n" +
            "        location.href = url; done({ok:true, url: url, engine: eng});\n" +
            "      }\n" +
            "      else if (cmd.type === 'wait') { setTimeout(function(){ done({ok:true}); }, Math.min(cmd.ms || 1000, 10000)); }\n" +
            "      else if (cmd.type === 'fill') { var el = document.querySelector(cmd.selector || ''); if (!el) return done({ok:false, error:'未找到元素: ' + cmd.selector}); el.focus && el.focus(); el.value = cmd.value || ''; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); done({ok:true}); }\n" +
            "      else if (cmd.type === 'click') { var el = document.querySelector(cmd.selector || ''); if (!el) return done({ok:false, error:'未找到元素: ' + cmd.selector}); el.click(); done({ok:true}); }\n" +
            "      else if (cmd.type === 'clickText') {\n" +
            "        var want = (cmd.text || '').trim();\n" +
            "        var els = document.querySelectorAll('button, a, [role=button], span, div');\n" +
            "        var hit = null;\n" +
            "        for (var i = 0; i < els.length; i++) {\n" +
            "          var t = String(els[i].innerText || els[i].value || '').trim();\n" +
            "          if (t && (t === want || t.indexOf(want) >= 0) && els[i].offsetParent !== null) { hit = els[i]; break; }\n" +
            "        }\n" +
            "        if (!hit) return done({ok:false, error:'未找到包含文本的元素: ' + want});\n" +
            "        hit.click(); done({ok:true, tag: hit.tagName});\n" +
            "      }\n" +
            "      else if (cmd.type === 'extract') {\n" +
            "        var sel = cmd.selector || 'body';\n" +
            "        var el = document.querySelector(sel);\n" +
            "        var text = '';\n" +
            "        if (el) {\n" +
            "          var clone = el.cloneNode(true);\n" +
            "          var noise = clone.querySelectorAll('script, style, noscript, svg, header, footer, nav, aside, iframe, .ad, .ads');\n" +
            "          for (var i = 0; i < noise.length; i++) { if (noise[i].parentNode) noise[i].parentNode.removeChild(noise[i]); }\n" +
            "          text = String(clone.innerText || '').replace(/[ \\t]+/g, ' ').replace(/\\n\\s*\\n+/g, '\\n').trim().slice(0, cmd.max || 6000);\n" +
            "        }\n" +
            "        var links = [];\n" +
            "        var as = document.querySelectorAll('a');\n" +
            "        for (var i = 0; i < as.length && links.length < 30; i++) {\n" +
            "          var t = String(as[i].innerText || '').trim();\n" +
            "          if (t && as[i].href && as[i].href.indexOf('http') === 0) links.push({t: t.slice(0, 100), h: as[i].href});\n" +
            "        }\n" +
            "        done({ok:true, title: document.title, url: location.href, text: text, links: links});\n" +
            "      }\n" +
            "      else if (cmd.type === 'state') { done({ok:true, title: document.title, url: location.href}); }\n" +
            "      else done({ok:false, error:'未知命令: ' + cmd.type});\n" +
            "    } catch (e) { done({ok:false, error: String(e)}); }\n" +
            "  };\n" +
            "})();";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        AutoBus.browserOpen = true;

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFFFFFFFF);

        statusText = new TextView(this);
        statusText.setText("🌐 内置浏览器 · Agent 可远程操控");
        statusText.setTextColor(0xFF16a34a);
        statusText.setTextSize(13);
        statusText.setPadding(24, 20, 24, 20);
        statusText.setGravity(Gravity.CENTER);
        root.addView(statusText, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        webView = new WebView(this);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
        root.addView(webView, lp);
        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setMediaPlaybackRequiresUserGesture(false);

        webView.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void post(String cmdId, String json) {
                AutoBus.post(cmdId, json);
            }
        }, "AndroidAuto");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onReceivedTitle(WebView view, String title) {
                statusText.setText("🌐 " + (title == null ? "" : title));
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                busy = true;
                statusText.setText("⏳ 加载中…");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                busy = false;
                inject();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("intent://") || url.startsWith("market://")) return true;
                return false; // http/https 留在应用内
            }
        });

        String url = getIntent().getStringExtra("url");
        if (url == null || url.isEmpty()) url = "https://www.bing.com";
        webView.loadUrl(url);

        // 命令轮询：每 300ms 检查一次队列
        webView.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!isFinishing()) pump();
                webView.postDelayed(this, 300);
            }
        }, 300);
    }

    private void inject() {
        try {
            webView.evaluateJavascript(AUTO_SCRIPT, null);
        } catch (Exception e) {
            Log.w(TAG, "inject failed: " + e.getMessage());
        }
    }

    private void pump() {
        if (busy) return;
        String cmd;
        while ((cmd = AutoBus.poll()) != null) {
            try {
                webView.evaluateJavascript(
                        "window.__autoExec && window.__autoExec(" + esc(cmd) + ")",
                        null);
                // 结果由页面内 AndroidAuto.post 异步回传，这里只负责投递
            } catch (Exception e) {
                Log.w(TAG, "pump failed: " + e.getMessage());
            }
        }
    }

    /** JSON 字符串安全嵌入 JS */
    private static String esc(String s) {
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "") + "'";
    }

    public void goBack() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else finish();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        AutoBus.browserOpen = false;
        AutoBus.clear();
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidAuto");
            webView.destroy();
        }
        super.onDestroy();
    }

    /** 供 NativeBridge 调用：打开/切换网址 */
    public void loadUrl(String url) {
        if (webView != null && url != null && !url.isEmpty()) webView.loadUrl(url);
    }

    public String currentUrl() {
        return webView != null ? webView.getUrl() : null;
    }
}
