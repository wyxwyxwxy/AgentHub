package com.agenthub.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.DisplayMetrics;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Web ↔ Android 原生桥：所有方法供 JS 的 window.AndroidHost 调用。
 * 约定：异步方法第一参数为回调 id，结果通过 window.__nativeCb(id, json) 返回。
 */
public class NativeBridge {

    private final Activity activity;
    private final WebView webView;
    private final SharedPreferences prefs;

    private String pendingFolderCbId = null;

    public NativeBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.prefs = activity.getSharedPreferences("agenthub", Context.MODE_PRIVATE);
    }

    /* ---------- 回调 ---------- */
    private void cb(String id, String json) {
        final String js = "window.__nativeCb && window.__nativeCb('" + id + "'," + json + ")";
        activity.runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }

    /* ========== 文件夹选择（SAF） ========== */
    @JavascriptInterface
    public void pickFolder(String cbId) {
        pendingFolderCbId = cbId;
        activity.runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                    | Intent.FLAG_GRANT_READ_URI_PERMISSION
                    | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            try {
                activity.startActivityForResult(intent, 1001);
            } catch (Exception e) {
                pendingFolderCbId = null;
                cb(cbId, "{\"__unsupported\":true}");
            }
        });
    }

    /** 由 MainActivity.onActivityResult 调用 */
    public void onFolderPicked(Uri uri) {
        String id = pendingFolderCbId;
        pendingFolderCbId = null;
        if (id == null) return;
        prefs.edit().putString("save_dir_uri", uri.toString()).apply();
        String name = docDisplayName(uri);
        cb(id, "{\"uri\":\"" + esc(uri.toString()) + "\",\"name\":\"" + esc(name) + "\"}");
    }

    public void onFolderCancelled() {
        String id = pendingFolderCbId;
        pendingFolderCbId = null;
        if (id != null) cb(id, "null");
    }

    /** 用户取消选择读取文件时回调 */
    public void onFileCancelled(String cbId) {
        cb(cbId, "null");
    }

    private String docDisplayName(Uri uri) {
        try {
            String docId = DocumentsContract.getTreeDocumentId(uri);
            if (docId != null && docId.contains(":")) return docId.substring(docId.indexOf(':') + 1);
            if (docId != null) return docId;
        } catch (Exception ignore) { }
        return "已选择文件夹";
    }

    /* ========== 保存文件到所选文件夹 ========== */
    @JavascriptInterface
    public void saveToFolder(String cbId, String name, String content) {
        String tree = prefs.getString("save_dir_uri", null);
        if (tree == null) {
            cb(cbId, "{\"__unsupported\":true}");
            return;
        }
        new Thread(() -> {
            try {
                Uri treeUri = Uri.parse(tree);
                Uri docUri = DocumentsContract.createDocument(
                        activity.getContentResolver(), treeUri, "text/plain", name);
                if (docUri == null) {
                    cb(cbId, "{\"ok\":false,\"__error\":\"无法创建文件\"}");
                    return;
                }
                OutputStream os = activity.getContentResolver().openOutputStream(docUri);
                if (os == null) {
                    cb(cbId, "{\"ok\":false,\"__error\":\"无法打开输出流\"}");
                    return;
                }
                os.write(content.getBytes(StandardCharsets.UTF_8));
                os.close();
                cb(cbId, "{\"ok\":true,\"uri\":\"" + esc(docUri.toString()) + "\"}");
            } catch (Exception e) {
                cb(cbId, "{\"ok\":false,\"__error\":\"" + esc(e.getMessage()) + "\"}");
            }
        }).start();
    }

    /* ========== 二进制文件保存到用户选择的文件夹（Base64 内容，用于图片/视频） ========== */
    @JavascriptInterface
    public void saveBinaryToFolder(String cbId, String name, String mime, String base64) {
        String tree = prefs.getString("save_dir_uri", null);
        if (tree == null) {
            cb(cbId, "{\"__unsupported\":true}");
            return;
        }
        new Thread(() -> {
            try {
                Uri treeUri = Uri.parse(tree);
                Uri docUri = DocumentsContract.createDocument(
                        activity.getContentResolver(), treeUri,
                        (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime, name);
                if (docUri == null) {
                    cb(cbId, "{\"ok\":false,\"__error\":\"无法创建文件\"}");
                    return;
                }
                OutputStream os = activity.getContentResolver().openOutputStream(docUri);
                if (os == null) {
                    cb(cbId, "{\"ok\":false,\"__error\":\"无法打开输出流\"}");
                    return;
                }
                byte[] bytes;
                try {
                    bytes = android.util.Base64.decode(base64 == null ? "" : base64, android.util.Base64.DEFAULT);
                } catch (IllegalArgumentException e) {
                    os.close();
                    cb(cbId, "{\"ok\":false,\"__error\":\"Base64 解码失败\"}");
                    return;
                }
                os.write(bytes);
                os.close();
                cb(cbId, "{\"ok\":true,\"uri\":\"" + esc(docUri.toString()) + "\"}");
            } catch (Exception e) {
                cb(cbId, "{\"ok\":false,\"__error\":\"" + esc(e.getMessage()) + "\"}");
            }
        }).start();
    }

    /* ========== 读取用户选择的单个文件 ========== */
    @JavascriptInterface
    public void readPickedFile(String cbId) {
        activity.runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            try {
                activity.startActivityForResult(intent, 1003);
                MainActivity act = (MainActivity) activity;
                act.setPendingReadCbId(cbId);
            } catch (Exception e) {
                cb(cbId, "{\"__unsupported\":true}");
            }
        });
    }

    /** 由 MainActivity 调用：转发读取到的文件内容 */
    public void onFileRead(String cbId, Uri uri) {
        new Thread(() -> {
            try {
                InputStream is = activity.getContentResolver().openInputStream(uri);
                BufferedReader rd = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = rd.readLine()) != null) sb.append(line).append('\n');
                rd.close();
                String name = queryName(uri);
                JSONObject o = new JSONObject();
                o.put("ok", true);
                o.put("name", name);
                o.put("content", sb.toString());
                cb(cbId, o.toString());
            } catch (Exception e) {
                cb(cbId, "{\"ok\":false,\"__error\":\"" + esc(e.getMessage()) + "\"}");
            }
        }).start();
    }

    private String queryName(Uri uri) {
        try (Cursor c = activity.getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) return c.getString(idx);
            }
        } catch (Exception ignore) { }
        return "file.txt";
    }

    /* ========== 设备信息 ========== */
    @JavascriptInterface
    public void deviceInfo(String cbId) {
        try {
            DisplayMetrics dm = activity.getResources().getDisplayMetrics();
            JSONObject o = new JSONObject();
            o.put("model", Build.MODEL);
            o.put("brand", Build.BRAND);
            o.put("android", "Android " + Build.VERSION.RELEASE);
            o.put("sdk", String.valueOf(Build.VERSION.SDK_INT));
            o.put("screen", dm.widthPixels + "×" + dm.heightPixels + "（" + dm.densityDpi + "dpi）");
            o.put("cpu", Runtime.getRuntime().availableProcessors() + " 核");
            o.put("ram", totalRam());
            cb(cbId, o.toString());
        } catch (Exception e) {
            cb(cbId, "{\"__error\":\"" + esc(e.getMessage()) + "\"}");
        }
    }

    private String totalRam() {
        try {
            android.app.ActivityManager.MemoryInfo mi = new android.app.ActivityManager.MemoryInfo();
            android.app.ActivityManager am =
                    (android.app.ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                am.getMemoryInfo(mi);
                return (mi.totalMem / 1024 / 1024) + " MB";
            }
        } catch (Exception ignore) { }
        return "-";
    }

    /* ========== 系统能力 ========== */
    @JavascriptInterface
    public void toast(String msg) {
        activity.runOnUiThread(() -> Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show());
    }

    @JavascriptInterface
    public void vibrate(long ms) {
        try {
            Vibrator v = (Vibrator) activity.getSystemService(activity.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(ms);
            }
        } catch (Exception ignore) { }
    }

    @JavascriptInterface
    public void share(String text, String title) {
        activity.runOnUiThread(() -> {
            try {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                i.putExtra(Intent.EXTRA_SUBJECT, title);
                activity.startActivity(Intent.createChooser(i, title));
            } catch (Exception e) {
                Toast.makeText(activity, "分享失败", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public void openUrl(String url) {
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception e) {
                Toast.makeText(activity, "无法打开链接", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public void getVersion(String cbId) {
        cb(cbId, "\"2.3.0\"");
    }

    /* ========== 屏幕方向（横屏 / 竖屏切换） ========== */
    @JavascriptInterface
    public void setOrientation(String mode) {
        activity.runOnUiThread(() -> {
            try {
                String m = mode == null ? "auto" : mode;
                if ("landscape".equals(m)) {
                    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                } else if ("portrait".equals(m)) {
                    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT);
                } else {
                    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                }
            } catch (Exception ignore) { }
        });
    }

    /* ========== 内置浏览器：打开 / 远程操控 / 取结果 ========== */

    @JavascriptInterface
    public void openBrowser(String cbId, String url) {
        activity.runOnUiThread(() -> {
            try {
                Intent i = new Intent(activity, BrowserActivity.class);
                i.putExtra("url", url == null || url.isEmpty() ? "https://www.bing.com" : url);
                i.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                activity.startActivity(i);
                cb(cbId, "{\"ok\":true}");
            } catch (Exception e) {
                cb(cbId, "{\"ok\":false,\"__error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });
    }

    @JavascriptInterface
    public void browserCmd(String cbId, String cmdJson) {
        try {
            AutoBus.push(cmdJson);
            cb(cbId, "{\"ok\":true}");
        } catch (Exception e) {
            cb(cbId, "{\"ok\":false,\"__error\":\"" + esc(e.getMessage()) + "\"}");
        }
    }

    @JavascriptInterface
    public void autoResult(String cbId, String cmdId) {
        String r = AutoBus.take(cmdId);
        if (r != null) cb(cbId, r);
        else cb(cbId, "{\"__pending\":true}");
    }

    @JavascriptInterface
    public void browserOpen(String cbId) {
        cb(cbId, AutoBus.browserOpen ? "{\"open\":true}" : "{\"open\":false}");
    }

    @JavascriptInterface
    public void exitApp() {
        activity.runOnUiThread(activity::finish);
    }

    /* ========== 后台保活 ========== */

    @JavascriptInterface
    public void startKeepAlive() {
        activity.runOnUiThread(() -> {
            try {
                Intent it = new Intent(activity, KeepAliveService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) activity.startForegroundService(it);
                else activity.startService(it);
            } catch (Exception ignore) { }
        });
    }

    @JavascriptInterface
    public void stopKeepAlive() {
        activity.runOnUiThread(() -> {
            try {
                if (activity instanceof MainActivity) ((MainActivity) activity).stopKeepAlive();
            } catch (Exception ignore) { }
        });
    }

    /* ========== 真实文件夹工作（在已选 SAF 树 URI 内） ========== */
    private static final String C_DOCID = DocumentsContract.Document.COLUMN_DOCUMENT_ID;
    private static final String C_DISP = OpenableColumns.DISPLAY_NAME;
    private static final String C_MIME = DocumentsContract.Document.COLUMN_MIME_TYPE;
    private static final String C_SIZE = DocumentsContract.Document.COLUMN_SIZE;

    private String treeDocId() {
        String tree = prefs.getString("save_dir_uri", null);
        return tree == null ? null : DocumentsContract.getTreeDocumentId(Uri.parse(tree));
    }

    /** 将相对路径解析为 SAF 内的 documentId（失败返回 null） */
    private String resolveDocId(String relPath) {
        String tid = treeDocId();
        if (tid == null) return null;
        if (relPath == null || relPath.isEmpty() || relPath.equals("/")) return tid;
        String cur = tid;
        Uri treeUri = Uri.parse(prefs.getString("save_dir_uri", null));
        for (String p : relPath.split("/")) {
            if (p.isEmpty() || p.equals(".")) continue;
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, cur);
            String found = null;
            try (Cursor c = activity.getContentResolver().query(childrenUri,
                    new String[]{C_DOCID, C_DISP}, null, null, null)) {
                if (c != null) while (c.moveToNext()) {
                    String name = c.getString(c.getColumnIndex(C_DISP));
                    String id = c.getString(c.getColumnIndex(C_DOCID));
                    if (p.equals(name)) { found = id; break; }
                }
            } catch (Exception ignore) {}
            if (found == null) return null;
            cur = found;
        }
        return cur;
    }

    @JavascriptInterface
    public void fsList(String cbId, String relPath) {
        new Thread(() -> {
            try {
                String docId = resolveDocId(relPath);
                if (docId == null) { cb(cbId, "{\"ok\":false,\"__error\":\"路径不存在\"}"); return; }
                Uri treeUri = Uri.parse(prefs.getString("save_dir_uri", null));
                Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId);
                JSONArray arr = new JSONArray();
                try (Cursor c = activity.getContentResolver().query(childrenUri,
                        new String[]{C_DOCID, C_DISP, C_MIME, C_SIZE}, null, null, null)) {
                    if (c != null) while (c.moveToNext()) {
                        JSONObject o = new JSONObject();
                        o.put("name", c.getString(c.getColumnIndex(C_DISP)));
                        String mime = c.getString(c.getColumnIndex(C_MIME));
                        o.put("isDir", DocumentsContract.Document.MIME_TYPE_DIR.equals(mime));
                        o.put("size", c.getLong(c.getColumnIndex(C_SIZE)));
                        arr.put(o);
                    }
                }
                JSONObject r = new JSONObject(); r.put("ok", true); r.put("items", arr);
                cb(cbId, r.toString());
            } catch (Exception e) { cb(cbId, "{\"ok\":false,\"__error\":\"" + esc(e.getMessage()) + "\"}"); }
        }).start();
    }

    @JavascriptInterface
    public void fsMkdir(String cbId, String relPath) {
        new Thread(() -> {
            try {
                int slash = relPath.lastIndexOf('/');
                String parent = slash > 0 ? relPath.substring(0, slash) : "";
                String name = slash > 0 ? relPath.substring(slash + 1) : relPath;
                String parentId = resolveDocId(parent);
                if (parentId == null) { cb(cbId, "{\"ok\":false,\"__error\":\"父目录不存在\"}"); return; }
                Uri treeUri = Uri.parse(prefs.getString("save_dir_uri", null));
                Uri parentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, parentId);
                Uri created = DocumentsContract.createDocument(activity.getContentResolver(), parentUri,
                        DocumentsContract.Document.MIME_TYPE_DIR, name);
                if (created == null) { cb(cbId, "{\"ok\":false,\"__error\":\"创建失败\"}"); return; }
                cb(cbId, "{\"ok\":true}");
            } catch (Exception e) { cb(cbId, "{\"ok\":false,\"__error\":\"" + esc(e.getMessage()) + "\"}"); }
        }).start();
    }

    @JavascriptInterface
    public void fsWrite(String cbId, String relPath, String content) {
        new Thread(() -> {
            try {
                int slash = relPath.lastIndexOf('/');
                String parent = slash > 0 ? relPath.substring(0, slash) : "";
                String name = slash > 0 ? relPath.substring(slash + 1) : relPath;
                String parentId = resolveDocId(parent);
                if (parentId == null) { cb(cbId, "{\"ok\":false,\"__error\":\"父目录不存在\"}"); return; }
                Uri treeUri = Uri.parse(prefs.getString("save_dir_uri", null));
                Uri parentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, parentId);
                Uri fileUri = DocumentsContract.createDocument(activity.getContentResolver(), parentUri, "text/plain", name);
                if (fileUri == null) { cb(cbId, "{\"ok\":false,\"__error\":\"无法创建文件\"}"); return; }
                OutputStream os = activity.getContentResolver().openOutputStream(fileUri);
                if (os == null) { cb(cbId, "{\"ok\":false,\"__error\":\"无法打开输出流\"}"); return; }
                os.write((content == null ? "" : content).getBytes(StandardCharsets.UTF_8));
                os.close();
                cb(cbId, "{\"ok\":true}");
            } catch (Exception e) { cb(cbId, "{\"ok\":false,\"__error\":\"" + esc(e.getMessage()) + "\"}"); }
        }).start();
    }

    @JavascriptInterface
    public void fsRead(String cbId, String relPath) {
        new Thread(() -> {
            try {
                String docId = resolveDocId(relPath);
                if (docId == null) { cb(cbId, "{\"ok\":false,\"__error\":\"文件不存在\"}"); return; }
                Uri treeUri = Uri.parse(prefs.getString("save_dir_uri", null));
                Uri fileUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);
                InputStream is = activity.getContentResolver().openInputStream(fileUri);
                BufferedReader rd = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = rd.readLine()) != null) sb.append(line).append('\n');
                rd.close();
                JSONObject o = new JSONObject(); o.put("ok", true); o.put("content", sb.toString());
                cb(cbId, o.toString());
            } catch (Exception e) { cb(cbId, "{\"ok\":false,\"__error\":\"" + esc(e.getMessage()) + "\"}"); }
        }).start();
    }

    @JavascriptInterface
    public void fsDelete(String cbId, String relPath) {
        new Thread(() -> {
            try {
                String docId = resolveDocId(relPath);
                if (docId == null) { cb(cbId, "{\"ok\":false,\"__error\":\"不存在\"}"); return; }
                Uri treeUri = Uri.parse(prefs.getString("save_dir_uri", null));
                Uri fileUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);
                boolean ok = DocumentsContract.deleteDocument(activity.getContentResolver(), fileUri);
                cb(cbId, "{\"ok\":" + ok + "}");
            } catch (Exception e) { cb(cbId, "{\"ok\":false,\"__error\":\"" + esc(e.getMessage()) + "\"}"); }
        }).start();
    }
}
