import { describe, expect, it } from "vitest";
import { ownerSnapshotFromPerson, resolveOwnerSnapshot } from "@/lib/owner-snapshot";
import {
  EMPTY_BUDDY_HARD_FILTERS,
  ownerPassesBuddyHardFilters,
} from "@/lib/buddy-filters";
import { seedPool } from "@/lib/intents";
import { buildSeedPeople } from "@/lib/people-seed.data";

describe("buddy-filters", () => {
  it("filters by gender when requested", () => {
    const female = ownerSnapshotFromPerson(buildSeedPeople().find((p) => p.id === "isa")!);
    const male = ownerSnapshotFromPerson(buildSeedPeople().find((p) => p.id === "theo")!);
    const f = { ...EMPTY_BUDDY_HARD_FILTERS, genders: ["female" as const] };
    expect(ownerPassesBuddyHardFilters(female, f)).toBe(true);
    expect(ownerPassesBuddyHardFilters(male, f)).toBe(false);
  });

  it("filters by age range", () => {
    const owner = { name: "A", name_zh: "A", gender: "" as const, age: 28, city: "X", city_zh: "X" };
    const f = { ...EMPTY_BUDDY_HARD_FILTERS, ageMin: 25, ageMax: 30 };
    expect(ownerPassesBuddyHardFilters(owner, f)).toBe(true);
    expect(ownerPassesBuddyHardFilters({ ...owner, age: 22 }, f)).toBe(false);
  });

  it("seed intents carry owner snapshots", () => {
    const withSnap = seedPool().filter((it) => it.ownerSnapshot?.gender);
    expect(withSnap.length).toBeGreaterThan(30);
    const first = withSnap[0]!;
    expect(resolveOwnerSnapshot(first).gender).toBeTruthy();
  });
});
