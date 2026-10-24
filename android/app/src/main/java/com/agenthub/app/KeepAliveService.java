package com.agenthub.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * 激进保活前台服务：
 *  - 常驻通知栏，让用户明确知道 AgentHub 在后台运行
 *  - 持有 PARTIAL_WAKE_LOCK，息屏后 CPU 仍可继续执行 WebView 内的智能体任务
 *  - 返回 START_STICKY，被系统回收后会自动重启（但「强制停止」会真正中断，属系统限制）
 *
 * 注意：本服务不托管 WebView 本身；真正的 JS 运行仍在 MainActivity 的 WebView 中。
 * 当用户通过返回键离开时 Activity 仅 onStop（moveTaskToBack），WebView 与 JS 保持存活，
 * 叠加本服务的高优先级 + 唤醒锁，实现「退出也不暂停」。
 */
public class KeepAliveService extends Service {

    public static final String CHANNEL_ID = "agenthub_keepalive";
    public static final int NOTIF_ID = 9001;
    private static final long WAKE_TIMEOUT_MS = 12L * 60 * 60 * 1000; // 12 小时自动释放，避免永久耗电

    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        acquireWakeLock();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "stop".equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startForeground(NOTIF_ID, buildNotification(), foregroundType());
        return START_STICKY;
    }

    private int foregroundType() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // API 34
            return ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
        }
        return 0;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "AgentHub 后台运行", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("AgentHub 在后台持续运行，智能体写作不暂停");
            ch.setShowBadge(false);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification() {
        Intent launch = new Intent(this, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, launch,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Intent stop = new Intent(this, KeepAliveService.class);
        stop.setAction("stop");
        PendingIntent psi = PendingIntent.getService(this, 1, stop,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        b.setContentTitle("AgentHub 正在后台运行")
                .setContentText("智能体写作持续进行 · 点击返回 · 停止以结束")
                .setSmallIcon(R.drawable.ic_notify)
                .setContentIntent(pi)
                .setOngoing(true)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "停止", psi);

        return b.build();
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "agenthub:keepalive");
                wakeLock.acquire(WAKE_TIMEOUT_MS);
            }
        } catch (Exception ignore) { }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignore) { }
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
