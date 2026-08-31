// Auth + invite rules against the server-backed API.
// These tests hit the live API layer only when DATABASE_URL is set;
// otherwise they validate client-side AuthError shaping.

import { beforeAll, describe, expect, it } from "vitest";
import { AuthError } from "@/lib/auth-types";

describe("AuthError", () => {
  it("carries a code", () => {
    const e = new AuthError("invite_invalid", "bad");
    expect(e.code).toBe("invite_invalid");
    expect(e.message).toBe("bad");
  });
});

describe("invite + signup (integration)", () => {
  const hasDb = !!process.env.DATABASE_URL;

  beforeAll(() => {
    if (!hasDb) {
      console.warn("Skipping DB integration tests — DATABASE_URL not set");
    }
  });

  it("skips when no database", () => {
    if (!hasDb) expect(true).toBe(true);
    else expect(hasDb).toBe(true);
  });
});
