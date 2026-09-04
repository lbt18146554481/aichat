/**
 * Controlled facets for soft matching (vector / semantic similarity).
 * Hard filters stay on age, geo, education only.
 */

import type { Person } from "./types";
import type { Profile } from "./profile-shape";
import type { UserUnderstanding } from "./understanding";

export type FacetKind = "trait" | "interest";

export type FacetDef = {
  id: string;
  kind: FacetKind;
  label_en: string;
  label_zh: string;
  aliases: string[];
};

function def(
  id: string,
  kind: FacetKind,
  label_en: string,
  label_zh: string,
  aliases: string[] = [],
): FacetDef {
  return {
    id,
    kind,
    label_en,
    label_zh,
    aliases: [id, label_en.toLowerCase(), label_zh, ...aliases],
  };
}

export const TRAIT_DEFS: FacetDef[] = [
  def("quiet", "trait", "quiet", "安静", [
    "calm",
    "reserved",
    "introverted",
    "introvert",
    "恬静",
    "内敛",
    "话少",
    "文静",
    "低调",
  ]),
  def("warm", "trait", "warm", "温暖", ["kind-hearted", "暖心", "温和"]),
  def("kind", "trait", "kind", "善良", ["caring", "体贴", "温柔", "nice"]),
  def("funny", "trait", "funny", "幽默", ["humorous", "witty", "好笑", "有趣"]),
  def("brave", "trait", "brave", "坦诚", ["honest", "direct", "勇敢", "直率", "真实"]),
  def("ambitious", "trait", "ambitious", "上进", ["driven", "motivated", "有野心", "事业心"]),
  def("curious", "trait", "curious", "好奇", ["open-minded", "爱探索", "求知欲"]),
  def("playful", "trait", "playful", "活泼", ["energetic", "外向", "开朗"]),
];

export const INTEREST_DEFS: FacetDef[] = [
  def("reading", "interest", "reading", "阅读", ["books", "读书", "看书", "书店"]),
  def("travel", "interest", "travel", "旅行", ["旅游", "出行"]),
  def("coffee", "interest", "coffee", "咖啡", []),
  def("art", "interest", "art", "艺术", ["gallery", "展览", "美术馆"]),
  def("music", "interest", "music", "音乐", ["钢琴", "作曲"]),
  def("cooking", "interest", "cooking", "做饭", ["烹饪", "下厨", "美食"]),
  def("outdoors", "interest", "outdoors", "户外", ["hiking", "徒步", "爬山", "自然"]),
  def("film", "interest", "film", "电影", ["cinema", "观影"]),
  def("writing", "interest", "writing", "写作", ["写字", "创作"]),
  def("animals", "interest", "animals", "动物", ["宠物", "猫", "狗"]),
  def("city", "interest", "city life", "城市", ["都市", "urban", "逛街"]),
  def("morning", "interest", "morning", "早起", ["morning person", "清晨"]),
  def("night", "interest", "night", "夜晚", ["night owl", "夜猫子", "夜间"]),
  def("rain", "interest", "rain", "雨天", ["下雨"]),
  def("tennis", "interest", "tennis", "网球", []),
  def("run", "interest", "running", "跑步", []),
  def("climb", "interest", "climbing", "攀岩", []),
];

const ALL_DEFS = [...TRAIT_DEFS, ...INTEREST_DEFS];

const aliasToFacet = new Map<string, FacetDef>();
for (const f of ALL_DEFS) {
  for (const a of f.aliases) {
    aliasToFacet.set(normalizeAlias(a), f);
  }
}

/** Legacy seed `signals` → facet ids. */
export const SIGNAL_TO_FACET: Record<string, { kind: FacetKind; id: string }> = {
  quiet: { kind: "trait", id: "quiet" },
  funny: { kind: "trait", id: "funny" },
  kind: { kind: "trait", id: "kind" },
  brave: { kind: "trait", id: "brave" },
  ambitious: { kind: "trait", id: "ambitious" },
  curious: { kind: "trait", id: "curious" },
  warm: { kind: "trait", id: "warm" },
  playful: { kind: "trait", id: "playful" },
  reading: { kind: "interest", id: "reading" },
  rain: { kind: "interest", id: "rain" },
  travel: { kind: "interest", id: "travel" },
  coffee: { kind: "interest", id: "coffee" },
  city: { kind: "interest", id: "city" },
  art: { kind: "interest", id: "art" },
  music: { kind: "interest", id: "music" },
  cooking: { kind: "interest", id: "cooking" },
  outdoors: { kind: "interest", id: "outdoors" },
  morning: { kind: "interest", id: "morning" },
  film: { kind: "interest", id: "film" },
  writing: { kind: "interest", id: "writing" },
  night: { kind: "interest", id: "night" },
  animals: { kind: "interest", id: "animals" },
};

function normalizeAlias(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function facetById(id: string): FacetDef | undefined {
  return ALL_DEFS.find((f) => f.id === id);
}

/** Map free text or legacy signal to canonical facet id. */
export function resolveFacetId(raw: string): { kind: FacetKind; id: string } | null {
  const t = normalizeAlias(raw);
  if (!t) return null;
  const hit = aliasToFacet.get(t);
  if (hit) return { kind: hit.kind, id: hit.id };
  const mapped = SIGNAL_TO_FACET[t];
  if (mapped) return mapped;
  return null;
}

export function facetsFromSignals(signals: string[]): { interests: string[]; traits: string[] } {
  const interests = new Set<string>();
  const traits = new Set<string>();
  for (const sig of signals) {
    const f = resolveFacetId(sig) ?? SIGNAL_TO_FACET[sig];
    if (!f) continue;
    if (f.kind === "interest") interests.add(f.id);
    else traits.add(f.id);
  }
  return { interests: [...interests], traits: [...traits] };
}

export function facetLabels(ids: string[], lang: "en" | "zh-CN"): string[] {
  return ids
    .map((id) => {
      const f = facetById(id);
      if (!f) return id;
      return lang === "zh-CN" ? f.label_zh : f.label_en;
    })
    .filter(Boolean);
}

export function buildProfileText(
  input: Pick<
    Person,
    | "portrait"
    | "portrait_zh"
    | "occupation"
    | "occupation_zh"
    | "bio"
    | "bio_zh"
    | "interests"
    | "traits"
    | "moments"
    | "socialPace"
    | "intent"
    | "languages"
  >,
): string {
  const parts: string[] = [
    input.portrait,
    input.portrait_zh,
    input.occupation,
    input.occupation_zh,
    input.bio ?? "",
    input.bio_zh ?? "",
    ...facetLabels(input.traits, "en"),
    ...facetLabels(input.traits, "zh-CN"),
    ...facetLabels(input.interests, "en"),
    ...facetLabels(input.interests, "zh-CN"),
  ];
  if (input.socialPace) parts.push(input.socialPace);
  if (input.intent?.length) parts.push(...input.intent);
  if (input.languages?.length) parts.push(...input.languages);
  for (const m of input.moments ?? []) {
    parts.push(m.answer, m.answer_zh);
  }
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");
}

/** User preference blob for semantic recall (not hard filter). */
export function buildPreferenceQuery(u: UserUnderstanding): string {
  const parts: string[] = [];
  if (u.positive.length) {
    parts.push(...u.positive);
    parts.push(...facetLabels(u.positive, "en"));
    parts.push(...facetLabels(u.positive, "zh-CN"));
  }
  parts.push(...u.notes);
  if (u.negative.length) {
    parts.push(...u.negative.map((n) => `not ${n}`));
  }
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");
}

export function buildProfileFromUser(profile: Profile): string {
  const parts: string[] = [
    profile.name,
    profile.city,
    profile.occupation,
    profile.mbti,
    ...(profile.traits ?? []),
    ...(profile.interests ?? []),
    ...facetLabels(profile.traits ?? [], "en"),
    ...facetLabels(profile.traits ?? [], "zh-CN"),
    ...facetLabels(profile.interests ?? [], "en"),
    ...facetLabels(profile.interests ?? [], "zh-CN"),
  ];
  for (const m of profile.moments ?? []) {
    if (m.answer.trim()) parts.push(m.answer);
  }
  for (const f of profile.favorites ?? []) {
    parts.push(f.title, f.why);
  }
  return parts.filter(Boolean).join(" ");
}

type PersonCore = Omit<
  Person,
  "interests" | "traits" | "status" | "source" | "profileText" | "gender"
> &
  Partial<Pick<Person, "interests" | "traits" | "status" | "source" | "profileText" | "gender">>;

/** Fill matching + display fields on a person record (seed or user). */
export function enrichPerson(p: PersonCore): Person {
  const fromSignals = facetsFromSignals(p.signals ?? []);
  const interests = [...new Set([...(p.interests ?? []), ...fromSignals.interests])];
  const traits = [...new Set([...(p.traits ?? []), ...fromSignals.traits])];
  const base = {
    ...p,
    interests,
    traits,
    status: p.status ?? "active",
    source: p.source ?? "seed",
    languages: p.languages ?? ["en"],
  };
  return {
    ...base,
    profileText: p.profileText?.trim() || buildProfileText({ ...base, moments: p.moments ?? [] }),
  };
}

/** Expand facet aliases for semantic tokenization (安静 ≈ 恬静). */
export function expandedFacetTerms(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of ALL_DEFS) {
    const key = `${f.kind}:${f.id}`;
    out.set(
      key,
      f.aliases.map(normalizeAlias).filter(Boolean),
    );
  }
  return out;
}

export function allFacetAliasPhrases(): string[] {
  const phrases: string[] = [];
  for (const f of ALL_DEFS) {
    for (const a of f.aliases) {
      const t = a.trim();
      if (t.length >= 2) phrases.push(t);
    }
  }
  return [...new Set(phrases)].sort((a, b) => b.length - a.length);
}
