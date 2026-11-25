# ShaLo for Android

Share files between devices on the same Wi-Fi. No accounts, no cloud, no internet needed.

**One Android phone runs ShaLo and hosts the server. Everyone else joins from a normal web browser. Nothing to install for them.**

## How to use it

### Phone A: the host (has the app)
1. Install the APK (see [Install the APK](#install-the-apk)).
2. Open ShaLo, allow notifications, tap **Start sharing**.
3. In the ShaLo screen tap **Add a device**. A QR code and a 6-digit code appear.

### Everyone else: phones, laptops, iPhones (no app)
1. Connect to the same Wi-Fi as Phone A, or to Phone A's hotspot.
2. Scan the QR code with the camera, or open the address shown (like `http://192.168.1.50:3000`) in Chrome or Safari and type the 6-digit code.
3. Send and download files in the browser.

Only one phone hosts at a time. If two phones have the app, one taps Start and the other joins in its browser.

### Good to know
- A code works **once** and lasts **2 minutes**. Tap **Add a device** for a fresh one.
- A joined device stays signed in for 12 hours. **Sign out all devices** is in the Add a device window.
- Files up to **2 GB** each. Photos, video, audio and text open in the browser.
- **⚙ Server** (bottom left) or the Android back button returns to the Start/Stop screen. **Stop** is also in the notification.
- No Wi-Fi? Turn on the host's hotspot and join it.

## Install the APK
1. Copy `app-debug.apk` to the phone (USB, Drive, messaging app).
2. Open it and allow **Install unknown apps** when Android asks.

## Build the APK

Needs Node 18+, **JDK 21**, and Android Studio with SDK 36 plus **NDK** and **CMake** (SDK Manager > SDK Tools).

```bash
npm install
npm run sync                     # installs express/multer for the phone, then `cap sync android`
cd android
gradlew.bat assembleDebug        # macOS/Linux: ./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`
Or run `npm run open` and use **Build > Build APK(s)** in Android Studio.
Run `npm run sync` again after any change inside `www/`.

## How it works

```
Capacitor WebView
 ├─ https://localhost/          www/index.html        Start / Stop, IP addresses, battery settings
 └─ http://127.0.0.1:3000/      www/nodejs/public/    the original ShaLo interface
        ▲ HTTP
NodeService  (foreground service, own process ":node", "ShaLo is sharing files" notification)
 └─ nodejs-mobile → www/nodejs/server.js              Express + multer on port 3000
```

- The service runs in its own process because nodejs-mobile starts only once per process. Start launches a fresh process, Stop ends it.
- Shared files are stored in the app's private storage, so no storage permission is needed. Downloads on the host phone's own screen go to the Downloads folder.
- Android 11+ blocks `os.networkInterfaces()` for Node, so the service writes the phone's IPs to `ips.json` every 5 seconds and `server.js` reads it.

### Project layout
```
capacitor.config.ts                         Capacitor settings
www/index.html                              Start/Stop screen
www/nodejs/server.js                        original server (small changes below)
www/nodejs/public/                          original index.html, join.html, qr.js
android/app/src/main/AndroidManifest.xml    permissions + service
android/app/src/main/java/com/shalo/app/
    MainActivity.java                       WebView setup, saves downloads, back button
    NodeService.java                        foreground service that runs Node
    ShaloServerPlugin.java                  start / stop / status / IPs for the UI
    Net.java                                finds the phone's Wi-Fi IPs
android/app/src/main/java/net/hampoelz/capacitor/nodejs/NodeStarter.java
                                            starts libnode (from the capacitor-nodejs plugin)
```

### Changes to the original ShaLo files
| File | Change |
| --- | --- |
| `server.js` | `SHALO_DATA` folder for `shared/` and `meta.json`; IP lookup falls back to `ips.json` |
| `public/index.html` | small script adding the "⚙ Server" link (only inside the app) |
| `public/join.html`, `qr.js` | unchanged |

## Permissions
`INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE`, `WAKE_LOCK`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `POST_NOTIFICATIONS`, and legacy storage permissions that apply only on Android 9 and older.

## Limitations
- **Android 15+:** `dataSync` services may run about 6 hours per 24 hours. Sharing then stops; tap Start again.
- **Battery:** set ShaLo to **Unrestricted** (button on the Start screen). Xiaomi, Huawei, Samsung and OnePlus add their own app killers (see dontkillmyapp.com).
- **Background start:** Android 12+ blocks it. Start the server from the app screen.
- **PDFs** can't open inline on the host phone (WebView limit). Other devices' browsers are fine. Use Download on the host.
- **Storage:** a 2 GB upload needs that much free space on the host phone.
- **Network:** guest or public Wi-Fi often stops devices from seeing each other. Traffic is plain `http://`, so use a home network or hotspot with a password.
- **Stopping** ends all sessions; devices join again with a new code.
- The APK is about 60 MB because it includes Node (arm64-v8a, armeabi-v7a, x86_64).

## Troubleshooting
- **Other device can't connect:** same Wi-Fi? Try the hotspot instead.
- **"Code expired":** tap **Add a device** again.
- **Server stopped by itself:** check battery settings, and the 6-hour limit on Android 15+.
- **Build fails:** check JDK 21 and that NDK and CMake are installed. The `capacitor-nodejs` plugin used for Node is a beta release and needs Capacitor 8.
- **Original (PC) version:** see `ORIGINAL-README.md`.
