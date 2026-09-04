import { canonicalCityId } from "./geo";
import {
  slotToWhen,
  type Intent,
  type LevelTier,
  type WhenTier,
} from "./intents";

export type IntentStatus = "active" | "expired" | "matched" | "revoked";

export const WISH_INTENT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface IntentIndexFields {
  kind: string;
  cityId: string;
  status: IntentStatus;
  whenTier: string;
  levelTier: string;
}

export function intentStatus(it: Intent): IntentStatus {
  return it.status ?? "active";
}

export function intentCityId(it: Intent): string {
  const raw = it.city || it.ownerCity || it.city_zh || it.ownerCity_zh || "";
  return canonicalCityId(raw);
}

export function intentWhenTier(it: Intent): WhenTier | "any" {
  if (it.whenAny) return "any";
  return slotToWhen(it.day, it.window);
}

export function intentLevelTier(it: Intent): LevelTier | "any" {
  if (it.levelAny) return "any";
  return it.level;
}

export function intentIndexFromIntent(it: Intent): IntentIndexFields {
  return {
    kind: it.kind,
    cityId: intentCityId(it),
    status: intentStatus(it),
    whenTier: intentWhenTier(it),
    levelTier: intentLevelTier(it),
  };
}

export function isIntentRecallable(it: Intent, now = Date.now()): boolean {
  if (intentStatus(it) !== "active") return false;
  const created = it.createdAt ?? 0;
  if (created > 0 && now - created > WISH_INTENT_MAX_AGE_MS) return false;
  return true;
}
