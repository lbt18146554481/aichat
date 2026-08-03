// Client-side auth guard for protected pages.
// Redirects to /auth?redirect=<current-path> when unauthenticated.
// Kept as a hook (not a route beforeLoad) because our auth store lives in
// localStorage — SSR has no session, so gating server-side would loop.

import { useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "./auth";

export function useRequireAuth(): { ready: boolean } {
  const { user, hydrated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!hydrated) return;
    if (user) return;
    // Never bounce /auth → /auth (would nest the redirect param on itself).
    if (location.pathname === "/auth") return;
    // TanStack Router's `location.search` is a *parsed object*, not a string —
    // concatenating it into a URL throws "Cannot convert object to primitive
    // value" on iOS Safari (strict Symbol.toPrimitive). Grab the raw query
    // from window.location instead.
    const rawSearch = typeof window !== "undefined" ? window.location.search : "";
    const target = location.pathname + (rawSearch || "");
    void navigate({
      to: "/auth",
      search: { mode: "signin", redirect: target },
      replace: true,
    });
  }, [hydrated, user, navigate, location.pathname]);

  return { ready: hydrated && !!user };
}
