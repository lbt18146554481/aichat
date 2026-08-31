import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "../locales/en/common.json";
import zhCN from "../locales/zh-CN/common.json";

export const SUPPORTED_LANGS = ["en", "zh-CN"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const LANG_STORAGE_KEY = "kindred:lang";

let initialized = false;

function readPersistedLang(): Lang | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && (SUPPORTED_LANGS as readonly string[]).includes(saved)) {
      return saved as Lang;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function initI18n() {
  if (initialized) return i18n;
  initialized = true;

  // Server: always English. Client: restore saved preference synchronously
  // so the first interactive render uses the right language.
  const lng = readPersistedLang() ?? "en";

  i18n.use(initReactI18next).init({
    resources: {
      en: { common: en },
      "zh-CN": { common: zhCN },
    },
    lng,
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    load: "currentOnly",
    defaultNS: "common",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

  return i18n;
}

export function applyPersistedLang() {
  if (typeof window === "undefined") return;
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (
      saved &&
      saved !== i18n.language &&
      (SUPPORTED_LANGS as readonly string[]).includes(saved)
    ) {
      i18n.changeLanguage(saved);
    }
  } catch {
    /* ignore */
  }
}

export function persistLang(lang: Lang) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

export default i18n;
