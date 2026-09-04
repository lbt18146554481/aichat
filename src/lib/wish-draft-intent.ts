import type { Intent } from "./intents";
import { slotToWhen } from "./intents";
import type { Profile } from "./profile-shape";
import type { WishDraft, WishHardFilters } from "./wish-types";
import { resolveDraftDates } from "./wish-date";
import { wishDescriptionsFromDraft } from "./wish-match-profile";
import {
  isPlaceAny,
  legacyFlagsFromSpec,
  normalizePlaceSpec,
  PLACE_ANY,
} from "./wish-place";

/** Browse/search drafts must not share ownerId "me" — published wishes also use "me",
 *  and the recall pool query excludes the seeker's ownerId. */
export const DRAFT_BROWSE_OWNER_ID = "draft-browse";

/** Ephemeral intent for browse recall — not published to the pool. */
export function draftAsIntent(
  draft: WishDraft,
  opts?: { profile?: Profile; hardFilters?: WishHardFilters; id?: string },
): Intent {
  const profileCity = opts?.profile?.city?.trim() ?? "";
  const spec = normalizePlaceSpec(draft);
  const flags = legacyFlagsFromSpec(spec);
  const geoUnrestricted =
    spec.placeMode === "online" ||
    spec.placeMode === "any" ||
    isPlaceAny(spec.place?.city);
  const cityFromPlace =
    spec.place && isPlaceAny(spec.place.city)
      ? PLACE_ANY
      : typeof spec.place?.city === "string" && spec.place.city
        ? spec.place.city
        : "";
  const city = geoUnrestricted
    ? cityFromPlace === PLACE_ANY
      ? ""
      : ""
    : draft.city?.trim() || cityFromPlace || profileCity;
  const cityZh = geoUnrestricted
    ? ""
    : draft.city_zh?.trim() || draft.city?.trim() || cityFromPlace || profileCity;
  const dates = resolveDraftDates(draft);
  const desc = wishDescriptionsFromDraft(draft);
  return {
    id: opts?.id ?? "draft-preview",
    ownerId: DRAFT_BROWSE_OWNER_ID,
    ownerName: "You",
    ownerName_zh: "你",
    ownerCity: city,
    ownerCity_zh: cityZh,
    kind: draft.kind ?? "other",
    activityCore: draft.activityCore?.trim() || undefined,
    activityStrength: draft.activityStrength ?? null,
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
    placeMode: flags.placeMode,
    placeOnline: flags.placeOnline,
    placeFlex: flags.placeFlex,
    place: flags.place ?? undefined,
    placeStrength: draft.placeStrength ?? null,
    whenStrength: draft.whenStrength ?? null,
    levelStrength: draft.levelStrength ?? null,
    buddyGenderStrength: draft.buddyGenderStrength ?? null,
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
  const spec = normalizePlaceSpec(intent);
  const flags = legacyFlagsFromSpec(spec);
  return {
    kind: intent.kind,
    activityCore: intent.activityCore,
    activityStrength: intent.activityStrength ?? null,
    when,
    level: intent.levelAny ? undefined : intent.level,
    city: intent.city || intent.ownerCity,
    city_zh: intent.city_zh || intent.ownerCity_zh,
    placeRaw: intent.placeRaw,
    placeMode: flags.placeMode,
    placeOnline: flags.placeOnline,
    placeFlex: flags.placeFlex,
    place: flags.place ?? undefined,
    placeStrength: intent.placeStrength ?? null,
    whenStrength: intent.whenStrength ?? null,
    levelStrength: intent.levelStrength ?? null,
    buddyGenderStrength: intent.buddyGenderStrength ?? null,
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
    ownerId: existing.ownerId,
    ownerName: existing.ownerName,
    ownerName_zh: existing.ownerName_zh,
  };
}
