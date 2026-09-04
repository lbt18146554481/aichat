/**
 * Hierarchical places: continent → country → admin1 (省/州) → city.
 * Matching: user filter at level L matches anyone whose place is L or finer under that node.
 * CN/EN aliases normalize to the same ids (中国 ≡ china ≡ cn).
 */

export type GeoPlace = {
  continent?: string;
  country?: string;
  admin1?: string;
  city?: string;
};

type CountryDef = {
  id: string;
  continent: string;
  aliases: string[];
  label_en: string;
  label_zh: string;
};

type CityDef = {
  id: string;
  country: string;
  admin1?: string;
  aliases: string[];
  label_en: string;
  label_zh: string;
};

function tok(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\u3000\s]+/g, " ")
    .replace(/[,.，。;；'"`]/g, "")
    .trim();
}

const CONTINENT_ALIASES: Record<string, string> = {
  asia: "asia",
  亚洲: "asia",
  europe: "europe",
  欧洲: "europe",
  "north america": "north_america",
  "northamerica": "north_america",
  北美: "north_america",
  北美洲: "north_america",
  "south america": "south_america",
  南美: "south_america",
  南美洲: "south_america",
  africa: "africa",
  非洲: "africa",
  oceania: "oceania",
  大洋洲: "oceania",
};

const COUNTRIES: CountryDef[] = [
  {
    id: "cn",
    continent: "asia",
    aliases: ["cn", "china", "prc", "中国", "中华人民共和国", "国内"],
    label_en: "China",
    label_zh: "中国",
  },
  {
    id: "pt",
    continent: "europe",
    aliases: ["pt", "portugal", "葡萄牙"],
    label_en: "Portugal",
    label_zh: "葡萄牙",
  },
  {
    id: "us",
    continent: "north_america",
    aliases: ["us", "usa", "united states", "america", "美国", "美利坚"],
    label_en: "United States",
    label_zh: "美国",
  },
  {
    id: "de",
    continent: "europe",
    aliases: ["de", "germany", "deutschland", "德国", "德意志"],
    label_en: "Germany",
    label_zh: "德国",
  },
  {
    id: "jp",
    continent: "asia",
    aliases: ["jp", "japan", "日本"],
    label_en: "Japan",
    label_zh: "日本",
  },
  {
    id: "mx",
    continent: "north_america",
    aliases: ["mx", "mexico", "墨西哥"],
    label_en: "Mexico",
    label_zh: "墨西哥",
  },
  {
    id: "il",
    continent: "asia",
    aliases: ["il", "israel", "以色列"],
    label_en: "Israel",
    label_zh: "以色列",
  },
  {
    id: "dk",
    continent: "europe",
    aliases: ["dk", "denmark", "丹麦"],
    label_en: "Denmark",
    label_zh: "丹麦",
  },
  {
    id: "ng",
    continent: "africa",
    aliases: ["ng", "nigeria", "尼日利亚"],
    label_en: "Nigeria",
    label_zh: "尼日利亚",
  },
  {
    id: "ar",
    continent: "south_america",
    aliases: ["ar", "argentina", "阿根廷"],
    label_en: "Argentina",
    label_zh: "阿根廷",
  },
  {
    id: "gb",
    continent: "europe",
    aliases: ["gb", "uk", "united kingdom", "britain", "england", "英国", "英格兰"],
    label_en: "United Kingdom",
    label_zh: "英国",
  },
  {
    id: "ca",
    continent: "north_america",
    aliases: ["ca", "canada", "加拿大"],
    label_en: "Canada",
    label_zh: "加拿大",
  },
  {
    id: "it",
    continent: "europe",
    aliases: ["it", "italy", "italia", "意大利"],
    label_en: "Italy",
    label_zh: "意大利",
  },
];

/** Provinces / states / municipalities (optional level). */
const ADMIN1: Array<{
  id: string;
  country: string;
  aliases: string[];
  label_en: string;
  label_zh: string;
}> = [
  {
    id: "beijing",
    country: "cn",
    aliases: ["beijing municipality", "北京市", "北京直辖市"],
    label_en: "Beijing",
    label_zh: "北京",
  },
  {
    id: "shanghai",
    country: "cn",
    aliases: ["shanghai municipality", "上海市", "上海直辖市"],
    label_en: "Shanghai",
    label_zh: "上海",
  },
  {
    id: "guangdong",
    country: "cn",
    aliases: ["guangdong", "广东", "广东省"],
    label_en: "Guangdong",
    label_zh: "广东",
  },
  {
    id: "california",
    country: "us",
    aliases: ["california", "ca state", "加州", "加利福尼亚"],
    label_en: "California",
    label_zh: "加州",
  },
  {
    id: "new_york",
    country: "us",
    aliases: ["new york state", "ny state", "纽约州"],
    label_en: "New York",
    label_zh: "纽约州",
  },
];

const CITIES: CityDef[] = [
  // China (for 中国 → city coverage when people exist)
  {
    id: "beijing",
    country: "cn",
    admin1: "beijing",
    aliases: ["beijing", "北京", "beijing city", "北平"],
    label_en: "Beijing",
    label_zh: "北京",
  },
  {
    id: "shanghai",
    country: "cn",
    admin1: "shanghai",
    aliases: ["shanghai", "上海"],
    label_en: "Shanghai",
    label_zh: "上海",
  },
  {
    id: "guangzhou",
    country: "cn",
    admin1: "guangdong",
    aliases: ["guangzhou", "广州", "canton"],
    label_en: "Guangzhou",
    label_zh: "广州",
  },
  {
    id: "shenzhen",
    country: "cn",
    admin1: "guangdong",
    aliases: ["shenzhen", "深圳"],
    label_en: "Shenzhen",
    label_zh: "深圳",
  },
  {
    id: "hangzhou",
    country: "cn",
    admin1: "zhejiang",
    aliases: ["hangzhou", "杭州"],
    label_en: "Hangzhou",
    label_zh: "杭州",
  },
  // Seed pool cities
  {
    id: "lisbon",
    country: "pt",
    aliases: ["lisbon", "lisboa", "里斯本"],
    label_en: "Lisbon",
    label_zh: "里斯本",
  },
  {
    id: "brooklyn",
    country: "us",
    admin1: "new_york",
    aliases: ["brooklyn", "布鲁克林"],
    label_en: "Brooklyn",
    label_zh: "布鲁克林",
  },
  {
    id: "berlin",
    country: "de",
    aliases: ["berlin", "柏林"],
    label_en: "Berlin",
    label_zh: "柏林",
  },
  {
    id: "kyoto",
    country: "jp",
    aliases: ["kyoto", "京都"],
    label_en: "Kyoto",
    label_zh: "京都",
  },
  {
    id: "mexico_city",
    country: "mx",
    aliases: ["mexico city", "mexico city mexico", "墨西哥城"],
    label_en: "Mexico City",
    label_zh: "墨西哥城",
  },
  {
    id: "tel_aviv",
    country: "il",
    aliases: ["tel aviv", "telaviv", "特拉维夫"],
    label_en: "Tel Aviv",
    label_zh: "特拉维夫",
  },
  {
    id: "copenhagen",
    country: "dk",
    aliases: ["copenhagen", "københavn", "哥本哈根"],
    label_en: "Copenhagen",
    label_zh: "哥本哈根",
  },
  {
    id: "lagos",
    country: "ng",
    aliases: ["lagos", "拉各斯"],
    label_en: "Lagos",
    label_zh: "拉各斯",
  },
  {
    id: "buenos_aires",
    country: "ar",
    aliases: ["buenos aires", "布宜诺斯艾利斯"],
    label_en: "Buenos Aires",
    label_zh: "布宜诺斯艾利斯",
  },
  {
    id: "edinburgh",
    country: "gb",
    aliases: ["edinburgh", "爱丁堡"],
    label_en: "Edinburgh",
    label_zh: "爱丁堡",
  },
  {
    id: "vancouver",
    country: "ca",
    aliases: ["vancouver", "温哥华"],
    label_en: "Vancouver",
    label_zh: "温哥华",
  },
  {
    id: "rome",
    country: "it",
    aliases: ["rome", "roma", "罗马"],
    label_en: "Rome",
    label_zh: "罗马",
  },
];

const countryByAlias = new Map<string, CountryDef>();
for (const c of COUNTRIES) {
  for (const a of c.aliases) countryByAlias.set(tok(a), c);
  countryByAlias.set(tok(c.id), c);
}

const admin1ByAlias = new Map<string, (typeof ADMIN1)[number]>();
for (const a of ADMIN1) {
  for (const al of a.aliases) admin1ByAlias.set(tok(al), a);
  admin1ByAlias.set(tok(a.id), a);
}

const cityByAlias = new Map<string, CityDef>();
for (const c of CITIES) {
  for (const a of c.aliases) cityByAlias.set(tok(a), c);
  cityByAlias.set(tok(c.id), c);
}

/** Venue / landmark phrases → city id (「朝阳公园」→ beijing, not opaque city). */
const LANDMARK_TO_CITY: Array<{ cityId: string; aliases: string[] }> = [
  {
    cityId: "beijing",
    aliases: [
      "朝阳公园",
      "chaoyang park",
      "奥林匹克森林公园",
      "奥森",
      "olympic forest park",
      "北海公园",
      "beihai park",
      "香山",
      "颐和园",
      "天坛",
      "故宫",
      "三里屯",
      "国贸",
      "中关村",
      "五道口",
      "望京",
    ],
  },
  {
    cityId: "shanghai",
    aliases: ["外滩", "the bund", "陆家嘴", "静安寺", "人民广场"],
  },
  {
    cityId: "shenzhen",
    aliases: ["深圳湾", "华强北"],
  },
];

const landmarkByAlias = new Map<string, CityDef>();
for (const row of LANDMARK_TO_CITY) {
  const city = cityByAlias.get(tok(row.cityId));
  if (!city) continue;
  for (const a of row.aliases) landmarkByAlias.set(tok(a), city);
}

function countryPlace(c: CountryDef): GeoPlace {
  return { continent: c.continent, country: c.id };
}

function cityPlace(c: CityDef): GeoPlace {
  const country = countryByAlias.get(c.country);
  return {
    continent: country?.continent,
    country: c.country,
    admin1: c.admin1,
    city: c.id,
  };
}

function resolveLandmark(t: string): CityDef | null {
  const exact = landmarkByAlias.get(t);
  if (exact) return exact;
  // Prefer longer aliases so「奥林匹克森林公园」wins over shorter tokens.
  let best: { city: CityDef; len: number } | null = null;
  for (const [alias, city] of landmarkByAlias) {
    if (alias.length < 2) continue;
    if (t.includes(alias) && (!best || alias.length > best.len)) {
      best = { city, len: alias.length };
    }
  }
  return best?.city ?? null;
}

function resolveCitySubstring(t: string): CityDef | null {
  let best: { city: CityDef; len: number } | null = null;
  for (const [alias, city] of cityByAlias) {
    if (alias.length < 2) continue;
    if (t.includes(alias) && (!best || alias.length > best.len)) {
      best = { city, len: alias.length };
    }
  }
  return best?.city ?? null;
}

/** Parse a user/LLM location phrase into a hierarchical place (CN/EN equivalent). */
export function parsePlace(raw: string): GeoPlace | null {
  const t = tok(raw);
  if (!t) return null;

  const city = cityByAlias.get(t);
  if (city) return cityPlace(city);

  const landmark = resolveLandmark(t);
  if (landmark) return cityPlace(landmark);

  const admin1 = admin1ByAlias.get(t);
  if (admin1) {
    const country = countryByAlias.get(admin1.country);
    return {
      continent: country?.continent,
      country: admin1.country,
      admin1: admin1.id,
    };
  }

  const country = countryByAlias.get(t);
  if (country) return countryPlace(country);

  const continent = CONTINENT_ALIASES[t];
  if (continent) return { continent };

  const nestedCity = resolveCitySubstring(t);
  if (nestedCity) return cityPlace(nestedCity);

  // Unknown opaque token — keep for exact match of rare towns, but not venue-like phrases.
  if (/公园|广场|场馆|商场|地铁|车站|机场|大学|park|station|mall|airport|university/i.test(t)) {
    return null;
  }
  return { city: t };
}

/** Labels for a known city id (e.g. beijing → Beijing / 北京). */
export function cityLabelsForId(cityId: string): { city: string; city_zh: string } | null {
  const c = cityByAlias.get(tok(cityId));
  if (!c) return null;
  return { city: c.label_en, city_zh: c.label_zh };
}

export function parsePlaceList(raw: string[] | undefined): GeoPlace[] {
  if (!raw?.length) return [];
  const out: GeoPlace[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const p = parsePlace(item);
    if (!p) continue;
    const key = placeKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export function placeKey(p: GeoPlace): string {
  return [p.continent ?? "", p.country ?? "", p.admin1 ?? "", p.city ?? ""].join("|");
}

/** Resolve a person's city labels to a full place (country filled from catalog). */
export function placeFromCityLabels(city: string, cityZh?: string): GeoPlace {
  return parsePlace(city) ?? parsePlace(cityZh ?? "") ?? { city: tok(city) || tok(cityZh ?? "") };
}

/**
 * Does `person` satisfy filter `need`?
 * Filter specifies the coarsest acceptable region; person must be in that region.
 */
export function placeSatisfies(person: GeoPlace, need: GeoPlace): boolean {
  if (need.city) {
    return Boolean(person.city && person.city === need.city);
  }
  if (need.admin1) {
    return Boolean(
      person.admin1 === need.admin1 ||
        (person.city && cityByAlias.get(person.city)?.admin1 === need.admin1),
    );
  }
  if (need.country) {
    return Boolean(person.country && person.country === need.country);
  }
  if (need.continent) {
    return Boolean(person.continent && person.continent === need.continent);
  }
  return true;
}

/** Person matches if they satisfy at least one include place (or no includes). */
export function matchesLocationFilters(
  person: GeoPlace,
  include: GeoPlace[],
  exclude: GeoPlace[],
): boolean {
  if (exclude.some((e) => placeSatisfies(person, e))) return false;
  if (include.length === 0) return true;
  return include.some((i) => placeSatisfies(person, i));
}

/** Display helper for filters line. */
export function formatPlace(p: GeoPlace, lang: "en" | "zh-CN"): string {
  const zh = lang === "zh-CN";
  if (p.city) {
    const c = CITIES.find((x) => x.id === p.city);
    return zh ? c?.label_zh ?? p.city : c?.label_en ?? p.city;
  }
  if (p.admin1) {
    const a = ADMIN1.find((x) => x.id === p.admin1);
    return zh ? a?.label_zh ?? p.admin1 : a?.label_en ?? p.admin1;
  }
  if (p.country) {
    const c = COUNTRIES.find((x) => x.id === p.country);
    return zh ? c?.label_zh ?? p.country : c?.label_en ?? p.country;
  }
  if (p.continent) {
    const map: Record<string, { en: string; zh: string }> = {
      asia: { en: "Asia", zh: "亚洲" },
      europe: { en: "Europe", zh: "欧洲" },
      north_america: { en: "North America", zh: "北美" },
      south_america: { en: "South America", zh: "南美" },
      africa: { en: "Africa", zh: "非洲" },
      oceania: { en: "Oceania", zh: "大洋洲" },
    };
    const m = map[p.continent];
    return zh ? m?.zh ?? p.continent : m?.en ?? p.continent;
  }
  return "";
}

export function formatPlaceList(places: GeoPlace[], lang: "en" | "zh-CN"): string {
  return places.map((p) => formatPlace(p, lang)).filter(Boolean).join(", ");
}

/** Canonical city id for legacy callers (berlin, beijing, …). */
export function canonicalCityId(raw: string): string {
  const p = parsePlace(raw);
  return p?.city ?? tok(raw);
}
