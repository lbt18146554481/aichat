import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Apple Services ID Return URL is often registered as `/auth/callback/apple`.
 * The real OAuth finish UI lives at `/auth/callback`; this route forwards GET
 * traffic (POST form_post is rewritten earlier in `src/server.ts`).
 */
export const Route = createFileRoute("/auth/callback/apple")({
  validateSearch: (raw: Record<string, unknown>) => raw,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/auth/callback",
      search: search as Record<string, string | undefined>,
      replace: true,
    });
  },
});
