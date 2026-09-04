import { isHidden, type Profile } from "./profile-shape";
import type { Person, PersonGender } from "./types";
import type { Intent } from "./intents";

/** Denormalized publisher info on each Intent for buddy hard filters. */
export interface OwnerSnapshot {
  name: string;
  name_zh: string;
  gender: PersonGender | "";
  age: number | null;
  city: string;
  city_zh: string;
  avatar?: string;
  occupation?: string;
}

export function normalizeOwnerGender(raw: string | undefined | null): PersonGender | "" {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "female" || t === "女" || t === "女生" || t === "f") return "female";
  if (t === "male" || t === "男" || t === "男生" || t === "m") return "male";
  if (t === "nonbinary" || t === "非二元" || t === "nb") return "nonbinary";
  return "";
}

export function ownerSnapshotFromPerson(p: Person): OwnerSnapshot {
  return {
    name: p.name,
    name_zh: p.name_zh,
    gender: p.gender,
    age: p.age,
    city: p.city,
    city_zh: p.city_zh,
  };
}

export function ownerSnapshotFromProfile(p: Profile): OwnerSnapshot {
  const name = p.name?.trim() ?? "";
  return {
    name: name || "",
    name_zh: name || "",
    gender: normalizeOwnerGender(p.gender),
    age: p.age,
    city: p.city?.trim() ?? "",
    city_zh: p.city?.trim() ?? "",
    avatar: p.avatar?.trim() && !isHidden(p, "avatar") ? p.avatar.trim() : undefined,
    occupation: p.occupation?.trim() || undefined,
  };
}

/** Resolve snapshot from intent (stored) or legacy owner fields. */
export function resolveOwnerSnapshot(it: Intent): OwnerSnapshot {
  if (it.ownerSnapshot) return it.ownerSnapshot;
  return {
    name: it.ownerName,
    name_zh: it.ownerName_zh,
    gender: "",
    age: null,
    city: it.ownerCity || it.city,
    city_zh: it.ownerCity_zh || it.city_zh,
  };
}
