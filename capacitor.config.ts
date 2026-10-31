import { CapacitorConfig } from "@capacitor/cli";

// Route A: the iOS shell loads the production website instead of an embedded SPA.
// Override with CAP_SERVER_URL=... for local debugging (e.g. http://127.0.0.1:3000).
const serverUrl = process.env.CAP_SERVER_URL?.trim() || "https://compamore.com";

const config: CapacitorConfig = {
  appId: "app.lovable.compamore",
  appName: "Compamore",
  // Still required by `cap sync` even when server.url is set.
  webDir: "native/www",
  ios: {
    path: "native/ios",
    // automatic + viewport-fit=cover: CSS env(safe-area-*) owns insets.
    // "always" inset the WebView and left a native black strip under the home indicator.
    contentInset: "automatic",
  },
  android: {
    path: "native/android",
  },
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    androidScheme: "https",
    iosScheme: "capacitor",
    // Stay inside the App WebView for our site + OAuth hosts.
    // Domains not listed here are handed off to system Safari (that was breaking Google login).
    allowNavigation: [
      "compamore.com",
      "www.compamore.com",
      // Google Sign-In
      "accounts.google.com",
      "accounts.youtube.com",
      "www.google.com",
      "google.com",
      // Sign in with Apple (web)
      "appleid.apple.com",
      "idmsa.apple.com",
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#F7FAFC",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // Dark text on light Cloud White chrome
      style: "LIGHT",
      backgroundColor: "#F7FAFC",
      overlaysWebView: false,
    },
  },
};

export default config;
