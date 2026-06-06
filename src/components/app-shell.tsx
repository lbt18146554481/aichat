import { Link, useRouterState } from "@tanstack/react-router";
import { Heart, MessageCircle, Sparkles, User } from "lucide-react";
import type { ReactNode } from "react";

const navItems = [
  { to: "/", label: "首页", icon: Heart },
  { to: "/chat", label: "红娘", icon: MessageCircle },
  { to: "/profile", label: "档案", icon: User },
  { to: "/matches", label: "匹配", icon: Sparkles },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/60">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <span className="grid place-items-center w-9 h-9 rounded-2xl gradient-warm text-white shadow-soft">
              <Heart className="w-4 h-4" fill="currentColor" />
            </span>
            <span className="font-display text-xl tracking-tight">
              小荷<span className="text-muted-foreground text-sm ml-1">· 慢慢相遇</span>
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
                    "px-4 py-2 rounded-full text-sm flex items-center gap-2 transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-foreground/70 hover:text-foreground hover:bg-muted",
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

      <main className="flex-1">{children}</main>

      <nav className="md:hidden sticky bottom-0 z-30 backdrop-blur-xl bg-background/85 border-t border-border/60">
        <div className="max-w-md mx-auto px-2 grid grid-cols-4">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={[
                  "flex flex-col items-center justify-center gap-1 py-3 text-xs",
                  active ? "text-primary" : "text-muted-foreground",
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
