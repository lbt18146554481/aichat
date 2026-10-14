/**
 * Server-only people recall with embeddings.
 * Keep this out of client bundles — sync lexical recall lives in match-recall.ts.
 */

import { buildPreferenceQuery } from "./person-facets";
import { embedMany } from "./embeddings.server";
import {
  personMatchDoc,
  personPassesHardFilters,
  softScoreAsync,
} from "./match-recall";
import type { MatchHardFilters, RecallOpts, RecallResult, RecalledCandidate } from "./match-types";
import type { Person } from "./types";
import type { UserUnderstanding } from "./understanding";
import type { Profile } from "./profile-shape";
import { MATCH_QUEUE_LIMIT } from "./matchmaker-queue";

const DEFAULT_LIMIT = 10;

/** Server recall: batch embeddings + chat-priority soft weights. */
export async function recallCandidatesAsync(opts: RecallOpts): Promise<RecallResult> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const blocked = new Set(opts.blockedIds);
  const chatU = opts.chatUnderstanding ?? opts.understanding;
  const preferenceQuery = buildPreferenceQuery(chatU);
  const pool = opts.pool ?? [];

  const available = pool.filter((p) => !blocked.has(p.id));
  const afterHard = available.filter((p) => personPassesHardFilters(p, opts));

  if (afterHard.length === 0) {
    return { candidates: [], filteredCount: 0, emptyAfterHardFilter: true };
  }

  const docs = afterHard.map(personMatchDoc);
  const negTexts = chatU.negative.map((n) => n.trim()).filter(Boolean);
  const toEmbed: string[] = [];
  if (preferenceQuery.trim()) toEmbed.push(preferenceQuery);
  toEmbed.push(...docs);
  toEmbed.push(...negTexts);

  const vectors = await embedMany(toEmbed);
  let offset = 0;
  const queryVec = preferenceQuery.trim() ? vectors[offset++] ?? null : null;
  const docVecs = docs.map(() => vectors[offset++] ?? null);
  const negVecs = negTexts.map(() => vectors[offset++] ?? null);

  const scored: RecalledCandidate[] = [];
  for (let i = 0; i < afterHard.length; i++) {
    const p = afterHard[i]!;
    const { score, vectorScore } = await softScoreAsync(p, opts, preferenceQuery, {
      queryVec,
      docVec: docVecs[i] ?? null,
      negVecs,
    });
    scored.push({
      id: p.id,
      score,
      vectorScore: preferenceQuery.trim() ? vectorScore : undefined,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    candidates: scored.slice(0, limit),
    filteredCount: afterHard.length,
    emptyAfterHardFilter: false,
  };
}

export async function recallQueueIdsAsync(opts: {
  understanding: UserUnderstanding;
  hardFilters: MatchHardFilters;
  blockedIds: string[];
  shownIds: string[];
  passedIds: string[];
  pool?: Person[];
  seekerProfile?: Profile | null;
  chatUnderstanding?: UserUnderstanding;
  chatHardFilters?: MatchHardFilters;
}): Promise<{ ids: string[]; empty: boolean }> {
  const recall = await recallCandidatesAsync({ ...opts, limit: MATCH_QUEUE_LIMIT });
  return {
    ids: recall.candidates.map((c) => c.id),
    empty: recall.emptyAfterHardFilter,
  };
}
