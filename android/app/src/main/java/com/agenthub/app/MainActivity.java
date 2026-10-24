package com.agenthub.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.util.Log;

/**
 * AgentHub 主活动：全屏 WebView 容器 + 原生桥
 */
public class MainActivity extends Activity {

    private static final String TAG = "AgentHub";
    private static final int REQ_PICK_FOLDER = 1001;
    private static final int REQ_PICK_FILE = 1002;
    private static final int REQ_READ_FILE = 1003;

    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private NativeBridge bridge;
    private String pendingReadCbId;

    public void setPendingReadCbId(String id) {
        this.pendingReadCbId = id;
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage 持久化
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);

        webView.setBackgroundColor(0xFFFFFFFF);
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.d(TAG, m.message());
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_PICK_FILE);
                } catch (Exception e) {
                    fileChooserCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return false; // 页面内导航全部留在 WebView
            }
        });

        bridge = new NativeBridge(this, webView);
        webView.addJavascriptInterface(bridge, "AndroidHost");
        webView.loadUrl("file:///android_asset/www/index.html");

        startKeepAlive();
    }

    /** 启动前台保活服务：让智能体在后台持续运行（退出/息屏不暂停） */
    private void startKeepAlive() {
        try {
            Intent it = new Intent(this, KeepAliveService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(it);
            } else {
                startService(it);
            }
        } catch (Exception ignore) { }
    }

    /** 供原生桥调用：停止保活服务 */
    public void stopKeepAlive() {
        try { stopService(new Intent(this, KeepAliveService.class)); } catch (Exception ignore) { }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);

        if (req == REQ_PICK_FOLDER) {
            if (bridge == null) return;
            if (res == Activity.RESULT_OK && data != null && data.getData() != null) {
                Uri uri = data.getData();
                try {
                    final int flags = data.getFlags()
                            & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    getContentResolver().takePersistableUriPermission(uri, flags);
                } catch (Exception ignore) { }
                bridge.onFolderPicked(uri);
            } else {
                bridge.onFolderCancelled();
            }
            return;
        }

        if (req == REQ_PICK_FILE) {
            if (fileChooserCallback == null) return;
            if (res == Activity.RESULT_OK && data != null && data.getData() != null) {
                fileChooserCallback.onReceiveValue(new Uri[]{data.getData()});
            } else {
                fileChooserCallback.onReceiveValue(null);
            }
            fileChooserCallback = null;
            return;
        }

        if (req == REQ_READ_FILE) {
            String id = pendingReadCbId;
            pendingReadCbId = null;
            if (id == null) return;
            if (res == Activity.RESULT_OK && data != null && data.getData() != null) {
                bridge.onFileRead(id, data.getData());
            } else {
                bridge.onFileCancelled(id);
            }
        }
    }

    @Override
    public void onBackPressed() {
        // 先询问 Web 层是否处理（关闭环境 / 返回对话页 / 双击退出）
        webView.evaluateJavascript(
                "(function(){ try { return window.__handleBack ? (window.__handleBack() ? 'true' : 'false') : 'false'; } catch(e){ return 'false'; } })()",
                value -> {
                    if (!"true".equals(value)) {
                        moveTaskToBack(true);
                    }
                });
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidHost");
            webView.destroy();
        }
        super.onDestroy();
    }
}
