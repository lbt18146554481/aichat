import { Link, useRouterState } from "@tanstack/react-router";
import { MessageSquare, User, Users } from "lucide-react";
import type { ReactNode } from "react";

const navItems = [
  { to: "/", label: "Chat", icon: MessageSquare },
  { to: "/portrait", label: "Portrait", icon: User },
  { to: "/people", label: "People", icon: Users },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid place-items-center w-7 h-7 rounded-md bg-foreground text-background text-xs font-semibold">
              B
            </span>
            <span className="text-base font-semibold tracking-tight text-foreground">
              Bloom
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active =
                to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={[
                    "px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 transition-colors",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                  ].join(" ")}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 relative">{children}</main>

      <nav className="md:hidden sticky bottom-0 z-30 bg-background/95 backdrop-blur border-t border-border">
        <div className="max-w-md mx-auto px-2 grid grid-cols-3">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={[
                  "flex flex-col items-center justify-center gap-1 py-3 text-xs",
                  active ? "text-foreground" : "text-muted-foreground",
                ].join(" ")}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
