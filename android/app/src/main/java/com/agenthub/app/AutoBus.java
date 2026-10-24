package com.agenthub.app;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 浏览器自动化命令总线：
 * SPA（主 WebView）通过 NativeBridge.browserCmd 投递命令，
 * BrowserActivity 轮询队列并在自己的 WebView 中执行，
 * 执行结果经 AndroidAuto.post 回写到 results，SPA 再经 autoResult 取回。
 */
public final class AutoBus {
    private AutoBus() {}

    /** 待执行命令（JSON 字符串，含 id/type 及参数） */
    private static final List<String> COMMANDS = new ArrayList<>();
    /** 命令结果 cmdId -> JSON 字符串 */
    private static final Map<String, String> RESULTS = new ConcurrentHashMap<>();
    /** BrowserActivity 是否在前台 */
    public static volatile boolean browserOpen = false;

    public static synchronized void push(String cmdJson) {
        COMMANDS.add(cmdJson);
    }

    public static synchronized String poll() {
        if (COMMANDS.isEmpty()) return null;
        return COMMANDS.remove(0);
    }

    public static void post(String cmdId, String resultJson) {
        if (cmdId != null) RESULTS.put(cmdId, resultJson == null ? "{}" : resultJson);
    }

    public static String take(String cmdId) {
        return RESULTS.remove(cmdId);
    }

    public static void clear() {
        COMMANDS.clear();
        RESULTS.clear();
    }
}
