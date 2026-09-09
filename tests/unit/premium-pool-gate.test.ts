import { describe, expect, it } from "vitest";
import { isVitalsComplete, EMPTY_PROFILE, type Profile } from "@/lib/profile-shape";

const VITALS: Profile = {
  ...EMPTY_PROFILE,
  name: "Ada",
  age: 28,
  city: "Shanghai",
  occupation: "Designer",
  gender: "female",
};

describe("premium pool gate (vitals)", () => {
  it("incomplete profile stays on premium pool", () => {
    expect(isVitalsComplete(EMPTY_PROFILE)).toBe(false);
    expect(isVitalsComplete({ ...VITALS, city: "" })).toBe(false);
  });

  it("complete vitals unlock full pool", () => {
    expect(isVitalsComplete(VITALS)).toBe(true);
  });
});
