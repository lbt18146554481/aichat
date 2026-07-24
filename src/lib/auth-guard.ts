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
    void navigate({
      to: "/auth",
      search: { mode: "signin", redirect: location.href },
      replace: true,
    });
  }, [hydrated, user, navigate, location.href]);

  return { ready: hydrated && !!user };
}
