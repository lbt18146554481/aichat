import { loadMyIntents, replaceMyIntentRecord, type Intent } from "./intents";
import { mergeDraftIntoIntent } from "./wish-draft-intent";
import type { Profile } from "./profile-shape";
import type { WishDraft } from "./wish-types";

export { intentToWishDraft } from "./wish-draft-intent";

/** Replace a published wish from an edited draft and persist to the server. */
export function replaceMyIntent(
  id: string,
  draft: WishDraft,
  profile?: Profile,
): Intent | null {
  const list = loadMyIntents();
  const idx = list.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const next = mergeDraftIntoIntent(list[idx]!, draft, { profile });
  if (!replaceMyIntentRecord(next)) return null;
  void import("./api/data.functions").then(({ publishIntentFn }) =>
    publishIntentFn({ data: { intent: next as unknown as Record<string, unknown> } }).catch(
      console.error,
    ),
  );
  return next;
}
