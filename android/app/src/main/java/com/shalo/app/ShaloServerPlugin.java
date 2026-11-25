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
