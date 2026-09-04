/**
 * Structured wish location: free-text input → hierarchical place at publish.
 *
 * Two-tier model:
 * 1. placeOnline — online vs offline (hard match gate)
 * 2. offline only — placeFlex (any physical place) or structured place
 */

import {
  formatPlace,
  parsePlace,
  type GeoPlace,
} from "./geo";
import type { SideLang } from "./wish-types";

export type WishPlaceLabels = {
  country?: string;
  admin1?: string;
  city?: string;
  detail?: string;
};

export type WishPlace = GeoPlace & {
  detail?: string;
  labels?: WishPlaceLabels;
};

export const PLACE_ONLINE_RE =
  /^(线上|远程|网上|online|virtual|remote)$/i;

export const PLACE_FLEX_RE =
  /不限地点|地点不限|哪里都行|哪都行|不挑地点|不限|同城|随便|anywhere|any place|no preference|doesn't matter where/i;

const GARBAGE_PLACE_RE =
  /^[\s\d\p{P}\p{S}]+$/u;

export function isPlaceOnlineText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return PLACE_ONLINE_RE.test(t);
}

export function isPlaceFlexText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isPlaceOnlineText(t)) return false;
  return PLACE_FLEX_RE.test(t);
}

/** Resolve online flag from stored intent/draft (back-compat via placeRaw). */
export function resolvePlaceOnline(item: {
  placeOnline?: boolean;
  placeRaw?: string;
}): boolean {
  if (item.placeOnline === true) return true;
  if (item.placeOnline === false) return false;
  return isPlaceOnlineText(item.placeRaw ?? "");
}

function isResolvablePlace(p: GeoPlace): boolean {
  if (p.country || p.admin1 || p.continent) return true;
  if (!p.city) return false;
  return /^[a-z][a-z0-9_]*$/.test(p.city);
}

/** Find a catalog place mentioned inside free text (longest alias wins). */
export function findPlaceInText(text: string): WishPlace | null {
  const raw = text.trim();
  if (!raw) return null;

  const exact = parsePlace(raw);
  if (exact && isResolvablePlace(exact)) {
    return { ...exact, labels: labelsFromGeo(exact, raw) };
  }

  for (let len = 2; len <= Math.min(raw.length, 8); len++) {
    const prefix = raw.slice(0, len);
    const p = parsePlace(prefix);
    if (p && isResolvablePlace(p)) {
      const merged: WishPlace = { ...p, labels: labelsFromGeo(p, raw) };
      const detail = extractDetail(raw, prefix);
      if (detail) merged.detail = detail;
      return merged;
    }
  }

  let best: { alias: string; place: WishPlace } | null = null;

  for (const part of raw.split(/[，,、\s/]+/).filter(Boolean)) {
    const p = parsePlace(part);
    if (p && (p.country || p.admin1 || p.city)) {
      const merged: WishPlace = { ...p, labels: labelsFromGeo(p, raw) };
      const detail = extractDetail(raw, part);
      if (detail) merged.detail = detail;
      if (!best || part.length > best.alias.length) {
        best = { alias: part, place: merged };
      }
    }
  }

  if (best) {
    const detail = extractDetail(raw, best.alias);
    return detail ? { ...best.place, detail } : best.place;
  }

  return null;
}

function labelsFromGeo(place: GeoPlace, raw: string): WishPlaceLabels {
  const label = formatPlace(place, "zh-CN") || formatPlace(place, "en");
  return {
    country: place.country ? label : undefined,
    admin1: place.admin1 ? label : undefined,
    city: place.city ? label : undefined,
    detail: raw,
  };
}

function extractDetail(full: string, matchedPart: string): string | undefined {
  const rest = full
    .replace(new RegExp(matchedPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "")
    .replace(/^[，,、\s]+|[，,、\s]+$/g, "")
    .trim();
  return rest.length >= 2 ? rest : undefined;
}

export function normalizeWishPlaceFromExtract(json: {
  placeOnline?: boolean;
  placeFlex?: boolean;
  country?: string | null;
  admin1?: string | null;
  city?: string | null;
  detail?: string | null;
  detailLabel?: string | null;
  detailLabel_zh?: string | null;
}): { placeOnline: boolean; placeFlex: boolean; place: WishPlace | null } {
  if (json.placeOnline) return { placeOnline: true, placeFlex: false, place: null };
  if (json.placeFlex) return { placeOnline: false, placeFlex: true, place: null };

  const parts: WishPlace = {};
  if (json.country) {
    const p = parsePlace(json.country);
    if (p?.country) parts.country = p.country;
    if (p?.continent) parts.continent = p.continent;
  }
  if (json.admin1) {
    const p = parsePlace(json.admin1);
    if (p?.admin1) parts.admin1 = p.admin1;
    if (p?.country) parts.country = p.country;
    if (p?.continent) parts.continent = p.continent;
  }
  if (json.city) {
    const p = parsePlace(json.city);
    if (p?.city) parts.city = p.city;
    if (p?.admin1) parts.admin1 = p.admin1;
    if (p?.country) parts.country = p.country;
    if (p?.continent) parts.continent = p.continent;
  }

  const detail = (json.detailLabel_zh || json.detailLabel || json.detail || "").trim();
  if (detail) parts.detail = detail;

  if (parts.country || parts.admin1 || parts.city) {
    parts.labels = {
      country: json.country ? String(json.country) : undefined,
      admin1: json.admin1 ? String(json.admin1) : undefined,
      city: json.city ? String(json.city) : undefined,
      detail: detail || undefined,
    };
    return { placeOnline: false, placeFlex: false, place: parts };
  }

  return { placeOnline: false, placeFlex: false, place: null };
}

export function isPlacePublishable(opts: {
  placeRaw: string;
  placeOnline?: boolean;
  placeFlex: boolean;
  place: WishPlace | null;
}): boolean {
  if (opts.placeOnline) return true;
  if (opts.placeFlex) return true;
  const raw = opts.placeRaw.trim();
  if (!raw) return false;
  if (GARBAGE_PLACE_RE.test(raw)) return false;
  if (raw.length < 2) return false;

  const p = opts.place;
  if (!p) return false;
  if (p.country || p.admin1) return true;
  if (p.city) {
    if (!isResolvablePlace(p)) return false;
    if (p.detail && p.detail.length >= 2) return true;
    return true;
  }
  if (p.detail && p.detail.length >= 2 && (p.country || p.admin1)) return true;
  return false;
}

export function resolvePlaceRaw(draftPlaceRaw: string | undefined, legacyCity: string | undefined, profileCity: string | undefined): string {
  const raw = draftPlaceRaw?.trim() || legacyCity?.trim() || "";
  if (raw) return raw;
  return profileCity?.trim() || "";
}

export function formatWishPlace(
  place: WishPlace | null | undefined,
  placeRaw: string,
  placeFlex: boolean,
  lang: SideLang,
  placeOnline = false,
): string {
  if (placeOnline) return lang === "zh-CN" ? "线上" : "Online";
  if (placeFlex) return lang === "zh-CN" ? "地点不限" : "anywhere";
  if (!place) return placeRaw.trim();
  const zh = lang === "zh-CN";
  const bits: string[] = [];
  if (place.labels?.country) bits.push(place.labels.country);
  else if (place.country) bits.push(formatPlace({ country: place.country }, lang));

  if (place.labels?.admin1) bits.push(place.labels.admin1);
  else if (place.admin1) bits.push(formatPlace({ admin1: place.admin1, country: place.country }, lang));

  if (place.labels?.city) bits.push(place.labels.city);
  else if (place.city) bits.push(formatPlace({ city: place.city, country: place.country, admin1: place.admin1 }, lang));

  const detail = place.labels?.detail || place.detail;
  if (detail && !bits.some((b) => detail.includes(b))) bits.push(detail);

  const line = bits.filter(Boolean).join(zh ? " · " : " · ");
  return line || placeRaw.trim();
}

export function cityLabelsFromPlace(
  place: WishPlace | null,
  placeRaw: string,
  lang: SideLang,
): { city: string; city_zh: string } {
  const display = formatWishPlace(place, placeRaw, false, lang);
  const zh = formatWishPlace(place, placeRaw, false, "zh-CN");
  return {
    city: lang === "zh-CN" ? zh : display,
    city_zh: zh || display,
  };
}

/** Hard filter: offline wishes must align on city unless either side is place-flex. */
export function passesOfflinePlaceHardFilter(
  mine: { placeFlex?: boolean; city?: string; city_zh?: string; ownerCity?: string; ownerCity_zh?: string },
  other: { placeFlex?: boolean; city?: string; city_zh?: string; ownerCity?: string; ownerCity_zh?: string },
  respectCity: boolean,
  sameCityFn: (a: typeof mine, b: typeof other) => boolean,
): boolean {
  if (mine.placeFlex || other.placeFlex) return true;
  if (!respectCity) return true;
  return sameCityFn(mine, other);
}
