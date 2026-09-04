/** UI / LLM language helpers — keep EN and ZH display paths strictly separate. */

export type AppLang = "en" | "zh-CN";

export function isZh(lang: string | null | undefined): boolean {
  return lang === "zh-CN" || lang === "zh";
}

/** Normalize any i18n language tag to our two app langs. Default: English. */
export function normalizeLang(lang: string | null | undefined): AppLang {
  return isZh(lang) ? "zh-CN" : "en";
}

/**
 * Pick a bilingual field for display.
 * - EN mode: English only (never fall back to Chinese copy).
 * - ZH mode: Chinese, then English if ZH empty.
 */
export function pickLocaleText(
  lang: string | null | undefined,
  en: string | null | undefined,
  zh: string | null | undefined,
): string {
  const e = (en ?? "").trim();
  const z = (zh ?? "").trim();
  if (isZh(lang)) return z || e;
  return e;
}

/** Bilingual string list — ZH falls back to EN; EN never shows ZH-only items. */
export function pickLocaleList(
  lang: string | null | undefined,
  en: string[] | null | undefined,
  zh: string[] | null | undefined,
): string[] {
  const e = en ?? [];
  const z = zh ?? [];
  if (isZh(lang)) return z.length > 0 ? z : e;
  return e;
}
