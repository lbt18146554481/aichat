/**
 * Structured wish location shared by browse / publish / matchmaker.
 *
 * Five-part model:
 * - placeMode: online | offline | any
 * - country / admin1 / city / detail: specific id/label | "any" | unset
 *
 * Legacy placeOnline / placeFlex are migrated on read via normalizePlaceSpec.
 */

import {
  formatPlace,
  parsePlace,
  type GeoPlace,
} from "./geo";
import type { SideLang } from "./wish-types";

/** Sentinel: user said this level is unrestricted. */
export const PLACE_ANY = "any" as const;
export type PlaceAny = typeof PLACE_ANY;

export type PlaceMode = "online" | "offline" | "any";

/** Geographic level: concrete value, unrestricted, or not collected. */
export type PlaceLevel = string | PlaceAny | null | undefined;

export type WishPlaceLabels = {
  country?: string;
  admin1?: string;
  city?: string;
  detail?: string;
};

export type WishPlace = {
  continent?: string;
  country?: PlaceLevel;
  admin1?: PlaceLevel;
  city?: PlaceLevel;
  detail?: PlaceLevel;
  labels?: WishPlaceLabels;
};

export type PlaceSpec = {
  placeMode: PlaceMode;
  place: WishPlace | null;
};

export type PlaceFields = {
  placeMode?: PlaceMode;
  placeOnline?: boolean;
  placeFlex?: boolean;
  placeRaw?: string;
  place?: WishPlace | null;
  city?: string;
  city_zh?: string;
  ownerCity?: string;
  ownerCity_zh?: string;
};

export const PLACE_ONLINE_RE =
  /^(线上|远程|网上|online|virtual|remote)$/i;

/** @deprecated prefer LLM extract + PLACE_ANY levels; kept for form shortcuts */
export const PLACE_FLEX_RE =
  /不限地点|地点不限|哪里都行|哪都行|不挑地点|不限|随便|anywhere|any place|no preference|doesn't matter where/i;

const GARBAGE_PLACE_RE =
  /^[\s\d\p{P}\p{S}]+$/u;

export function isPlaceAny(value: PlaceLevel): boolean {
  if (value == null) return false;
  const t = String(value).trim().toLowerCase();
  return t === PLACE_ANY || t === "不限" || t === "anywhere";
}

export function isPlaceLevelSet(value: PlaceLevel): boolean {
  return value != null && String(value).trim() !== "";
}

export function isPlaceLevelSpecific(value: PlaceLevel): boolean {
  return isPlaceLevelSet(value) && !isPlaceAny(value);
}

export function isPlaceOnlineText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return PLACE_ONLINE_RE.test(t);
}

/** @deprecated use PLACE_ANY on city (or placeMode any) */
export function isPlaceFlexText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isPlaceOnlineText(t)) return false;
  return PLACE_FLEX_RE.test(t);
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

function cityFromLegacyLabels(item: PlaceFields): string | undefined {
  const raw =
    item.place?.city ||
    item.city?.trim() ||
    item.city_zh?.trim() ||
    item.ownerCity?.trim() ||
    item.ownerCity_zh?.trim() ||
    "";
  if (!raw || isPlaceAny(raw)) return isPlaceAny(raw) ? PLACE_ANY : undefined;
  // Skip display junk like "北京 · 北京 · 北京"
  if (raw.includes("·")) {
    const first = raw.split("·")[0]?.trim();
    if (first) {
      const p = parsePlace(first);
      if (p?.city) return p.city;
      return first;
    }
  }
  const p = parsePlace(raw);
  return p?.city || raw;
}

/**
 * Normalize draft/intent place fields into PlaceSpec.
 * Legacy: placeOnline → mode online; placeFlex → offline + city any.
 */
export function normalizePlaceSpec(item: PlaceFields): PlaceSpec {
  if (item.placeMode === "online" || item.placeMode === "offline" || item.placeMode === "any") {
    return {
      placeMode: item.placeMode,
      place: item.placeMode === "online" ? null : item.place ?? null,
    };
  }
  if (item.placeOnline === true || isPlaceOnlineText(item.placeRaw ?? "")) {
    return { placeMode: "online", place: null };
  }
  if (item.placeFlex === true || isPlaceFlexText(item.placeRaw ?? "")) {
    return { placeMode: "offline", place: { city: PLACE_ANY } };
  }
  const place = item.place ? { ...item.place } : null;
  if (place && !isPlaceLevelSet(place.city)) {
    const c = cityFromLegacyLabels(item);
    if (c) place.city = c;
  }
  if (!place) {
    const c = cityFromLegacyLabels(item);
    if (c) return { placeMode: "offline", place: { city: c } };
    return { placeMode: "offline", place: null };
  }
  return { placeMode: "offline", place };
}

/** @deprecated prefer normalizePlaceSpec(...).placeMode === "online" */
export function resolvePlaceOnline(item: PlaceFields): boolean {
  return normalizePlaceSpec(item).placeMode === "online";
}

export function normalizeWishPlaceFromExtract(json: {
  placeMode?: string | null;
  placeOnline?: boolean;
  placeFlex?: boolean;
  country?: string | null;
  admin1?: string | null;
  city?: string | null;
  detail?: string | null;
  detailLabel?: string | null;
  detailLabel_zh?: string | null;
}): PlaceSpec & { placeOnline: boolean; placeFlex: boolean } {
  const modeRaw = (json.placeMode || "").trim().toLowerCase();
  if (modeRaw === "online" || json.placeOnline) {
    return { placeMode: "online", place: null, placeOnline: true, placeFlex: false };
  }
  if (modeRaw === "any") {
    return {
      placeMode: "any",
      place: { city: PLACE_ANY },
      placeOnline: false,
      placeFlex: true,
    };
  }

  const level = (v: string | null | undefined): PlaceLevel => {
    if (v == null) return undefined;
    const t = String(v).trim();
    if (!t) return undefined;
    if (isPlaceAny(t)) return PLACE_ANY;
    return t;
  };

  const countryIn = level(json.country);
  const admin1In = level(json.admin1);
  const cityIn = level(json.city);
  const detailIn = level(json.detailLabel_zh || json.detailLabel || json.detail);

  if (
    json.placeFlex ||
    (isPlaceAny(cityIn) && !isPlaceLevelSpecific(countryIn) && !isPlaceLevelSpecific(admin1In))
  ) {
    return {
      placeMode: "offline",
      place: { city: PLACE_ANY, detail: isPlaceAny(detailIn) ? PLACE_ANY : detailIn },
      placeOnline: false,
      placeFlex: true,
    };
  }

  const parts: WishPlace = {};
  if (isPlaceAny(countryIn)) parts.country = PLACE_ANY;
  else if (countryIn) {
    const p = parsePlace(countryIn);
    if (p?.country) parts.country = p.country;
    if (p?.continent) parts.continent = p.continent;
    else parts.country = countryIn;
  }
  if (isPlaceAny(admin1In)) parts.admin1 = PLACE_ANY;
  else if (admin1In) {
    const p = parsePlace(admin1In);
    if (p?.admin1) parts.admin1 = p.admin1;
    if (p?.country) parts.country = p.country;
    if (p?.continent) parts.continent = p.continent;
    else if (!parts.admin1) parts.admin1 = admin1In;
  }
  if (isPlaceAny(cityIn)) parts.city = PLACE_ANY;
  else if (cityIn) {
    const p = parsePlace(cityIn);
    if (p?.city) parts.city = p.city;
    if (p?.admin1) parts.admin1 = parts.admin1 ?? p.admin1;
    if (p?.country) parts.country = parts.country ?? p.country;
    if (p?.continent) parts.continent = parts.continent ?? p.continent;
    else if (!parts.city) parts.city = cityIn;
  }
  if (isPlaceAny(detailIn)) parts.detail = PLACE_ANY;
  else if (detailIn) parts.detail = detailIn;

  if (parts.country || parts.admin1 || parts.city || parts.detail) {
    parts.labels = {
      country: json.country ? String(json.country) : undefined,
      admin1: json.admin1 ? String(json.admin1) : undefined,
      city: json.city ? String(json.city) : undefined,
      detail: detailIn && !isPlaceAny(detailIn) ? String(detailIn) : undefined,
    };
    const flex = isPlaceAny(parts.city);
    return {
      placeMode: "offline",
      place: parts,
      placeOnline: false,
      placeFlex: flex,
    };
  }

  return { placeMode: "offline", place: null, placeOnline: false, placeFlex: false };
}

export function isPlacePublishable(opts: {
  placeRaw: string;
  placeMode?: PlaceMode;
  placeOnline?: boolean;
  placeFlex?: boolean;
  place: WishPlace | null;
}): boolean {
  const spec = normalizePlaceSpec(opts);
  if (spec.placeMode === "online" || spec.placeMode === "any") return true;
  if (isPlaceAny(spec.place?.city)) return true;
  const raw = opts.placeRaw.trim();
  if (!raw) return false;
  if (GARBAGE_PLACE_RE.test(raw)) return false;
  if (raw.length < 2) return false;

  const p = spec.place;
  if (!p) return false;
  if (isPlaceLevelSpecific(p.country) || isPlaceLevelSpecific(p.admin1)) return true;
  if (isPlaceLevelSpecific(p.city)) {
    const geo: GeoPlace = {
      continent: p.continent,
      country: isPlaceLevelSpecific(p.country) ? String(p.country) : undefined,
      admin1: isPlaceLevelSpecific(p.admin1) ? String(p.admin1) : undefined,
      city: String(p.city),
    };
    if (!isResolvablePlace(geo) && !/[\u4e00-\u9fff]/.test(String(p.city))) {
      // allow non-catalog cities if they look like real names (CJK) or known slug
      if (!/^[a-z][a-z0-9_]*$/i.test(String(p.city))) return false;
    }
    return true;
  }
  return false;
}

/** City (or city=any / online / mode any) required for publish/browse place dimension. */
export function isPlaceClarifyComplete(item: PlaceFields): boolean {
  const spec = normalizePlaceSpec(item);
  if (spec.placeMode === "online" || spec.placeMode === "any") return true;
  return isPlaceLevelSet(spec.place?.city);
}

export function resolvePlaceRaw(
  draftPlaceRaw: string | undefined,
  legacyCity: string | undefined,
  profileCity: string | undefined,
): string {
  const raw = draftPlaceRaw?.trim() || legacyCity?.trim() || "";
  if (raw) return raw;
  return profileCity?.trim() || "";
}

function formatLevel(
  value: PlaceLevel,
  label: string | undefined,
  lang: SideLang,
  asGeo: GeoPlace,
): string | null {
  if (!isPlaceLevelSet(value)) return null;
  if (isPlaceAny(value)) return lang === "zh-CN" ? "不限" : "any";
  if (label?.trim()) return label.trim();
  return formatPlace(asGeo, lang) || String(value);
}

export function formatWishPlace(fields: PlaceFields, lang: SideLang): string {
  const spec = normalizePlaceSpec(fields);
  const placeRaw = (fields.placeRaw || "").trim();
  if (spec.placeMode === "online") return lang === "zh-CN" ? "线上" : "Online";
  if (spec.placeMode === "any") return lang === "zh-CN" ? "地点不限" : "anywhere";
  const p = spec.place;
  if (!p) {
    if (fields.placeFlex) return lang === "zh-CN" ? "地点不限" : "anywhere";
    return placeRaw;
  }
  if (isPlaceAny(p.city) && !isPlaceLevelSpecific(p.country) && !isPlaceLevelSpecific(p.admin1)) {
    return lang === "zh-CN" ? "地点不限" : "anywhere";
  }
  const zh = lang === "zh-CN";
  const bits: string[] = [];
  const country = formatLevel(p.country, p.labels?.country, lang, { country: String(p.country || "") });
  const admin1 = formatLevel(p.admin1, p.labels?.admin1, lang, {
    admin1: String(p.admin1 || ""),
    country: isPlaceLevelSpecific(p.country) ? String(p.country) : undefined,
  });
  const city = formatLevel(p.city, p.labels?.city, lang, {
    city: String(p.city || ""),
    country: isPlaceLevelSpecific(p.country) ? String(p.country) : undefined,
    admin1: isPlaceLevelSpecific(p.admin1) ? String(p.admin1) : undefined,
  });
  const detail = formatLevel(p.detail, p.labels?.detail, lang, {});
  if (country) bits.push(country);
  if (admin1) bits.push(admin1);
  if (city) bits.push(city);
  if (detail && !bits.some((b) => detail.includes(b))) bits.push(detail);
  const line = bits.filter(Boolean).join(zh ? " · " : " · ");
  return line || placeRaw;
}

/** Derive hardFilters.cities ids from structured place (empty when online/any/city any). */
export function citiesFromPlaceFields(fields: PlaceFields): string[] {
  const spec = normalizePlaceSpec(fields);
  if (spec.placeMode === "online" || spec.placeMode === "any") return [];
  if (isPlaceAny(spec.place?.city)) return [];
  const city = spec.place?.city;
  if (!isPlaceLevelSpecific(city)) return [];
  const p = parsePlace(String(city));
  if (p?.city) return [p.city];
  // Non-catalog city label — leave empty; matching uses place levels / sameCity labels.
  return [];
}

export function cityLabelsFromPlace(
  place: WishPlace | null,
  placeRaw: string,
  lang: SideLang,
): { city: string; city_zh: string } {
  if (place && isPlaceAny(place.city)) {
    return {
      city: lang === "zh-CN" ? "地点不限" : "anywhere",
      city_zh: "地点不限",
    };
  }
  const display = formatWishPlace({ place, placeRaw }, lang);
  const zh = formatWishPlace({ place, placeRaw }, "zh-CN");
  return {
    city: lang === "zh-CN" ? zh : display,
    city_zh: zh || display,
  };
}

function levelIdsEqual(a: PlaceLevel, b: PlaceLevel): boolean {
  if (!isPlaceLevelSpecific(a) || !isPlaceLevelSpecific(b)) return false;
  const pa = parsePlace(String(a));
  const pb = parsePlace(String(b));
  if (pa?.city && pb?.city) return pa.city === pb.city;
  if (pa?.admin1 && pb?.admin1 && !pa.city && !pb.city) return pa.admin1 === pb.admin1;
  if (pa?.country && pb?.country && !pa.admin1 && !pb.admin1) return pa.country === pb.country;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** Hard-equal only when both sides have a specific value; any/unset skips the level. */
export function placeLevelsHardCompatible(a: PlaceLevel, b: PlaceLevel): boolean {
  if (!isPlaceLevelSpecific(a) || !isPlaceLevelSpecific(b)) return true;
  return levelIdsEqual(a, b);
}

export function passesPlaceModeHardFilter(mine: PlaceFields, other: PlaceFields): boolean {
  const a = normalizePlaceSpec(mine).placeMode;
  const b = normalizePlaceSpec(other).placeMode;
  if (a === "any" || b === "any") return true;
  return a === b;
}

/**
 * Geographic hard filter: compare country → admin1 → city when both specific.
 * Detail is NOT a hard gate (soft score elsewhere).
 */
export function passesPlaceGeoHardFilter(
  mine: PlaceFields,
  other: PlaceFields,
  respectCity: boolean,
  sameCityFn?: (a: PlaceFields, b: PlaceFields) => boolean,
): boolean {
  if (!respectCity) return true;
  const a = normalizePlaceSpec(mine);
  const b = normalizePlaceSpec(other);
  if (a.placeMode === "online" || b.placeMode === "online") return true;
  if (a.placeMode === "any" || b.placeMode === "any") return true;

  const ap = a.place;
  const bp = b.place;
  if (!placeLevelsHardCompatible(ap?.country, bp?.country)) return false;
  if (!placeLevelsHardCompatible(ap?.admin1, bp?.admin1)) return false;
  if (!placeLevelsHardCompatible(ap?.city, bp?.city)) return false;

  // Both cities specific but failed above → already false. If either city unset,
  // fall back to legacy sameCity when available so old intents still match.
  if (
    !isPlaceLevelSpecific(ap?.city) &&
    !isPlaceLevelSpecific(bp?.city) &&
    sameCityFn &&
    !isPlaceAny(ap?.city) &&
    !isPlaceAny(bp?.city)
  ) {
    return sameCityFn(mine, other);
  }
  return true;
}

/** @deprecated use passesPlaceGeoHardFilter */
export function passesOfflinePlaceHardFilter(
  mine: PlaceFields,
  other: PlaceFields,
  respectCity: boolean,
  sameCityFn: (a: PlaceFields, b: PlaceFields) => boolean,
): boolean {
  return passesPlaceGeoHardFilter(mine, other, respectCity, sameCityFn);
}

/** Soft bonus when both sides share a specific detail. */
export function placeDetailSoftScore(mine: PlaceFields, other: PlaceFields): number {
  const a = normalizePlaceSpec(mine).place?.detail;
  const b = normalizePlaceSpec(other).place?.detail;
  if (!isPlaceLevelSpecific(a) || !isPlaceLevelSpecific(b)) return 0;
  const as = String(a).trim().toLowerCase();
  const bs = String(b).trim().toLowerCase();
  if (as === bs) return 8;
  if (as.includes(bs) || bs.includes(as)) return 4;
  return 0;
}

/** Persist helpers: mirror new model into legacy booleans for older readers. */
export function legacyFlagsFromSpec(spec: PlaceSpec): {
  placeOnline: boolean;
  placeFlex: boolean;
  placeMode: PlaceMode;
  place: WishPlace | null;
} {
  return {
    placeMode: spec.placeMode,
    place: spec.place,
    placeOnline: spec.placeMode === "online",
    placeFlex: spec.placeMode === "any" || isPlaceAny(spec.place?.city),
  };
}
