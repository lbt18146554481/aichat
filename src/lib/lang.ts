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
 * Detect the language the user is writing in (for LLM replies).
 * Not the UI locale toggle — CJK vs Latin heuristic on the message text.
 * Returns null when the text has no useful signal (empty / emoji-only / digits).
 */
export function detectReplyLangFromText(text: string): AppLang | null {
  const t = text.trim();
  if (!t) return null;
  const cjk = (t.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  if (cjk === 0 && latin === 0) return null;
  if (cjk >= 1 && cjk >= latin * 0.25) return "zh-CN";
  if (latin >= 2 && latin > cjk * 2) return "en";
  if (cjk > 0) return "zh-CN";
  if (latin > 0) return "en";
  return null;
}

/**
 * Resolve reply language from this turn's user text, then recent user history.
 * Fallback is product default (zh-CN) — never the UI language toggle.
 */
export function resolveReplyLang(opts: {
  userMessage?: string | null;
  seed?: string | null;
  history?: Array<{ role: string; content: string }>;
  fallback?: AppLang;
}): AppLang {
  const candidates: string[] = [];
  if (opts.userMessage?.trim()) candidates.push(opts.userMessage.trim());
  if (opts.seed?.trim()) candidates.push(opts.seed.trim());
  if (opts.history) {
    for (let i = opts.history.length - 1; i >= 0; i--) {
      const h = opts.history[i];
      if (h?.role === "user" && h.content?.trim()) candidates.push(h.content.trim());
    }
  }
  for (const c of candidates) {
    const d = detectReplyLangFromText(c);
    if (d) return d;
  }
  return opts.fallback ?? "zh-CN";
}

/**
 * Chinese system prompts stay Chinese; this line forces user-facing fields
 * (reply / suggestions / intro copy) to match the user's writing language.
 */
export function llmReplyLanguageRule(replyLang: AppLang): string {
  return replyLang === "zh-CN"
    ? "【输出语言】reply、suggestions 以及其它面向用户的文案用简体中文。"
    : "【输出语言】reply、suggestions 以及其它面向用户的文案必须用英文（JSON 键名与 fieldKey 等机器字段保持英文原样）。";
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
