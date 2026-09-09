import { describe, expect, it } from "vitest";
import { asAuthError, authErrorMessage } from "@/lib/auth-errors";
import { AuthError } from "@/lib/auth-types";

const t = ((key: string) => {
  const map: Record<string, string> = {
    "auth.err.invalid_credentials": "邮箱或密码不正确。",
    "auth.err.email_taken": "这个邮箱已经注册过了，可以直接登录。",
    "auth.err.invalid_email": "请输入有效的邮箱地址。",
    "auth.err.generic": "出了点问题，请稍后再试。",
    "auth.err.server_error": "出了点问题，请稍后再试。",
    "auth.err.db_unavailable": "暂时连不上服务器，请稍后再试。",
  };
  return map[key] ?? key;
}) as import("i18next").TFunction;

describe("asAuthError", () => {
  it("parses JSON-coded Error from server-fn transport", () => {
    const e = new Error(
      JSON.stringify({ code: "invalid_credentials", message: "Email or password is incorrect." }),
    );
    const out = asAuthError(e);
    expect(out.code).toBe("invalid_credentials");
  });

  it("parses Error: prefixed JSON", () => {
    const e = new Error(
      `Error: ${JSON.stringify({ code: "email_taken", message: "taken" })}`,
    );
    // message won't have Error: prefix when constructed this way — simulate wrapped text
    const wrapped = { message: `Error: ${JSON.stringify({ code: "email_taken", message: "taken" })}` };
    expect(asAuthError(wrapped).code).toBe("email_taken");
  });

  it("maps Zod-like issues to invalid_email", () => {
    const e = {
      name: "ZodError",
      issues: [{ path: ["email"], message: "Invalid email" }],
      message: "Validation failed",
    };
    expect(asAuthError(e).code).toBe("invalid_email");
  });

  it("keeps AuthError code", () => {
    expect(asAuthError(new AuthError("invite_invalid", "bad")).code).toBe("invite_invalid");
  });
});

describe("authErrorMessage", () => {
  it("returns localized copy for known codes", () => {
    expect(authErrorMessage(t, "invalid_credentials")).toBe("邮箱或密码不正确。");
    expect(authErrorMessage(t, "email_taken")).toBe("这个邮箱已经注册过了，可以直接登录。");
  });

  it("falls back to generic for unknown codes without message", () => {
    expect(authErrorMessage(t, "no_such_code")).toBe("出了点问题，请稍后再试。");
  });
});
