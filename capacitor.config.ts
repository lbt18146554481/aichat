import { CapacitorConfig } from "@capacitor/cli";

// Route A: the iOS shell loads the production website instead of an embedded SPA.
// Override with CAP_SERVER_URL=... for local debugging (e.g. http://127.0.0.1:3000).
const serverUrl = process.env.CAP_SERVER_URL?.trim() || "https://pelegant.info";

const config: CapacitorConfig = {
  appId: "app.lovable.maitri",
  appName: "Maitri",
  // Still required by `cap sync` even when server.url is set.
  webDir: "native/www",
  ios: {
    path: "native/ios",
    contentInset: "always",
  },
  android: {
    path: "native/android",
  },
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    androidScheme: "https",
    iosScheme: "capacitor",
    // Keep in-app navigation on our host (OAuth redirects may need expanding later).
    allowNavigation: ["pelegant.info", "www.pelegant.info"],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0F172A",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0F172A",
      overlaysWebView: false,
    },
  },
};

export default config;
