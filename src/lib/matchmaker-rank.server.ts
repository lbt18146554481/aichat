import { chatCompletionJson } from "./llm.server";
import { personCardLine, recallCandidates } from "./match-recall";
import type { MatchHardFilters, MatchmakerLang } from "./match-types";
import { EMPTY_HARD_FILTERS } from "./match-types";
import type { Person } from "./types";
import type { Profile } from "./profile";
import type { UserUnderstanding } from "./understanding";
import { softPrefLists, softPrefsPresent, EMPTY_UNDERSTANDING } from "./understanding";
import { log } from "./logger.server";
import {
  MATCH_QUEUE_LIMIT,
  mergeRankedIds,
  recallQueueIds,
} from "./matchmaker-queue";
import { buildReasons } from "./match-reasons";
import { localized } from "./people";
import { facetLabels } from "./person-facets";
import { profileSummary } from "./profile-summary";

export interface RankMatchmakerInput {
  lang: MatchmakerLang;
  /** (1) Effective matching prefs — cold-start + chat updates. */
  understanding: UserUnderstanding;
  hardFilters: MatchHardFilters;
  /**
   * (2) Chat-extracted prefs only — no cold-start fill.
   * Soft fields usually match `understanding`; hard filters are pre-cold-start.
   */
  chatUnderstanding?: UserUnderstanding;
  chatHardFilters?: MatchHardFilters;
  blockedIds: string[];
  shownIds: string[];
  passedIds: string[];
  pool: Person[];
  profile?: Profile;
}

export interface RankMatchmakerOutput {
  rankedIds: string[];
  /** 1–3 sentence reason per ranked id. */
  reasons: Record<string, string>;
  recallEmpty: boolean;
}

interface LlmRankEntry {
  id?: string;
  reason?: string;
}

interface LlmRankJson {
  rankedIds?: string[];
  reasons?: Record<string, string> | LlmRankEntry[];
  ranked?: LlmRankEntry[];
}

function zh(lang: MatchmakerLang) {
  return lang === "zh-CN";
}

function clip(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function formatHardFiltersBlock(f: MatchHardFilters, lang: MatchmakerLang): string {
  const isZh = zh(lang);
  const lines: string[] = [];
  if (f.ageMin != null || f.ageMax != null) {
    const lo = f.ageMin ?? (isZh ? "不限" : "any");
    const hi = f.ageMax ?? (isZh ? "不限" : "any");
    lines.push(
      isZh
        ? `年龄：${lo}-${hi}${f.ageStrength === "flex" ? "（偏好）" : ""}`
        : `age: ${lo}-${hi}${f.ageStrength === "flex" ? " (flex)" : ""}`,
    );
  }
  if (f.genders.length) {
    lines.push(
      isZh
        ? `性别：${f.genders.join("、")}${f.genderStrength === "flex" ? "（偏好）" : ""}`
        : `genders: ${f.genders.join(", ")}${f.genderStrength === "flex" ? " (flex)" : ""}`,
    );
  }
  if (f.excludeGenders.length) {
    lines.push(
      isZh
        ? `排除性别：${f.excludeGenders.join("、")}`
        : `exclude genders: ${f.excludeGenders.join(", ")}`,
    );
  }
  if (f.cities.length) {
    lines.push(
      isZh
        ? `城市：${f.cities.join("、")}${f.cityStrength === "flex" ? "（偏好）" : ""}`
        : `cities: ${f.cities.join(", ")}${f.cityStrength === "flex" ? " (flex)" : ""}`,
    );
  }
  if (f.excludeCities.length) {
    lines.push(
      isZh
        ? `排除城市：${f.excludeCities.join("、")}`
        : `exclude cities: ${f.excludeCities.join(", ")}`,
    );
  }
  if (f.educationMin || f.educationLevels.length) {
    const edu = f.educationLevels.length
      ? f.educationLevels.join(isZh ? "、" : ", ")
      : String(f.educationMin);
    lines.push(
      isZh
        ? `学历：${edu}${f.educationStrength === "flex" ? "（偏好）" : ""}`
        : `education: ${edu}${f.educationStrength === "flex" ? " (flex)" : ""}`,
    );
  }
  return lines.join("\n");
}

function formatUnderstandingBlock(u: UserUnderstanding, lang: MatchmakerLang): string {
  const isZh = zh(lang);
  const soft = softPrefLists(u);
  const lines = [
    soft.traits.length
      ? isZh
        ? `性格：${soft.traits.join("、")}`
        : `traits: ${soft.traits.join(", ")}`
      : "",
    soft.interests.length
      ? isZh
        ? `兴趣：${soft.interests.join("、")}`
        : `interests: ${soft.interests.join(", ")}`
      : "",
    soft.occupation.length
      ? isZh
        ? `职业/身份：${soft.occupation.join("、")}`
        : `occupation: ${soft.occupation.join(", ")}`
      : "",
    soft.pace.length
      ? isZh
        ? `节奏：${soft.pace.join("、")}`
        : `pace: ${soft.pace.join(", ")}`
      : "",
    u.negative.length
      ? isZh
        ? `不想要：${u.negative.join("、")}`
        : `avoids: ${u.negative.join(", ")}`
      : "",
    u.notes.length
      ? isZh
        ? `补充：${u.notes.join(" | ")}`
        : `notes: ${u.notes.join(" | ")}`
      : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function prefsNonEmpty(u: UserUnderstanding, f: MatchHardFilters): boolean {
  if (softPrefsPresent(u) || u.negative.length > 0) return true;
  if (u.notes.some((n) => n.trim().length > 0)) return true;
  if (f.ageMin != null || f.ageMax != null) return true;
  if (f.genders.length || f.excludeGenders.length) return true;
  if (f.cities.length || f.excludeCities.length) return true;
  if (f.educationMin || f.educationLevels.length) return true;
  return false;
}

function formatPrefsCard(
  title: string,
  emptyLabel: string,
  u: UserUnderstanding,
  f: MatchHardFilters,
  lang: MatchmakerLang,
): string {
  const hard = formatHardFiltersBlock(f, lang);
  const soft = formatUnderstandingBlock(u, lang);
  const body = [hard, soft].filter(Boolean).join("\n");
  if (!body || !prefsNonEmpty(u, f)) return `${title}\n${emptyLabel}`;
  return `${title}\n${body}`;
}

/** Candidate card with citeable fields for ranking + reasons. */
function reasonRosterFromIds(
  ids: string[],
  lang: MatchmakerLang,
  blocked: Set<string>,
  pool: Person[],
): string {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const isZh = zh(lang);
  return ids
    .map((id) => {
      const p = byId.get(id);
      if (!p) return null;
      const base = personCardLine(p, lang, blocked.has(id));
      const traitLabels = (p.traits ?? []).length
        ? facetLabels(p.traits ?? [], lang).join(isZh ? "、" : ", ")
        : "";
      const interestLabels = (p.interests ?? []).length
        ? facetLabels(p.interests ?? [], lang).join(isZh ? "、" : ", ")
        : "";
      const tags = [...(p.signals ?? [])].filter(Boolean).slice(0, 8).join(", ");
      const favs = (p.favorites ?? [])
        .slice(0, 3)
        .map((f) => (isZh ? f.title_zh || f.title : f.title).trim())
        .filter(Boolean)
        .join(isZh ? "、" : ", ");
      const moments = (p.moments ?? [])
        .slice(0, 2)
        .map((m) => clip(isZh ? m.answer_zh : m.answer, 80))
        .filter(Boolean)
        .join(isZh ? " / " : " / ");
      return [
        base,
        traitLabels ? `  traits: ${traitLabels}` : "",
        interestLabels ? `  interests: ${interestLabels}` : "",
        tags ? `  tags: ${tags}` : "",
        favs ? `  favorites: ${favs}` : "",
        moments ? `  moments: ${moments}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

function seekerProfileForReason(profile: Profile | undefined, lang: MatchmakerLang): string {
  const isZh = zh(lang);
  if (!profile) {
    return isZh ? "（用户画像较少）" : "(sparse seeker profile)";
  }
  const summary = profileSummary(profile, lang);
  const favs = (profile.favorites ?? [])
    .slice(0, 4)
    .map((f) => f.title?.trim())
    .filter(Boolean)
    .join(isZh ? "、" : ", ");
  const moments = (profile.moments ?? [])
    .slice(0, 2)
    .map((m) => clip(m.answer ?? "", 72))
    .filter(Boolean)
    .join(isZh ? " / " : " / ");
  return [
    summary,
    favs ? (isZh ? `收藏：${favs}` : `favorites: ${favs}`) : "",
    moments ? (isZh ? `moments：${moments}` : `moments: ${moments}`) : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseLlmReasons(parsed: LlmRankJson | null | undefined): {
  rankedIds: string[];
  reasons: Record<string, string>;
} {
  const reasons: Record<string, string> = {};
  const rankedIds: string[] = [];

  const push = (id: string | undefined, reason: string | undefined) => {
    const cleanId = (id ?? "").trim();
    if (!cleanId) return;
    if (!rankedIds.includes(cleanId)) rankedIds.push(cleanId);
    const text = (reason ?? "").trim();
    if (text) reasons[cleanId] = text;
  };

  if (Array.isArray(parsed?.ranked)) {
    for (const entry of parsed.ranked) push(entry?.id, entry?.reason);
  }

  if (Array.isArray(parsed?.reasons)) {
    for (const entry of parsed.reasons) push(entry?.id, entry?.reason);
  } else if (parsed?.reasons && typeof parsed.reasons === "object") {
    for (const [id, reason] of Object.entries(parsed.reasons)) {
      push(id, typeof reason === "string" ? reason : undefined);
    }
  }

  if (Array.isArray(parsed?.rankedIds)) {
    for (const id of parsed.rankedIds) push(id, reasons[id]);
  }

  return { rankedIds, reasons };
}

/** Concrete fallback — never dump portrait as “气质接近”. */
function softFallbackReason(
  person: Person,
  understanding: UserUnderstanding,
  lang: MatchmakerLang,
  profile?: Profile,
): string {
  const isZh = zh(lang);
  const name = localized(person, lang).name;
  const parts: string[] = [];

  if (profile) {
    const built = buildReasons(person, profile, understanding, lang);
    for (const r of built.slice(0, 2)) {
      if (r.kind === "favorite") {
        parts.push(
          isZh ? `你们都写下了《${r.title}》。` : `You both listed “${r.title}”.`,
        );
      } else if (r.kind === "you_said") {
        parts.push(
          isZh
            ? `${name} 写过：「${clip(r.theirs, 48)}」。`
            : `${name} wrote: “${clip(r.theirs, 48)}”.`,
        );
      } else if (r.kind === "values") {
        parts.push(
          isZh
            ? `${name} 说过：「${clip(r.theirs, 48)}」。`
            : `${name} shared: “${clip(r.theirs, 48)}”.`,
        );
      }
    }
  }

  const want = [
    ...(understanding.traits ?? []),
    ...(understanding.interests ?? []),
    ...(understanding.pace ?? []),
    ...(understanding.occupation ?? []),
  ]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const theirs = [
    ...(person.traits ?? []),
    ...(person.interests ?? []),
    ...(person.signals ?? []),
  ];
  const theirLabels = facetLabels(theirs, lang);
  for (const w of want) {
    const hit = theirLabels.find(
      (lab) => lab.toLowerCase().includes(w) || w.includes(lab.toLowerCase()),
    );
    if (hit) {
      parts.push(isZh ? `${name} 显得${hit}。` : `${name} comes across as ${hit}.`);
      break;
    }
  }

  if (parts.length === 0) {
    const trait = facetLabels(person.traits ?? [], lang)[0];
    const interest = facetLabels(person.interests ?? [], lang)[0];
    const fav = (person.favorites ?? [])[0];
    const favTitle = fav
      ? isZh
        ? (fav.title_zh || fav.title).trim()
        : fav.title.trim()
      : "";
    if (trait) parts.push(isZh ? `${name} 比较${trait}。` : `${name} is rather ${trait}.`);
    if (interest)
      parts.push(isZh ? `平时喜欢${interest}。` : `Into ${interest}.`);
    if (favTitle && parts.length < 2) {
      parts.push(isZh ? `收藏里有《${favTitle}》。` : `Listed “${favTitle}”.`);
    }
  }

  if (parts.length === 0) {
    return isZh
      ? `${name} 的资料里暂无和当前明确需求直接对应的点，可以先看看右边。`
      : `${name}'s profile has no clear overlap with stated asks yet — see the right pane.`;
  }

  return parts.slice(0, 3).join(isZh ? "" : " ");
}

/** Fill a reason for every ranked id; never leave blanks. */
export function ensureQueueReasons(
  rankedIds: string[],
  llmReasons: Record<string, string>,
  pool: Person[],
  understanding: UserUnderstanding,
  lang: MatchmakerLang,
  profile?: Profile,
): Record<string, string> {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const out: Record<string, string> = {};
  for (const id of rankedIds) {
    const fromLlm = (llmReasons[id] ?? "").trim();
    if (fromLlm) {
      out[id] = fromLlm;
      continue;
    }
    const person = byId.get(id);
    out[id] = person
      ? softFallbackReason(person, understanding, lang, profile)
      : zh(lang)
        ? "暂无足够材料写出具体对应点。"
        : "Not enough material for a concrete fit note.";
  }
  return out;
}

export async function runMatchmakerRank(
  input: RankMatchmakerInput,
): Promise<RankMatchmakerOutput> {
  const { ids: recallIds, empty } = recallQueueIds({
    understanding: input.understanding,
    hardFilters: input.hardFilters,
    blockedIds: input.blockedIds,
    shownIds: input.shownIds,
    passedIds: input.passedIds,
  });

  if (recallIds.length === 0) {
    return { rankedIds: [], reasons: {}, recallEmpty: empty };
  }

  const chatU = input.chatUnderstanding ?? input.understanding ?? EMPTY_UNDERSTANDING;
  const chatF = input.chatHardFilters ?? EMPTY_HARD_FILTERS;

  const roster = reasonRosterFromIds(
    recallIds,
    input.lang,
    new Set(input.blockedIds),
    input.pool,
  );

  const effectiveCard = formatPrefsCard(
    zh(input.lang)
      ? "【1. 生效搜索条件】（含冷启动与用户后来修改，用于排序）"
      : "[1. Effective search prefs] (cold-start + later edits; use for ranking)",
    zh(input.lang) ? "（较少）" : "(sparse)",
    input.understanding,
    input.hardFilters,
    input.lang,
  );

  const chatCard = formatPrefsCard(
    zh(input.lang)
      ? "【2. 用户口头明确需求】（仅聊天抽取，不含冷启动；写理由优先依据）"
      : "[2. Explicit chat asks] (extracted only, no cold-start; prioritize for reasons)",
    zh(input.lang)
      ? "（暂无口头明确需求 — 理由只写双方画像相似点）"
      : "(none yet — reasons should only cite profile overlaps)",
    chatU,
    chatF,
    input.lang,
  );

  const seekerBlock = zh(input.lang)
    ? `【用户画像】（写理由时用于找相似点）\n${seekerProfileForReason(input.profile, input.lang)}`
    : `[Seeker profile] (for similarity in reasons)\n${seekerProfileForReason(input.profile, input.lang)}`;

  const system = zh(input.lang)
    ? `你是 Maitri 的匹配排序器。任务：排序候选人，并为每人写匹配理由。

排序：
- 同时参考【1. 生效搜索条件】和【2. 用户口头明确需求】；口头明确的需求可加重权。
- 只能使用下方候选人列表里的 id，覆盖每一位（除非明显不符合硬条件）。

写理由（reason，1–3 句中文）：
- 优先依据【2】：看对方 traits / interests / tags / favorites / moments 哪里符合用户口头需求。
- 只写对方身上的具体点（如「很会社交」「常徒步」），不要复述「你想要开朗」这类用户已知需求。
- 其次写【用户画像】与对方画像的相似点（共同收藏、相近兴趣/性格、可引的 moment）。
- 若【2】为空：仍要写理由，只写画像相似点或对方可引的具体事实。
- 有【2】时：先写需求对点，再写画像相似；对不上需求时可以只写画像相似。
- 禁止空话：「气质接近」「感觉合适」「值得一看」等；禁止编造列表里没有的事实；不要用 portrait 当空泛理由。
- 硬条件（性别/年龄/城市）主要用于排序，不必写进理由，除非用户口头明确强调且对方材料能支撑。

输出 JSON：
{"ranked":[{"id":"id1","reason":"..."},{"id":"id2","reason":"..."},...]}
最贴切排最前。`
    : `You rank Maitri matchmaker candidates and write a reason for each.

Ranking:
- Use both [1. Effective search prefs] and [2. Explicit chat asks]; weight explicit chat asks higher.
- Use only listed ids; include everyone unless clearly wrong for hard filters.

Reasons (1–3 sentences):
- Prioritize [2]: cite where their traits / interests / tags / favorites / moments fit the explicit asks.
- State the person's concrete fit only — do NOT restate what the user already asked for.
- Then cite overlaps between [Seeker profile] and the candidate (shared favorites, similar interests/traits, moments).
- If [2] is empty: still write a reason from profile overlaps / citeable facts only.
- When [2] exists: need-fit first, then profile overlap; if no need-fit, profile overlap only is OK.
- Ban fluff ("vibes", "feels close", "worth a look"); no invented facts; don't use portrait as vague filler.
- Hard filters (gender/age/city) are mainly for ranking — usually omit from reasons unless explicitly asked and supported.

JSON only:
{"ranked":[{"id":"id1","reason":"..."},{"id":"id2","reason":"..."},...]}
best first.`;

  const user = [
    effectiveCard,
    chatCard,
    seekerBlock,
    zh(input.lang)
      ? `候选人（共 ${recallIds.length} 位）：\n${roster}`
      : `Candidates (${recallIds.length}):\n${roster}`,
  ].join("\n\n");

  try {
    const parsed = await chatCompletionJson<LlmRankJson>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.35, maxTokens: 3200 },
    );

    const parsedParts = parseLlmReasons(parsed);
    const ranked = mergeRankedIds(parsedParts.rankedIds, recallIds);
    const reasons = ensureQueueReasons(
      ranked,
      parsedParts.reasons,
      input.pool,
      chatU,
      input.lang,
      input.profile,
    );
    log.info("matchmaker", "ranked queue", {
      count: ranked.length,
      top: ranked[0],
      reasons: Object.keys(reasons).length,
    });
    return { rankedIds: ranked, reasons, recallEmpty: empty };
  } catch (e) {
    log.warn("matchmaker", "rank fallback to recall order", e);
    const reasons = ensureQueueReasons(
      recallIds,
      {},
      input.pool,
      chatU,
      input.lang,
      input.profile,
    );
    return { rankedIds: recallIds, reasons, recallEmpty: empty };
  }
}

/** @internal for tests */
export function recallOrderFallback(input: RankMatchmakerInput): string[] {
  const recall = recallCandidates({ ...input, limit: MATCH_QUEUE_LIMIT });
  return recall.candidates.map((c) => c.id);
}
