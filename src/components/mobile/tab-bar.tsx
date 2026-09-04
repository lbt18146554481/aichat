// MobileTabBar — the App-shell bottom navigation for phone-sized viewports.
//
// Renders on `< sm` (< 768px) only. Hidden on routes that own the whole
// bottom of the screen (auth / chat surfaces with sticky composers), so
// the tab bar never fights another bottom-anchored control.
//
// Visual language is deliberately restrained: line icons, tiny caption,
// active state uses the foreground token so it blends with the current
// minimal black/white palette (no new colors introduced).

import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Home, Clock, UserCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";

// Routes where the tab bar must NOT render: they own the bottom (composer /
// auth) and a tab bar would fight another bottom-anchored control. Agent
// chats keep the tab bar so handoff feels continuous with Home.
const HIDE_ON: readonly string[] = ["/auth"];

interface TabDef {
  to: "/" | "/sessions" | "/me";
  /** Extra pathnames that should light this tab up (detail pages). */
  also?: readonly string[];
  labelKey: string;
  Icon: typeof Home;
  /** true → active when pathname === to; false → active on prefix match. */
  exact?: boolean;
}

const TABS: TabDef[] = [
  { to: "/", labelKey: "tabs.home", Icon: Home, exact: true },
  { to: "/sessions", labelKey: "tabs.history", Icon: Clock },
  { to: "/me", labelKey: "tabs.me", Icon: UserCircle, also: ["/profile"] },
];

export function MobileTabBar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, hydrated } = useAuth();

  const path = location.pathname;
  const shouldHide = HIDE_ON.some((p) => path === p || path.startsWith(p + "/"));
  if (shouldHide) return null;
  // Only signed-in users see the tab bar; unauthenticated users are almost
  // always on `/auth` (hidden above) or on `/` where the composer is the
  // whole call-to-action.
  if (!hydrated || !user) return null;

  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-safe"
    >
      <ul className="mx-auto max-w-md grid grid-cols-3">
        {TABS.map((tab) => {
          const active = tab.exact
            ? path === tab.to
            : path === tab.to ||
              path.startsWith(tab.to + "/") ||
              (tab.also ?? []).some((p) => path === p || path.startsWith(p + "/"));
          const Icon = tab.Icon;
          return (
            <li key={tab.to}>
              <Link
                to={tab.to}
                className={[
                  "relative flex flex-col items-center justify-center gap-0.5 h-14 min-w-[44px] px-2 transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-primary" />
                )}
                <span className="relative">
                  <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2 : 1.6} />
                </span>
                <span className="text-[10px] tracking-wide leading-none">{t(tab.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
