/**
 * Side people match batch: recall Top10 → optional LLM reorder → intro payload.
 */

import type { Person } from "./types";
import type { Profile } from "./profile-shape";
import type { UserUnderstanding } from "./understanding";
import type { WishDraft } from "./wish-types";
import type { MatchHardFilters } from "./match-types";
import { chatCompletionJson } from "./llm.server";
import {
  recallSidePeople,
  sidePlaceHardFilters,
  SIDE_HANG_REMATCH_MS,
  buildActivityQuery,
} from "./side-people-recall";
import {
  runSideHangInviteSummary,
  runSidePersonIntro,
  runSideEmptyPeopleReply,
  type SideLang,
} from "./side-people-intro.server";
import { getMatchablePeopleForSeeker } from "./people-store.server";

export interface SidePeopleMatchInput {
  lang: SideLang;
  profile: Profile;
  understanding: UserUnderstanding;
  wishDraft: WishDraft;
  hardFilters: MatchHardFilters;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  blockedIds: string[];
  shownIds: string[];
  passedIds: string[];
  rankedQueue: string[];
  queueCursor: number;
  /** see_next / skip: advance within queue without full rebuild when possible */
  action: "search" | "see_next" | "skip" | "rematch_hang";
  onDelta?: (text: string) => void;
}

export interface SidePeopleMatchResult {
  reply: string;
  currentPersonId: string | null;
  personSummary: string;
  whyTags: string[];
  rankedQueue: string[];
  queueReasons: Record<string, string>;
  queueCursor: number;
  shownIds: string[];
  passedIds: string[];
  recallEmpty: boolean;
  hangingInvite: {
    summary: string;
    createdAt: number;
    nextRematchAt: number;
  } | null;
  stage: "hanging" | "introducing" | "prompt";
}

async function rankPeopleIds(opts: {
  lang: SideLang;
  ids: string[];
  activityQuery: string;
  pool: Person[];
}): Promise<{ rankedIds: string[]; reasons: Record<string, string> }> {
  if (opts.ids.length <= 1) {
    return { rankedIds: opts.ids, reasons: {} };
  }
  const isZh = opts.lang === "zh-CN";
  const roster = opts.ids
    .map((id) => {
      const p = opts.pool.find((x) => x.id === id);
      if (!p) return null;
      const name = isZh ? p.name_zh || p.name : p.name;
      const city = isZh ? p.city_zh || p.city : p.city;
      return `${id} | ${name} | ${city} | ${(p.profileText || "").slice(0, 120)}`;
    })
    .filter(Boolean)
    .join("\n");

  const parsed = await chatCompletionJson<{
    rankedIds?: string[];
    reasons?: Record<string, string>;
  }>(
    [
      {
        role: "system",
        content: isZh
          ? `按「愿意一起做该活动」重排候选人。只使用给出的 id。JSON：{"rankedIds":["id1",...],"reasons":{"id1":"一句短理由"}}`
          : `Reorder candidates by fit for the activity. Use only given ids. JSON: {"rankedIds":["id1",...],"reasons":{"id1":"short reason"}}`,
      },
      {
        role: "user",
        content: isZh
          ? `【活动】${opts.activityQuery}\n【候选人】\n${roster}`
          : `[Activity] ${opts.activityQuery}\n[Candidates]\n${roster}`,
      },
    ],
    { temperature: 0.3, maxTokens: 800 },
  );

  const allowed = new Set(opts.ids);
  const rankedIds = (parsed?.rankedIds ?? [])
    .map((id) => String(id).trim())
    .filter((id) => allowed.has(id));
  for (const id of opts.ids) {
    if (!rankedIds.includes(id)) rankedIds.push(id);
  }
  const reasons: Record<string, string> = {};
  if (parsed?.reasons && typeof parsed.reasons === "object") {
    for (const [id, r] of Object.entries(parsed.reasons)) {
      if (allowed.has(id) && typeof r === "string" && r.trim()) reasons[id] = r.trim();
    }
  }
  return { rankedIds, reasons };
}

export async function executeSidePeopleMatch(
  input: SidePeopleMatchInput,
): Promise<SidePeopleMatchResult> {
  const pool = await getMatchablePeopleForSeeker(input.profile);
  const hardFilters = sidePlaceHardFilters(input.wishDraft, input.profile, input.hardFilters);
  const activityQuery = buildActivityQuery(input.wishDraft);

  let rankedQueue = [...(input.rankedQueue ?? [])];
  let queueCursor = input.queueCursor ?? 0;
  let queueReasons: Record<string, string> = {};
  let shownIds = [...input.shownIds];
  let passedIds = [...input.passedIds];

  const rebuild =
    input.action === "search" ||
    input.action === "rematch_hang" ||
    rankedQueue.length === 0 ||
    input.action === "skip";

  if (input.action === "skip" && input.rankedQueue[input.queueCursor]) {
    const cur = input.rankedQueue[input.queueCursor]!;
    if (!passedIds.includes(cur)) passedIds = [...passedIds, cur];
  }

  if (rebuild && input.action !== "see_next") {
    const recall = recallSidePeople({
      understanding: input.understanding,
      hardFilters,
      wishDraft: input.wishDraft,
      blockedIds: input.blockedIds,
      shownIds,
      passedIds,
      pool,
      seekerProfile: input.profile,
    });

    if (recall.candidates.length === 0) {
      const hangSummary = await runSideHangInviteSummary({
        lang: input.lang,
        draft: input.wishDraft,
        history: input.history,
      });
      const now = Date.now();
      const reply = await runSideEmptyPeopleReply({
        lang: input.lang,
        draft: input.wishDraft,
        hangSummary,
      });
      return {
        reply,
        currentPersonId: null,
        personSummary: "",
        whyTags: [],
        rankedQueue: [],
        queueReasons: {},
        queueCursor: 0,
        shownIds,
        passedIds,
        recallEmpty: true,
        hangingInvite: {
          summary: hangSummary,
          createdAt: now,
          nextRematchAt: now + SIDE_HANG_REMATCH_MS,
        },
        stage: "hanging",
      };
    }

    const ranked = await rankPeopleIds({
      lang: input.lang,
      ids: recall.candidates.map((c) => c.id),
      activityQuery,
      pool,
    });
    rankedQueue = ranked.rankedIds;
    queueReasons = ranked.reasons;
    queueCursor = 0;
  } else if (input.action === "see_next" || input.action === "skip") {
    const nextCursor = queueCursor + 1;
    if (nextCursor >= rankedQueue.length) {
      // Past end — rebuild excluding shown/passed
      const recall = recallSidePeople({
        understanding: input.understanding,
        hardFilters,
        wishDraft: input.wishDraft,
        blockedIds: input.blockedIds,
        shownIds,
        passedIds,
        pool,
        seekerProfile: input.profile,
      });
      if (recall.candidates.length === 0) {
        const hangSummary = await runSideHangInviteSummary({
          lang: input.lang,
          draft: input.wishDraft,
          history: input.history,
        });
        const now = Date.now();
        return {
          reply: await runSideEmptyPeopleReply({
            lang: input.lang,
            draft: input.wishDraft,
            hangSummary,
          }),
          currentPersonId: null,
          personSummary: "",
          whyTags: [],
          rankedQueue: [],
          queueReasons: {},
          queueCursor: 0,
          shownIds,
          passedIds,
          recallEmpty: true,
          hangingInvite: {
            summary: hangSummary,
            createdAt: now,
            nextRematchAt: now + SIDE_HANG_REMATCH_MS,
          },
          stage: "hanging",
        };
      }
      const ranked = await rankPeopleIds({
        lang: input.lang,
        ids: recall.candidates.map((c) => c.id),
        activityQuery,
        pool,
      });
      rankedQueue = ranked.rankedIds;
      queueReasons = ranked.reasons;
      queueCursor = 0;
    } else {
      queueCursor = nextCursor;
    }
  }

  const personId = rankedQueue[queueCursor] ?? rankedQueue[0] ?? null;
  if (!personId) {
    const hangSummary = await runSideHangInviteSummary({
      lang: input.lang,
      draft: input.wishDraft,
      history: input.history,
    });
    const now = Date.now();
    return {
      reply: await runSideEmptyPeopleReply({
        lang: input.lang,
        draft: input.wishDraft,
        hangSummary,
      }),
      currentPersonId: null,
      personSummary: "",
      whyTags: [],
      rankedQueue,
      queueReasons,
      queueCursor,
      shownIds,
      passedIds,
      recallEmpty: true,
      hangingInvite: {
        summary: hangSummary,
        createdAt: now,
        nextRematchAt: now + SIDE_HANG_REMATCH_MS,
      },
      stage: "hanging",
    };
  }

  if (!shownIds.includes(personId)) shownIds = [...shownIds, personId];
  const person = pool.find((p) => p.id === personId);
  if (!person) {
    return {
      reply:
        input.lang === "zh-CN"
          ? "这位候选人暂时无法展示，换一个试试。"
          : "That candidate isn't available — try the next one.",
      currentPersonId: null,
      personSummary: "",
      whyTags: [],
      rankedQueue,
      queueReasons,
      queueCursor,
      shownIds,
      passedIds,
      recallEmpty: false,
      hangingInvite: null,
      stage: "prompt",
    };
  }

  const intro = await runSidePersonIntro({
    lang: input.lang,
    person,
    draft: input.wishDraft,
    rankReason: queueReasons[personId],
    onDelta: input.onDelta,
  });

  return {
    reply: intro.reply,
    currentPersonId: personId,
    personSummary: intro.personSummary,
    whyTags: intro.whyTags,
    rankedQueue,
    queueReasons,
    queueCursor,
    shownIds,
    passedIds,
    recallEmpty: false,
    hangingInvite: null,
    stage: "introducing",
  };
}
