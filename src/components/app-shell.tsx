import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/describe", label: "Describe" },
  { to: "/portrait", label: "Portrait" },
  { to: "/people", label: "People" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen flex flex-col relative">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-baseline gap-2 group">
            <span className="font-display text-2xl tracking-tight text-foreground">
              Muse
            </span>
            <span className="font-display-italic text-sm text-whisper hidden sm:inline">
              — for the one you imagine
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-7">
            {navItems.map(({ to, label }) => {
              const active =
                to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={[
                    "text-[13px] tracking-[0.12em] uppercase transition-colors",
                    active
                      ? "text-gold"
                      : "text-whisper hover:text-foreground",
                  ].join(" ")}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="gold-rule" />
      </header>

      <main className="flex-1 relative z-10">{children}</main>

      <nav className="md:hidden sticky bottom-0 z-30 backdrop-blur-md bg-background/85 border-t border-border/60">
        <div className="max-w-md mx-auto px-2 grid grid-cols-4">
          {navItems.map(({ to, label }) => {
            const active =
              to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={[
                  "py-3 text-[11px] tracking-[0.18em] uppercase text-center",
                  active ? "text-gold" : "text-whisper",
                ].join(" ")}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      <footer className="border-t border-border/40 mt-12 py-8 text-center text-[11px] tracking-[0.2em] uppercase text-whisper">
        Muse — a quiet way to be found
      </footer>
    </div>
  );
}
