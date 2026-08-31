import type { TFunction } from "i18next";
import { AuthError } from "./auth-types";

/** Map server/auth failure codes to localized, user-readable copy. */
export function authErrorMessage(t: TFunction, code: string): string {
  const key = `auth.err.${code}`;
  const translated = t(key);
  if (translated && translated !== key) return translated;
  return t("auth.err.generic");
}

/** Normalize RPC / server-fn failures into AuthError with a stable code. */
export function asAuthError(e: unknown): AuthError {
  if (e instanceof AuthError) return e;

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

    const err = e as Error & { code?: string };
    if (typeof err.code === "string") {
      return new AuthError(err.code, err.message || err.code);
    }

    if (typeof err.message === "string") {
      try {
        const parsed = JSON.parse(err.message) as Record<string, unknown>;
        if (typeof parsed.code === "string") {
          return new AuthError(
            parsed.code,
            typeof parsed.message === "string" ? parsed.message : parsed.code,
          );
        }
      } catch {
        /* not JSON */
      }
    }
  }

  return new AuthError("server_error", "server_error");
}
