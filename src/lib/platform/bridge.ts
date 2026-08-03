import { platform, type PlatformCapabilities } from "./index";

let nativePlatform: PlatformCapabilities | null = null;

async function initNativePlatform(): Promise<PlatformCapabilities> {
  if (nativePlatform) return nativePlatform;

  const [{ App }, { Browser }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/browser"),
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
  ]);

  nativePlatform = {
    openExternal: async (url: string) => {
      await Browser.open({ url, presentationStyle: "popover" });
    },
    setStatusBar: async (style: "dark" | "light") => {
      await StatusBar.setStyle({ style: style === "dark" ? Style.Dark : Style.Light });
    },
    hideSplash: async () => {
      await SplashScreen.hide();
    },
    addBackListener: (handler: () => boolean) => {
      const cb = App.addListener("backButton", () => {
        if (!handler()) {
          void App.exitApp();
        }
      });
      return () => {
        void cb.then((l: import("@capacitor/core").PluginListenerHandle) => l.remove());
      };
    },
  };

  return nativePlatform;
}

export async function initPlatform(): Promise<void> {
  if (typeof window === "undefined" || !("Capacitor" in window)) return;

  try {
    const native = await initNativePlatform();
    Object.assign(platform, native);
    await platform.hideSplash();
  } catch (err) {
    // Fail-safe: never block app boot if a plugin fails to load.
    console.error("[platform] Native bridge initialization failed", err);
  }
}
