import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, persistLang, type Lang } from "@/lib/i18n";

export function LangSwitcher() {
  const { i18n } = useTranslation();
  // Avoid hydration mismatch: render the SSR default until mounted,
  // then reflect the user's actual selected language.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = (mounted ? (i18n.resolvedLanguage as Lang) : "en") ?? "en";

  return (
    <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5 text-xs">
      {SUPPORTED_LANGS.map((lang) => {
        const active = lang === current;
        return (
          <button
            key={lang}
            onClick={() => {
              i18n.changeLanguage(lang);
              persistLang(lang);
            }}
            aria-label={`Language: ${lang === "zh-CN" ? "中文" : "English"}`}
            className={`px-2 py-1 rounded-[5px] font-mono transition-colors ${
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {lang === "zh-CN" ? "中" : "EN"}
          </button>
        );
      })}
    </div>
  );
}
