package com.shalo.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.Process;
import android.util.Log;

import net.hampoelz.capacitor.nodejs.FileOperations;
import net.hampoelz.capacitor.nodejs.NodeStarter;

import org.json.JSONArray;

import java.io.File;
import java.io.FileWriter;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Map;

/**
 * Foreground service that hosts ShaLo's Node.js server. Declared with android:process=":node", so:
 *  - Node (which can only start once per process) gets a fresh process on every Start, and
 *  - Stop simply kills this process, which is the only clean way to stop an embedded Node.
 */
public class NodeService extends Service {
    static final String ACTION_START = "com.shalo.app.START";
    static final String ACTION_STOP = "com.shalo.app.STOP";
    static final int PORT = 3000;
    private static final String CHANNEL = "shalo_server";
    private static final int NOTIF_ID = 1;
    private static final String TAG = "ShaLo";

    private static boolean nodeStarted = false;   // per process (this process only exists while sharing)
    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;
    private String lastShownUrl = "";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        @Override public void run() { publishAddresses(); handler.postDelayed(this, 5000); }
    };

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) { shutdown(); return START_NOT_STICKY; }

        createChannel();
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(NOTIF_ID, n);

        acquireLocks();
        startNode();
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_STICKY;   // a null intent after a process kill also lands here and restarts sharing
    }

    /** Android 15+: dataSync services may only run ~6 h per 24 h. The system calls this, then we must stop. */
    public void onTimeout(int startId, int fgsType) {
        Log.w(TAG, "Android's foreground-service time limit reached; stopping.");
        shutdown();
    }

    private void startNode() {
        if (nodeStarted) return;
        nodeStarted = true;
        new File(dataDir(), "service-log.txt").delete();
        log("Service started, preparing Node");
        new Thread(null, () -> {
            try {
                File base = new File(getFilesDir(), "nodejs");
                File project = new File(base, "public");
                File marker = new File(base, "installed.txt");
                String stamp = String.valueOf(getPackageManager().getPackageInfo(getPackageName(), 0).lastUpdateTime);
                String have = marker.exists() ? new String(Files.readAllBytes(marker.toPath())) : "";
                if (!project.exists() || !have.equals(stamp)) {   // first run or app updated: unpack Node project
                    FileOperations.DeleteDir(project);
                    FileOperations.CopyAssetDir(getAssets(), "public/nodejs", project.getAbsolutePath());
                    base.mkdirs();
                    Files.write(marker.toPath(), stamp.getBytes());
                }
                Map<String, String> env = new HashMap<>();
                env.put("SHALO_DATA", dataDir().getAbsolutePath());   // survives app updates (project folder does not)
                env.put("NODE_PATH", new File(project, "node_modules").getAbsolutePath());
                log("Starting Node with " + new File(project, "server.js").exists() + " server.js, node_modules: "
                        + new File(project, "node_modules/express").exists());
                NodeStarter.run(new File(project, "server.js").getAbsolutePath(), env, getCacheDir().getAbsolutePath());
            } catch (Throwable t) {
                Log.e(TAG, "Node failed to start", t);
                log("Node failed to start: " + Log.getStackTraceString(t));
            }
        }, "node-main", 4 * 1024 * 1024).start();
    }

    private void log(String m) {
        try (FileWriter w = new FileWriter(new File(dataDir(), "service-log.txt"), true)) {
            w.write(new java.util.Date() + " " + m + "\n");
        } catch (Exception ignored) {}
    }

    private File dataDir() { File d = new File(getFilesDir(), "shalo-data"); d.mkdirs(); return d; }

    /** os.networkInterfaces() is blocked for Node on Android 11+, so we hand it the addresses via a file. */
    private void publishAddresses() {
        try {
            File tmp = new File(dataDir(), "ips.json.tmp");
            try (FileWriter w = new FileWriter(tmp)) { w.write(new JSONArray(Net.ipv4()).toString()); }
            tmp.renameTo(new File(dataDir(), "ips.json"));
        } catch (Exception e) { Log.w(TAG, "ips.json", e); }
        String url = Net.urls().isEmpty() ? "" : Net.urls().get(0);
        if (!url.equals(lastShownUrl)) {
            lastShownUrl = url;
            getSystemService(NotificationManager.class).notify(NOTIF_ID, buildNotification());
        }
    }

    private Notification buildNotification() {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, NodeService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE);
        String url = Net.urls().isEmpty() ? "Connect to Wi-Fi so others can join" : "Others open " + Net.urls().get(0);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.stat_sys_upload)
                .setContentTitle("ShaLo is sharing files")
                .setContentText(url)
                .setContentIntent(open)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(null, "Stop", stop).build())
                .build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel c = new NotificationChannel(CHANNEL, "ShaLo server", NotificationManager.IMPORTANCE_LOW);
        c.setDescription("Shown while ShaLo is sharing files on your Wi-Fi");
        getSystemService(NotificationManager.class).createNotificationChannel(c);
    }

    @SuppressWarnings("deprecation")
    private void acquireLocks() {
        if (wake == null) {
            wake = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ShaLo:server");
            wake.acquire();
        }
        if (wifi == null) {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            wifi = wm.createWifiLock(Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                    : WifiManager.WIFI_MODE_FULL_HIGH_PERF, "ShaLo:wifi");
            wifi.acquire();
        }
    }

    private void shutdown() {
        handler.removeCallbacks(tick);
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Exception ignored) {}
        try { if (wifi != null && wifi.isHeld()) wifi.release(); } catch (Exception ignored) {}
        stopForeground(true);
        stopSelf();
        Process.killProcess(Process.myPid());   // ends the embedded Node runtime
    }

    @Override public void onDestroy() { shutdown(); super.onDestroy(); }
}
