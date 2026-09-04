import type { Intent } from "./intents";
import { slotToWhen } from "./intents";
import type { Profile } from "./profile-shape";
import type { WishDraft, WishHardFilters } from "./wish-types";
import { resolveDraftDates } from "./wish-date";
import { wishDescriptionsFromDraft } from "./wish-match-profile";
import { resolvePlaceOnline } from "./wish-place";

/** Ephemeral intent for browse recall — not published to the pool. */
export function draftAsIntent(
  draft: WishDraft,
  opts?: { profile?: Profile; hardFilters?: WishHardFilters; id?: string },
): Intent {
  const profileCity = opts?.profile?.city?.trim() ?? "";
  const isOnline = resolvePlaceOnline(draft);
  const city = isOnline ? "" : draft.city?.trim() || profileCity;
  const cityZh = isOnline ? "" : draft.city_zh?.trim() || draft.city?.trim() || profileCity;
  const dates = resolveDraftDates(draft);
  const desc = wishDescriptionsFromDraft(draft);
  return {
    id: opts?.id ?? "draft-preview",
    ownerId: "me",
    ownerName: "You",
    ownerName_zh: "你",
    ownerCity: city,
    ownerCity_zh: cityZh,
    kind: draft.kind ?? "other",
    day: "sat",
    window: "evening",
    whenAny: draft.whenAny || draft.when === "any" || !draft.when,
    level: draft.level ?? "intermediate",
    levelAny: draft.levelAny || !draft.level,
    city,
    city_zh: cityZh,
    venue: "",
    venue_zh: "",
    rawText: desc.activityDescRaw,
    rawText_zh: desc.activityDescRaw,
    activityDescRaw: desc.activityDescRaw || undefined,
    buddyPrefRaw: desc.buddyPrefRaw || undefined,
    otherReqRaw: desc.otherReqRaw || undefined,
    buddyMatchQuery: draft.buddyMatchQuery,
    placeRaw: draft.placeRaw,
    placeOnline: isOnline,
    placeFlex: draft.placeFlex,
    place: draft.place,
    status: "active",
    strictWhen: draft.strictWhen ?? false,
    strictLevel: draft.strictLevel ?? false,
    allowCrossCity: draft.allowCrossCity ?? opts?.hardFilters?.allowCrossCity ?? false,
    ...dates,
    createdAt: Date.now(),
  };
}

/** Reverse map a published intent back into an editable draft. */
export function intentToWishDraft(intent: Intent): WishDraft {
  const when = intent.whenAny ? undefined : slotToWhen(intent.day, intent.window);
  const activityDesc = intent.activityDescRaw?.trim() || intent.rawText?.trim() || "";
  return {
    kind: intent.kind,
    when,
    level: intent.levelAny ? undefined : intent.level,
    city: intent.city || intent.ownerCity,
    city_zh: intent.city_zh || intent.ownerCity_zh,
    placeRaw: intent.placeRaw,
    placeOnline: intent.placeOnline,
    placeFlex: intent.placeFlex,
    place: intent.place,
    rawText: activityDesc,
    activityDescRaw: activityDesc,
    whenAny: intent.whenAny ?? !when,
    levelAny: intent.levelAny ?? !intent.level,
    strictWhen: intent.strictWhen,
    strictLevel: intent.strictLevel,
    allowCrossCity: intent.allowCrossCity,
    dateStart: intent.dateStart,
    dateEnd: intent.dateEnd,
    timeStart: intent.timeStart,
    timeEnd: intent.timeEnd,
    buddyPrefRaw: intent.buddyPrefRaw,
    otherReqRaw: intent.otherReqRaw,
    buddyMatchQuery: intent.buddyMatchQuery,
  };
}

/** Apply draft edits onto an existing published intent (keeps id + createdAt). */
export function mergeDraftIntoIntent(
  existing: Intent,
  draft: WishDraft,
  opts?: { profile?: Profile },
): Intent {
  const merged = draftAsIntent(draft, { profile: opts?.profile, id: existing.id });
  return {
    ...merged,
    createdAt: existing.createdAt,
    ownerSnapshot: existing.ownerSnapshot ?? merged.ownerSnapshot,
  };
}
