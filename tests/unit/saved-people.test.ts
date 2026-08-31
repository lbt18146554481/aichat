// Saved people / saved wishes store — the entry point behind the header
// bookmark and the mobile Me hub. Save must be an idempotent toggle that
// never auto-advances or drops entries for people who still exist.

import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetSavedPeopleCache,
  isPersonSaved,
  listSavedPeople,
  removeSavedPerson,
  savePerson,
  toggleSavedPerson,
} from "@/lib/saved-people";

beforeEach(() => {
  _resetSavedPeopleCache();
});

describe("saved people", () => {
  it("starts empty", () => {
    expect(listSavedPeople()).toEqual([]);
  });

  it("saves and reads back a person", () => {
    savePerson("isa", "s1");
    expect(isPersonSaved("isa")).toBe(true);
    expect(listSavedPeople().map((r) => r.personId)).toEqual(["isa"]);
  });

  it("is idempotent — saving twice keeps one row", () => {
    savePerson("isa", "s1");
    savePerson("isa", "s2");
    expect(listSavedPeople()).toHaveLength(1);
  });

  it("toggles off without touching other rows", () => {
    savePerson("isa", "s1");
    savePerson("june", "s1");
    toggleSavedPerson("isa", "s1");
    expect(isPersonSaved("isa")).toBe(false);
    expect(isPersonSaved("june")).toBe(true);
  });

  it("lists newest first", () => {
    savePerson("isa", "s1");
    savePerson("june", "s1");
    expect(listSavedPeople()[0].personId).toBe("june");
  });

  it("hides entries whose person no longer exists", () => {
    savePerson("ghost-who-was-removed", "s1");
    expect(listSavedPeople()).toEqual([]);
  });

  it("remove is safe on an unknown id", () => {
    expect(() => removeSavedPerson("nobody")).not.toThrow();
  });
});
