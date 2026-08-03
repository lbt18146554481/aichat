export type Platform = "web" | "ios" | "android";

export interface PlatformCapabilities {
  /** Open a URL in the system browser (Safari / Chrome). */
  openExternal(url: string): Promise<void> | void;
  /** Set the status bar text style. */
  setStatusBar(style: "dark" | "light"): Promise<void> | void;
  /** Hide the native splash screen once the app is ready. */
  hideSplash(): Promise<void> | void;
  /** Register a native back-button handler. Return true to consume the event. */
  addBackListener(handler: () => boolean): () => void;
}

export const platform: PlatformCapabilities = {
  openExternal: (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  },
  setStatusBar: () => {},
  hideSplash: () => {},
  addBackListener: () => () => {},
};

export function getPlatform(): Platform {
  if (typeof window === "undefined") return "web";
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  if (cap?.getPlatform) {
    const p = cap.getPlatform();
    if (p === "ios") return "ios";
    if (p === "android") return "android";
  }
  return "web";
}

export function isNativePlatform(): boolean {
  return typeof window !== "undefined" && "Capacitor" in window;
}

export function isIOS(): boolean {
  return getPlatform() === "ios";
}

export function isAndroid(): boolean {
  return getPlatform() === "android";
}
