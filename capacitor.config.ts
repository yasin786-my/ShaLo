import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shalo.app',
  appName: 'ShaLo',
  webDir: 'www',
  server: {
    androidScheme: 'https',          // control screen lives at https://localhost
    cleartext: true,
    // The ShaLo web interface is served by the Node server on the phone itself.
    allowNavigation: ['127.0.0.1']
  },
  android: {
    appendUserAgent: 'ShaLoApp',      // lets index.html know it runs inside the app
    allowMixedContent: true
  },
  plugins: {
    // Node is started by our own foreground service (separate process),
    // never by the plugin inside the UI process.
    CapacitorNodeJS: { startMode: 'manual', nodeDir: 'nodejs' }
  }
};

export default config;
