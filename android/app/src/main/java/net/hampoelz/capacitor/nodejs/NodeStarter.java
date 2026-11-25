package net.hampoelz.capacitor.nodejs;

import java.util.Map;

/**
 * Lives in the plugin's package on purpose: NodeProcess (the JNI wrapper around libnode that ships
 * with capacitor-nodejs) has protected members. This blocks until Node exits, so call it from a thread.
 * Node can only be started once per process, which is why ShaLo's service runs in its own ":node" process.
 */
public final class NodeStarter {
    private NodeStarter() {}

    public static void run(String mainScript, Map<String, String> env, String cacheDir) {
        new NodeProcess((channel, message) -> { /* no JS bridge needed: control is via HTTP + Intents */ })
                .start(mainScript, new String[0], env, cacheDir);
    }
}
