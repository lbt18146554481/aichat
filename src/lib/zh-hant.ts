import * as OpenCC from "opencc-js";

let convert: ((text: string) => string) | null = null;

export function isZhHant(lang: string | null | undefined): boolean {
  if (!lang) return false;
  const tag = lang.toLowerCase();
  return tag === "zh-hant" || tag === "zh-tw" || tag === "zh-hk" || tag.startsWith("zh-hant-");
}

/** Simplified Chinese → Traditional Chinese. Latin and digits stay as they are. */
export function toTraditional(text: string): string {
  if (!text) return text;
  convert ??= OpenCC.Converter({ from: "cn", to: "tw" });
  return convert(text);
}

/** Convert Chinese copy only while the UI locale is Traditional. */
export function displayZh(lang: string | null | undefined, text: string): string {
  if (!text || !isZhHant(lang)) return text;
  return toTraditional(text);
}
