import type { ToolDefinition } from "./llm.server";
import type { MatchHardFilters, MatchmakerLang } from "./match-types";
import { EMPTY_HARD_FILTERS } from "./match-types";
import type { UserUnderstanding } from "./understanding";
import {
  clampAge,
  educationRank,
  normalizeCityList,
  normalizeEducationLevel,
  normalizeEducationLevels,
  normalizeGenders,
} from "./match-normalize";
import { formatPlaceList, parsePlaceList, placeFromCityLabels, placeSatisfies } from "./geo";
import { recallCandidates, rosterFromIds } from "./match-recall";
import { findPersonInPool } from "./people-store.server";
import { buildPoolFacets } from "./pool-facets.server";
import { localized } from "./people";
import type { Person, PersonGender } from "./types";

export type MatchmakerToolState = {
  lang: MatchmakerLang;
  pool: Person[];
  hardFilters: MatchHardFilters;
  understanding: UserUnderstanding;
  blockedIds: string[];
  shownIds: string[];
  passedIds: string[];
  currentPersonId: string | null;
  rankedQueueLength: number;
  /** Set when pass_person tool runs. */
  passCurrentPerson: boolean;
  /** Suggested next id from pass_person / search. */
  suggestedIntroduceId: string | null;
  filtersTouched: boolean;
  lastSearchIds: string[];
  /** Client should advance the ranked queue (like see-next / pass buttons). */
  queueAdvance: "pass" | "see" | null;
  /** User wants new screening under updated prefs — rank only after rematch confirm. */
  requestRematch: boolean;
};

export function createMatchmakerToolState(input: {
  lang: MatchmakerLang;
  pool: Person[];
  hardFilters: MatchHardFilters;
  understanding: UserUnderstanding;
  blockedPersonIds: string[];
  shownIds: string[];
  passedIds: string[];
  currentPersonId: string | null;
  rankedQueueLength?: number;
}): MatchmakerToolState {
  return {
    lang: input.lang,
    pool: input.pool,
    hardFilters: { ...input.hardFilters },
    understanding: input.understanding,
    blockedIds: [...input.blockedPersonIds, ...input.passedIds],
    shownIds: [...input.shownIds],
    passedIds: [...input.passedIds],
    currentPersonId: input.currentPersonId,
    rankedQueueLength: input.rankedQueueLength ?? 0,
    passCurrentPerson: false,
    suggestedIntroduceId: null,
    filtersTouched: false,
    lastSearchIds: [],
    queueAdvance: null,
    requestRematch: false,
  };
}

function asStringArray(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x));
}

function patchFilters(
  prev: MatchHardFilters,
  args: Record<string, unknown>,
): MatchHardFilters {
  const next: MatchHardFilters = { ...prev };

  if ("ageMin" in args) {
    next.ageMin = args.ageMin === null ? null : clampAge(args.ageMin);
  }
  if ("ageMax" in args) {
    next.ageMax = args.ageMax === null ? null : clampAge(args.ageMax);
  }
  if ("cities" in args) {
    next.cities = normalizeCityList(asStringArray(args.cities) ?? []);
  }
  if ("excludeCities" in args) {
    next.excludeCities = normalizeCityList(asStringArray(args.excludeCities) ?? []);
  }
  if ("addCities" in args) {
    const add = normalizeCityList(asStringArray(args.addCities) ?? []);
    next.cities = [...new Set([...next.cities, ...add])];
  }
  if ("removeCities" in args) {
    const remove = new Set(normalizeCityList(asStringArray(args.removeCities) ?? []));
    next.cities = next.cities.filter((c) => !remove.has(c));
  }
  if ("educationMin" in args) {
    next.educationMin =
      args.educationMin === null || args.educationMin === undefined
        ? null
        : normalizeEducationLevel(String(args.educationMin));
  }
  if ("educationLevels" in args) {
    next.educationLevels = normalizeEducationLevels(asStringArray(args.educationLevels));
  }
  if ("excludeEducationLevels" in args) {
    next.excludeEducationLevels = normalizeEducationLevels(
      asStringArray(args.excludeEducationLevels),
    );
  }
  if ("genders" in args) {
    next.genders = normalizeGenders(asStringArray(args.genders));
  }
  if ("excludeGenders" in args) {
    next.excludeGenders = normalizeGenders(asStringArray(args.excludeGenders));
  }
  if (args.clear === true) {
    return { ...EMPTY_HARD_FILTERS };
  }
  return next;
}

function reasonsPersonFails(
  personId: string,
  f: MatchHardFilters,
  lang: MatchmakerLang,
  pool: Person[],
): string[] {
  const p = findPersonInPool(pool, personId);
  const zh = lang === "zh-CN";
  if (!p) return [zh ? "找不到此人" : "Person not found"];

  const reasons: string[] = [];
  if (f.genders.length > 0 && !f.genders.includes(p.gender)) {
    reasons.push(
      zh
        ? `性别 ${genderLabel(p.gender, lang)} 不在要求范围（需要 ${f.genders.map((g) => genderLabel(g, lang)).join("、")}）`
        : `gender ${p.gender} not in filter (${f.genders.join(", ")})`,
    );
  }
  if (f.excludeGenders.includes(p.gender)) {
    reasons.push(
      zh
        ? `性别 ${genderLabel(p.gender, lang)} 在排除列表`
        : `gender ${p.gender} excluded`,
    );
  }
  if (f.ageMin != null && p.age < f.ageMin) {
    reasons.push(zh ? `年龄 ${p.age} < 最低 ${f.ageMin}` : `age ${p.age} < min ${f.ageMin}`);
  }
  if (f.ageMax != null && p.age > f.ageMax) {
    reasons.push(zh ? `年龄 ${p.age} > 最高 ${f.ageMax}` : `age ${p.age} > max ${f.ageMax}`);
  }

  const personPlace = placeFromCityLabels(p.city, p.city_zh);
  const include = parsePlaceList(f.cities);
  const exclude = parsePlaceList(f.excludeCities);
  if (exclude.some((e) => placeSatisfies(personPlace, e))) {
    reasons.push(
      zh
        ? `地点在排除范围（${formatPlaceList(exclude, lang)}）`
        : `location excluded (${formatPlaceList(exclude, lang)})`,
    );
  }
  if (include.length > 0 && !include.some((i) => placeSatisfies(personPlace, i))) {
    reasons.push(
      zh
        ? `地点不在要求范围（需要 ${formatPlaceList(include, lang)}，此人在 ${zh ? p.city_zh : p.city}）`
        : `location outside filter (need ${formatPlaceList(include, lang)}, person in ${p.city})`,
    );
  }

  const rank = educationRank(p.educationLevel);
  if (f.educationMin != null && rank < educationRank(f.educationMin)) {
    reasons.push(
      zh
        ? `学历低于最低要求 ${f.educationMin}`
        : `education below min ${f.educationMin}`,
    );
  }
  if (f.educationLevels.length > 0 && !f.educationLevels.includes(p.educationLevel)) {
    reasons.push(
      zh
        ? `学历不在允许列表：${f.educationLevels.join(", ")}`
        : `education not in allowed list: ${f.educationLevels.join(", ")}`,
    );
  }
  if (f.excludeEducationLevels.includes(p.educationLevel)) {
    reasons.push(zh ? `学历在排除列表` : `education excluded`);
  }

  return reasons;
}

function genderLabel(g: PersonGender, lang: MatchmakerLang): string {
  if (lang === "zh-CN") {
    return { female: "女性", male: "男性", nonbinary: "非二元" }[g];
  }
  return g;
}

function explainEmptyPool(state: MatchmakerToolState): {
  count: number;
  tightest: string[];
  tip: string;
} {
  const facets = buildPoolFacets(state.pool, {
    lang: state.lang,
    understanding: state.understanding,
    hardFilters: state.hardFilters,
    blockedIds: state.blockedIds,
    shownIds: state.shownIds,
    passedIds: state.passedIds,
  });
  return {
    count: facets.matchingNow,
    tightest: facets.relaxHints.map((h) => h.label),
    tip: facets.tip,
  };
}

function recallState(state: MatchmakerToolState, extra?: Partial<Parameters<typeof recallCandidates>[0]>) {
  return {
    understanding: state.understanding,
    hardFilters: state.hardFilters,
    blockedIds: state.blockedIds,
    shownIds: state.shownIds,
    passedIds: state.passedIds,
    pool: state.pool,
    ...extra,
  };
}

function previewWithFilters(
  state: MatchmakerToolState,
  override?: Partial<MatchHardFilters>,
  limit = 5,
) {
  const hardFilters = override
    ? patchFilters(state.hardFilters, override as Record<string, unknown>)
    : state.hardFilters;
  const recall = recallCandidates({
    ...recallState(state, { hardFilters, limit }),
  });
  const sample = recall.candidates.slice(0, limit).map((c) => {
    const p = findPersonInPool(state.pool, c.id);
    if (!p) return { id: c.id, score: c.score };
    const loc = localized(p, state.lang);
    return {
      id: c.id,
      score: c.score,
      name: loc.name,
      age: p.age,
      city: loc.city,
      occupation: loc.occupation,
    };
  });
  return {
    count: recall.filteredCount,
    empty: recall.emptyAfterHardFilter,
    filters: hardFilters,
    sample,
  };
}

export const MATCHMAKER_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "pool_facets",
      description:
        "Pool statistics: total size, how many match current filters, age/city/education distribution, and which filter to relax if empty.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "preview_pool",
      description:
        "Preview how many people match filters (optionally a trial patch). Use before promising introductions or when the user asks how many / if China has anyone.",
      parameters: {
        type: "object",
        properties: {
          cities: { type: "array", items: { type: "string" } },
          excludeCities: { type: "array", items: { type: "string" } },
          ageMin: { type: ["number", "null"] },
          ageMax: { type: ["number", "null"] },
          genders: { type: "array", items: { type: "string" } },
          excludeGenders: { type: "array", items: { type: "string" } },
          educationMin: { type: ["string", "null"] },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_filters",
      description:
        "Apply hard filter changes from the user (gender/location/age/education). Prefer addCities/removeCities for incremental edits. CN/EN place aliases ok (中国=China).",
      parameters: {
        type: "object",
        properties: {
          cities: { type: "array", items: { type: "string" } },
          addCities: { type: "array", items: { type: "string" } },
          removeCities: { type: "array", items: { type: "string" } },
          excludeCities: { type: "array", items: { type: "string" } },
          ageMin: { type: ["number", "null"] },
          ageMax: { type: ["number", "null"] },
          genders: { type: "array", items: { type: "string" } },
          excludeGenders: { type: "array", items: { type: "string" } },
          educationMin: { type: ["string", "null"] },
          educationLevels: { type: "array", items: { type: "string" } },
          excludeEducationLevels: { type: "array", items: { type: "string" } },
          clear: { type: "boolean", description: "Clear all hard filters" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_person",
      description: "Fetch one person's intro details by id before introducing them.",
      parameters: {
        type: "object",
        required: ["personId"],
        properties: {
          personId: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_people",
      description:
        "Ranked recall under current (or trial) hard filters + soft prefs. Returns ids you may introduce.",
      parameters: {
        type: "object",
        properties: {
          cities: { type: "array", items: { type: "string" } },
          ageMin: { type: ["number", "null"] },
          ageMax: { type: ["number", "null"] },
          genders: { type: "array", items: { type: "string" } },
          excludeGenders: { type: "array", items: { type: "string" } },
          educationMin: { type: ["string", "null"] },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "explain_mismatch",
      description:
        "Explain why a person fails current filters, or why the pool is empty (omit personId for empty-pool diagnosis).",
      parameters: {
        type: "object",
        properties: {
          personId: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browse_next_person",
      description:
        "Advance within the existing ranked queue only. Default mode=see (browse without rejecting — same as the Skip for now button). Use mode=pass ONLY when the user clearly rejects this person (not a fit, no spark, don't like them).",
      parameters: {
        type: "object",
        required: ["mode"],
        properties: {
          mode: { type: "string", enum: ["see", "pass"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_rematch",
      description:
        "Change match criteria and stage a fresh ranked batch. Apply filter patches here when the user updates age/city/education or soft prefs warrant re-screening. Does NOT rank until user confirms rematchConfirmLine in chat JSON.",
      parameters: {
        type: "object",
        properties: {
          cities: { type: "array", items: { type: "string" } },
          addCities: { type: "array", items: { type: "string" } },
          removeCities: { type: "array", items: { type: "string" } },
          excludeCities: { type: "array", items: { type: "string" } },
          ageMin: { type: ["number", "null"] },
          ageMax: { type: ["number", "null"] },
          genders: { type: "array", items: { type: "string" } },
          excludeGenders: { type: "array", items: { type: "string" } },
          educationMin: { type: ["string", "null"] },
          educationLevels: { type: "array", items: { type: "string" } },
          excludeEducationLevels: { type: "array", items: { type: "string" } },
          clear: { type: "boolean" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pass_person",
      description:
        "Legacy skip without a ranked queue. Prefer browse_next_person when a queue exists.",
      parameters: {
        type: "object",
        properties: {
          personId: {
            type: "string",
            description: "Defaults to current introduced person",
          },
        },
      },
    },
  },
];

export function executeMatchmakerTool(
  state: MatchmakerToolState,
  name: string,
  args: Record<string, unknown>,
): unknown {
  switch (name) {
    case "pool_facets":
      return buildPoolFacets(state.pool, {
        lang: state.lang,
        understanding: state.understanding,
        hardFilters: state.hardFilters,
        blockedIds: state.blockedIds,
        shownIds: state.shownIds,
        passedIds: state.passedIds,
      });
    case "preview_pool": {
      const limit = typeof args.limit === "number" ? Math.min(10, Math.max(1, args.limit)) : 5;
      return previewWithFilters(state, args, limit);
    }
    case "update_filters": {
      state.hardFilters = patchFilters(state.hardFilters, args);
      state.filtersTouched = true;
      const preview = previewWithFilters(state, undefined, 3);
      return {
        ok: true,
        hardFilters: state.hardFilters,
        locationLabel: formatPlaceList(parsePlaceList(state.hardFilters.cities), state.lang),
        poolCount: preview.count,
        sample: preview.sample,
      };
    }
    case "get_person": {
      const id = String(args.personId ?? "");
      const p = findPersonInPool(state.pool, id);
      if (!p) return { error: "not_found", personId: id };
      const loc = localized(p, state.lang);
      const zh = state.lang === "zh-CN";
      return {
        id: p.id,
        name: loc.name,
        age: p.age,
        gender: p.gender,
        city: loc.city,
        occupation: loc.occupation,
        education: zh ? p.education_zh : p.education,
        portrait: loc.portrait,
        interests: p.interests,
        traits: p.traits,
        signals: p.signals.slice(0, 8),
      };
    }
    case "search_people": {
      const limit = typeof args.limit === "number" ? Math.min(12, Math.max(1, args.limit)) : 8;
      const preview = previewWithFilters(state, args, limit);
      // Persist trial cities/age only if explicitly updating via update_filters;
      // search may pass trial overrides without mutating — already handled in previewWithFilters.
      state.lastSearchIds = preview.sample.map((s) => s.id);
      if (preview.sample[0]) state.suggestedIntroduceId = preview.sample[0].id;
      return {
        count: preview.count,
        empty: preview.empty,
        candidates: preview.sample,
        roster: rosterFromIds(
          preview.sample.map((s) => s.id),
          state.lang,
          new Set(state.blockedIds),
          state.pool,
        ),
      };
    }
    case "explain_mismatch": {
      const personId = args.personId ? String(args.personId) : null;
      if (personId) {
        const reasons = reasonsPersonFails(personId, state.hardFilters, state.lang, state.pool);
        return {
          personId,
          matches: reasons.length === 0,
          reasons: reasons.length ? reasons : [state.lang === "zh-CN" ? "符合当前硬条件" : "Passes hard filters"],
        };
      }
      return explainEmptyPool(state);
    }
    case "browse_next_person": {
      if (state.rankedQueueLength === 0) {
        return {
          error: "no_queue",
          tip:
            state.lang === "zh-CN"
              ? "当前没有可浏览的排序队列；若用户要改条件，用 request_rematch。"
              : "No ranked queue — use request_rematch if criteria changed.",
        };
      }
      const mode = args.mode === "pass" ? "pass" : "see";
      state.queueAdvance = mode;
      return { ok: true, mode };
    }
    case "request_rematch": {
      const hasPatch = Object.keys(args).some((k) => k !== "clear" || args.clear === true);
      if (hasPatch) {
        state.hardFilters = patchFilters(state.hardFilters, args);
        state.filtersTouched = true;
      }
      state.requestRematch = true;
      const preview = previewWithFilters(state, undefined, 5);
      return {
        ok: true,
        needsUserConfirm: true,
        poolCount: preview.count,
        empty: preview.empty,
        hardFilters: state.hardFilters,
        sample: preview.sample,
      };
    }
    case "pass_person": {
      const id = String(args.personId ?? state.currentPersonId ?? "");
      if (!id) {
        return { error: "no_person", tip: "No current person to pass" };
      }
      if (!state.passedIds.includes(id)) state.passedIds.push(id);
      state.blockedIds = [...new Set([...state.blockedIds, id])];
      state.passCurrentPerson = true;
      if (state.currentPersonId === id) state.currentPersonId = null;

      const recall = recallCandidates({
        ...recallState(state, { limit: 5 }),
      });
      const nextId = recall.candidates[0]?.id ?? null;
      state.suggestedIntroduceId = nextId;
      state.lastSearchIds = recall.candidates.map((c) => c.id);
      return {
        passedId: id,
        nextPersonId: nextId,
        remaining: recall.filteredCount,
        empty: recall.emptyAfterHardFilter,
      };
    }
    default:
      return { error: `unknown_tool:${name}` };
  }
}

/** Tool-phase system prompt (no JSON reply yet). */
export function matchmakerToolSystem(state: MatchmakerToolState): string {
  const zh = state.lang === "zh-CN";
  const loc = formatPlaceList(parsePlaceList(state.hardFilters.cities), state.lang);
  const genderLine =
    state.hardFilters.genders.length > 0
      ? state.hardFilters.genders.map((g) => genderLabel(g, state.lang)).join("、")
      : zh
        ? "不限"
        : "any";
  const queueLine = zh
    ? `排序队列：${state.rankedQueueLength > 0 ? `${state.rankedQueueLength} 人` : "无"}`
    : `Ranked queue: ${state.rankedQueueLength > 0 ? `${state.rankedQueueLength} people` : "none"}`;
  return zh
    ? `你是 Matchmaker 的工具规划助手。根据用户这句话，在需要时调用工具：
- 仅在同批队列里看下一位/换一个（不改条件）→ browse_next_person（默认 mode=see）；明确说不合适 → mode=pass
- 改条件/软偏好并重新筛选一批 → request_rematch（硬条件可带 filter 参数；软偏好由 extract 同步，你负责 rematchConfirmLine）；不确定要不要重筛时不要调用
- 问池子统计/分布/放宽哪条 → pool_facets
- 试探条件、问还有多少人 → preview_pool
- 仅改硬条件、不立刻重筛 → update_filters
- 问为什么没有/某人为何不合适 → explain_mismatch
- 无队列时的跳过 → pass_person
不需要工具时不要调用。不要输出最终聊天 JSON。
当前硬条件：性别 ${genderLine}；年龄 ${state.hardFilters.ageMin ?? "?"}–${state.hardFilters.ageMax ?? "?"}；地点 ${loc || "无"}；当前介绍 ${state.currentPersonId ?? "无"}；${queueLine}。
池中共有 ${state.pool.length} 人（含各国城市）。中国别名：中国=China=cn。`
    : `You plan Matchmaker tools. Call tools when needed:
- browse within current batch → browse_next_person (default mode=see); explicit rejection → mode=pass
- change criteria/soft prefs and re-screen → request_rematch (optional hard-filter args; soft prefs via extract — you output rematchConfirmLine); if intent unclear, call none
- pool stats / distribution / what to relax → pool_facets
- trial filters / how many → preview_pool
- filter edit without rematch → update_filters
- why empty / mismatch → explain_mismatch
- skip without queue → pass_person
If no tool needed, call none. Do not output final chat JSON yet.
Current filters: gender ${genderLine}; age ${state.hardFilters.ageMin ?? "?"}–${state.hardFilters.ageMax ?? "?"}; location ${loc || "none"}; current ${state.currentPersonId ?? "none"}; ${queueLine}.
Pool size ${state.pool.length}. China aliases: 中国=China=cn.`;
}
