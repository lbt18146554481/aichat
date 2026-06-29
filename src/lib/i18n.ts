import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "../locales/en/common.json";
import zhCN from "../locales/zh-CN/common.json";

export const SUPPORTED_LANGS = ["en", "zh-CN"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

let initialized = false;

export function initI18n() {
  if (initialized) return i18n;
  initialized = true;

  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { common: en },
        "zh-CN": { common: zhCN },
      },
      fallbackLng: "en",
      supportedLngs: SUPPORTED_LANGS as unknown as string[],
      load: "currentOnly",
      defaultNS: "common",
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        lookupLocalStorage: "kindred:lang",
        caches: ["localStorage"],
      },
      react: { useSuspense: false },
    });

  return i18n;
}

export function normalizeLang(raw: string | undefined): Lang {
  if (!raw) return "en";
  const lower = raw.toLowerCase();
  if (lower.startsWith("zh")) return "zh-CN";
  return "en";
}

export default i18n;
