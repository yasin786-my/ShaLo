package com.shalo.app;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Finds the phone's LAN IPv4 addresses (Wi-Fi, hotspot, Ethernet). Mobile-data interfaces are skipped. */
final class Net {
    private Net() {}

    static List<String> ipv4() {
        List<String> wifi = new ArrayList<>(), other = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                String n = ni.getName();
                if (!ni.isUp() || ni.isLoopback() || n.startsWith("rmnet") || n.startsWith("ccmni") || n.startsWith("pdp")
                        || n.startsWith("clat") || n.startsWith("v4-") || n.startsWith("tun") || n.startsWith("dummy")) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) {
                        (n.startsWith("wlan") ? wifi : other).add(a.getHostAddress());
                    }
                }
            }
        } catch (Exception ignored) {}
        wifi.addAll(other);
        return wifi;
    }

    static List<String> urls() {
        List<String> out = new ArrayList<>();
        for (String ip : ipv4()) out.add("http://" + ip + ":" + NodeService.PORT);
        return out;
    }
}
