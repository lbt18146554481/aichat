import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, persistLang, type Lang } from "@/lib/i18n";

const LANG_LABEL: Record<Lang, string> = {
  en: "EN",
  "zh-CN": "简",
  "zh-Hant": "繁",
};

const LANG_NAME: Record<Lang, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-Hant": "繁體中文",
};

export function LangSwitcher() {
  const { i18n } = useTranslation();
  // Avoid hydration mismatch: render the SSR default until mounted,
  // then reflect the user's actual selected language.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = (mounted ? (i18n.resolvedLanguage as Lang) : "en") ?? "en";

  return (
    <div className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-border bg-card p-0.5 text-xs">
      {SUPPORTED_LANGS.map((lang) => {
        const active = lang === current;
        return (
          <button
            key={lang}
            onClick={() => {
              i18n.changeLanguage(lang);
              persistLang(lang);
            }}
            aria-label={`Language: ${LANG_NAME[lang]}`}
            className={`px-1.5 py-1 rounded-[5px] font-mono transition-colors ${
              active ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {LANG_LABEL[lang]}
          </button>
        );
      })}
    </div>
  );
}
