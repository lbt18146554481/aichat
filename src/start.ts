import { createStart, createMiddleware } from "@tanstack/react-start";
import { ZodError } from "zod";

import { renderErrorPage } from "./lib/error-page";
import { AuthError } from "./lib/auth-types";

/** Auth / validation errors the client can map to copy — do not replace with HTML. */
function toClientThrowable(error: unknown): Error | null {
  if (error instanceof AuthError) {
    return new Error(JSON.stringify({ code: error.code, message: error.message }));
  }
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as { code?: unknown };
      if (typeof parsed?.code === "string") return error;
    } catch {
      /* not structured */
    }
  }
  if (error instanceof ZodError) {
    const emailIssue = error.issues.find((i) => i.path.includes("email"));
    if (emailIssue) {
      return new Error(
        JSON.stringify({
          code: "invalid_email",
          message: "Enter a valid email address.",
        }),
      );
    }
    const passwordIssue = error.issues.find((i) => i.path.includes("password"));
    if (passwordIssue) {
      return new Error(
        JSON.stringify({
          code: "password_short",
          message: "Password must be at least 6 characters.",
        }),
      );
    }
    return new Error(
      JSON.stringify({
        code: "invalid_input",
        message: error.issues[0]?.message || "Invalid input.",
      }),
    );
  }
  return null;
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    const clientErr = toClientThrowable(error);
    if (clientErr) throw clientErr;
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
