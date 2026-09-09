import type { TFunction } from "i18next";
import { AuthError } from "./auth-types";

/** Map server/auth failure codes to localized, user-readable copy. */
export function authErrorMessage(t: TFunction, code: string, fallbackMessage?: string): string {
  const key = `auth.err.${code}`;
  const translated = t(key);
  if (translated && translated !== key) return translated;
  // Prefer a concrete server message over the generic line when we have one.
  const msg = fallbackMessage?.trim();
  if (msg && msg !== code && msg !== "server_error" && !msg.startsWith("{")) {
    return msg;
  }
  return t("auth.err.generic");
}

function tryParseCodeMessage(raw: string): { code: string; message: string } | null {
  const trimmed = raw.trim();
  // Sometimes transport prefixes: `Error: {...}` or wraps in quotes.
  const candidates = [trimmed];
  const errPrefix = trimmed.match(/^Error:\s*(\{[\s\S]*\})$/);
  if (errPrefix?.[1]) candidates.push(errPrefix[1]);
  const embedded = trimmed.match(/(\{[^{}]*"code"\s*:\s*"[^"]+"[^{}]*\})/);
  if (embedded?.[1]) candidates.push(embedded[1]);

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as Record<string, unknown>;
      if (typeof parsed.code === "string") {
        return {
          code: parsed.code,
          message: typeof parsed.message === "string" ? parsed.message : parsed.code,
        };
      }
    } catch {
      /* next */
    }
  }
  return null;
}

function inferCodeFromMessage(message: string): string | null {
  const m = message.toLowerCase();
  if (m.includes("econnrefused") || m.includes("connect") || m.includes("database")) {
    return "db_unavailable";
  }
  if (m.includes("invalid email") || m.includes("email")) {
    // Only if clearly validation — avoid matching "email or password incorrect"
    if (m.includes("valid") || m.includes("format") || m.includes("invalid_string")) {
      return "invalid_email";
    }
  }
  return null;
}

/** Normalize RPC / server-fn failures into AuthError with a stable code. */
export function asAuthError(e: unknown): AuthError {
  if (e instanceof AuthError) {
    const parsed = tryParseCodeMessage(e.message);
    if (parsed) return new AuthError(parsed.code, parsed.message);
    return e;
  }

  if (e && typeof e === "object") {
    const any = e as Record<string, unknown>;

    const directCode = any.code;
    const directMsg = any.message;
    if (typeof directCode === "string") {
      return new AuthError(
        directCode,
        typeof directMsg === "string" ? directMsg : directCode,
      );
    }

    if (any.data && typeof any.data === "object") {
      const d = any.data as Record<string, unknown>;
      if (typeof d.code === "string") {
        return new AuthError(
          d.code,
          typeof d.message === "string" ? d.message : d.code,
        );
      }
    }

    // TanStack / Zod may put issues on the error object
    if (any.name === "ZodError" || Array.isArray(any.issues)) {
      const issues = any.issues as Array<{ path?: unknown[]; message?: string }> | undefined;
      const emailIssue = issues?.find((i) => Array.isArray(i.path) && i.path.includes("email"));
      if (emailIssue) return new AuthError("invalid_email", "Enter a valid email address.");
      const passwordIssue = issues?.find((i) => Array.isArray(i.path) && i.path.includes("password"));
      if (passwordIssue) return new AuthError("password_short", "Password must be at least 6 characters.");
      return new AuthError("invalid_input", issues?.[0]?.message || "Invalid input.");
    }

    const err = e as Error & { code?: string };
    if (typeof err.code === "string") {
      return new AuthError(err.code, err.message || err.code);
    }

    if (typeof err.message === "string") {
      const parsed = tryParseCodeMessage(err.message);
      if (parsed) return new AuthError(parsed.code, parsed.message);

      const inferred = inferCodeFromMessage(err.message);
      if (inferred) return new AuthError(inferred, err.message);

      // HTML generic page from catastrophic handler — keep generic code
      if (err.message.includes("<!doctype html>") || err.message.includes("This page didn't load")) {
        return new AuthError("server_error", "server_error");
      }
    }
  }

  return new AuthError("server_error", "server_error");
}
