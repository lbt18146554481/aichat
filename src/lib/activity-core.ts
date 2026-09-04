/**
 * Activity core: short open phrase for "what to do" (e.g. 跑步), without when/where.
 * Legacy ActivityKind enums remain for UI/compat and are mapped when possible.
 */

import type { ActivityKind } from "./types";
import type { Intent } from "./intents";
import type { WishDraft } from "./wish-types";
import {
  constrainedFromLegacy,
  isConstraintAny,
  isHardConstrained,
  parseStrength,
  type Constrained,
  type ConstraintStrength,
} from "./field-constraint";
import { semanticSimilarity } from "./text-similarity";

/** Min similarity (0..1) when activityStrength is hard — below → drop. */
export const ACTIVITY_CORE_HARD_THRESHOLD = 0.35;

/** Score multiplier after similarity for flex vs hard (passed threshold). */
export const ACTIVITY_CORE_SCORE_WEIGHT = {
  flex: 6,
  hard: 12,
} as const;

const KIND_TO_CORE_ZH: Record<ActivityKind, string> = {
  tennis: "网球",
  run: "跑步",
  climb: "攀岩",
  cook: "做饭",
  exhibition: "看展",
  bookstore: "逛书店",
  other: "",
};

const CORE_TO_KIND: Array<{ re: RegExp; kind: ActivityKind }> = [
  { re: /网球|tennis/i, kind: "tennis" },
  { re: /跑步|慢跑|夜跑|走跑|run|jog/i, kind: "run" },
  { re: /攀岩|爬山|徒步|climb|hike|bouldering/i, kind: "climb" },
  { re: /做饭|下厨|cook|cooking/i, kind: "cook" },
  { re: /看展|展览|展会|exhibition|gallery/i, kind: "exhibition" },
  { re: /书店|读书会|bookstore/i, kind: "bookstore" },
];

export function activityCoreFromKind(kind: ActivityKind | null | undefined): string {
  if (!kind || kind === "other") return "";
  return KIND_TO_CORE_ZH[kind] || "";
}

export function kindFromActivityCore(core: string): ActivityKind {
  const t = core.trim();
  if (!t) return "other";
  for (const row of CORE_TO_KIND) {
    if (row.re.test(t)) return row.kind;
  }
  return "other";
}

/** Prefer explicit activityCore; else map legacy kind; else empty. */
export function resolveActivityCoreText(
  item: Pick<WishDraft | Intent, "activityCore" | "kind" | "rawText" | "activityDescRaw"> & {
    rawText_zh?: string;
  },
): string {
  const explicit = item.activityCore?.trim();
  if (explicit && !isConstraintAny(explicit)) return explicit;
  const fromKind = activityCoreFromKind(item.kind ?? null);
  if (fromKind) return fromKind;
  return "";
}

export function resolveActivityConstraint(
  item: Pick<WishDraft | Intent, "activityCore" | "activityStrength" | "kind"> & {
    activityDescRaw?: string;
    rawText?: string;
  },
): Constrained<string> {
  const text = resolveActivityCoreText(item);
  if (!text) return { value: null, strength: null };
  return constrainedFromLegacy({
    value: text,
    strength: item.activityStrength,
    defaultStrength: "flex",
  });
}

export function activityCoreSimilarity(mineCore: string, otherCore: string): number {
  const a = mineCore.trim();
  const b = otherCore.trim();
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;

  // Same legacy kind bucket → strong match (慢跑/夜跑/跑步).
  const ka = kindFromActivityCore(a);
  const kb = kindFromActivityCore(b);
  if (ka !== "other" && ka === kb) return 0.9;

  // CJK short phrases: shared character ratio.
  const charsA = [...a].filter((c) => c.trim());
  const charsB = [...b].filter((c) => c.trim());
  if (charsA.length && charsB.length) {
    const setB = new Set(charsB);
    const shared = charsA.filter((c) => setB.has(c)).length;
    const charSim = (2 * shared) / (charsA.length + charsB.length);
    if (charSim > 0) {
      return Math.max(charSim, semanticSimilarity(a, b));
    }
  }

  return semanticSimilarity(a, b);
}

/** Candidate text for core↔core: prefer activityCore/kind map; else short desc only. */
export function resolveCandidateActivityText(
  other: Pick<WishDraft | Intent, "activityCore" | "kind" | "rawText" | "activityDescRaw"> & {
    rawText_zh?: string;
  },
): string {
  const core = resolveActivityCoreText(other);
  if (core) return core;
  const desc = (other.activityDescRaw || other.rawText || other.rawText_zh || "").trim();
  if (!desc) return "";
  if (desc.length <= 16) return desc;
  return "";
}

/** Hard gate: when seeker activity is hard, other must clear similarity threshold. */
export function passesActivityCoreHardFilter(mine: Intent, other: Intent): boolean {
  const c = resolveActivityConstraint(mine);
  if (!isHardConstrained(c)) return true;
  const otherText = resolveCandidateActivityText(other);
  if (!otherText) return false;
  return activityCoreSimilarity(String(c.value), otherText) >= ACTIVITY_CORE_HARD_THRESHOLD;
}

/** Contribution to vector/activity score (0 if no cores). */
export function activityCoreMatchScore(mine: Intent, other: Intent): number {
  const c = resolveActivityConstraint(mine);
  if (isConstraintAny(c.value) || c.value == null) return 0;
  const otherText = resolveCandidateActivityText(other);
  if (!otherText) return 0;
  const sim = activityCoreSimilarity(String(c.value), otherText);
  if (isHardConstrained(c)) {
    if (sim < ACTIVITY_CORE_HARD_THRESHOLD) return 0;
    return sim * ACTIVITY_CORE_SCORE_WEIGHT.hard;
  }
  return sim * ACTIVITY_CORE_SCORE_WEIGHT.flex;
}

export function normalizeActivityStrength(raw: unknown): ConstraintStrength | null {
  return parseStrength(raw);
}
