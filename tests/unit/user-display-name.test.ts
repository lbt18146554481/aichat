import { describe, expect, it } from "vitest";
import { resolveUserDisplayName } from "@/lib/profile";
import { EMPTY_PROFILE } from "@/lib/profile-shape";

describe("resolveUserDisplayName", () => {
  it("prefers profile nickname over email", () => {
    expect(
      resolveUserDisplayName({ ...EMPTY_PROFILE, name: " 小明 " }, { email: "alice@example.com" }),
    ).toBe("小明");
  });

  it("falls back to full email when nickname is empty", () => {
    expect(resolveUserDisplayName({ ...EMPTY_PROFILE, name: "" }, { email: "alice@example.com" })).toBe(
      "alice@example.com",
    );
  });

  it("does not use auth user.name email-prefix fallback", () => {
    expect(
      resolveUserDisplayName({ ...EMPTY_PROFILE, name: "" }, { email: "alice@example.com" }),
    ).not.toBe("alice");
  });
});
