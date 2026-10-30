import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Apple Services ID Return URL is often registered as `/auth/callback/apple`.
 * Forward to the shared `/auth/callback` SPA handler.
 */
export const Route = createFileRoute("/auth/callback/apple")({
  validateSearch: (raw: Record<string, unknown>) => raw,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/auth/callback",
      search: {
        code: typeof search.code === "string" ? search.code : undefined,
        state: typeof search.state === "string" ? search.state : undefined,
        error: typeof search.error === "string" ? search.error : undefined,
        user: typeof search.user === "string" ? search.user : undefined,
      },
      replace: true,
    });
  },
  // Stub required so the route module doesn't hit TDZ on `component` during HMR.
  component: function AppleCallbackRedirect() {
    return null;
  },
});
