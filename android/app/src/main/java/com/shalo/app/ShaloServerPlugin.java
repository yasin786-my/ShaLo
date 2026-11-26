package com.shalo.app;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.HttpURLConnection;
import java.net.URL;

/** Bridge between the Capacitor UI (www/index.html) and the Node foreground service. */
@CapacitorPlugin(name = "ShaloServer")
public class ShaloServerPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        try {
            ContextCompat.startForegroundService(getContext(),
                    new Intent(getContext(), NodeService.class).setAction(NodeService.ACTION_START));
            call.resolve();
        } catch (Exception e) { call.reject("Could not start the server: " + e.getMessage()); }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            getContext().startService(new Intent(getContext(), NodeService.class).setAction(NodeService.ACTION_STOP));
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    /** "Running" means the Express server really answers, not just that the service exists. */
    @PluginMethod
    public void status(PluginCall call) {
        new Thread(() -> {
            boolean up = false;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL("http://127.0.0.1:" + NodeService.PORT + "/api/me").openConnection();
                c.setConnectTimeout(600); c.setReadTimeout(900);
                up = c.getResponseCode() == 200;
                c.disconnect();
            } catch (Exception ignored) {}
            JSObject r = new JSObject(); r.put("running", up);
            call.resolve(r);
        }).start();
    }

    /** Last lines of the service and Node logs, shown on the controls screen when the server won't start. */
    @PluginMethod
    public void getLog(PluginCall call) {
        StringBuilder sb = new StringBuilder();
        java.io.File dir = new java.io.File(getContext().getFilesDir(), "shalo-data");
        for (String n : new String[]{"service-log.txt", "node-log.txt"}) {
            try {
                java.io.File f = new java.io.File(dir, n);
                if (f.exists()) sb.append("== ").append(n).append(" ==\n").append(new String(java.nio.file.Files.readAllBytes(f.toPath()))).append("\n");
            } catch (Exception e) { sb.append(n).append(": ").append(e).append("\n"); }
        }
        if (sb.length() == 0) sb.append("No log yet: the service did not start. Check notification permission and battery settings.");
        String t = sb.toString();
        JSObject r = new JSObject();
        r.put("log", t.length() > 3500 ? t.substring(t.length() - 3500) : t);
        call.resolve(r);
    }

    /** Creates a fresh 6-digit join code on the running server (same as "Add a device" in ShaLo). */
    @PluginMethod
    public void getInvite(PluginCall call) {
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL("http://127.0.0.1:" + NodeService.PORT + "/api/invite").openConnection();
                c.setConnectTimeout(1500); c.setReadTimeout(3000);
                String body = new java.util.Scanner(c.getInputStream(), "UTF-8").useDelimiter("\\A").next();
                c.disconnect();
                JSObject r = new JSObject(body);
                r.put("urls", new JSArray(Net.urls()));   // always the live addresses
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Start sharing first (" + e.getMessage() + ")");
            }
        }).start();
    }

    @PluginMethod
    public void shareText(PluginCall call) {
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
        getActivity().startActivity(Intent.createChooser(send, "Share ShaLo address"));
        call.resolve();
    }

    @PluginMethod
    public void getAddresses(PluginCall call) {
        JSObject r = new JSObject();
        r.put("urls", new JSArray(Net.urls()));
        r.put("ips", new JSArray(Net.ipv4()));
        call.resolve(r);
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        } catch (Exception e) {
            getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName())));
        }
        call.resolve();
    }
}
