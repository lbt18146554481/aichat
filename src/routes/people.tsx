import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { avatarUrl } from "@/lib/people";
import { findResonant } from "@/lib/resonance";
import { allSignals } from "@/lib/chats";

export const Route = createFileRoute("/people")({
  head: () => ({
    meta: [
      { title: "People — Bloom" },
      {
        name: "description",
        content: "People Bloom found across your conversations.",
      },
    ],
  }),
  component: PeoplePage,
});

function PeoplePage() {
  const [signals, setSignals] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSignals(allSignals());
    setHydrated(true);
  }, []);

  const resonant = useMemo(() => findResonant(signals), [signals]);

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto">
        <section className="max-w-5xl mx-auto px-5 md:px-8 py-8 md:py-12">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            People
          </div>
          <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
            People who resonate
          </h1>
          {hydrated && signals.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              You haven't described anyone yet — these are a few we keep close.
            </p>
          )}

          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {resonant.map(({ person, line }) => (
              <Link
                key={person.id}
                to="/people/$id"
                params={{ id: person.id }}
                className="block h-full rounded-lg bg-card border border-border p-4 hover:border-foreground/30 hover:shadow-sm transition-all duration-150"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={avatarUrl(person.name)}
                    alt=""
                    className="w-11 h-11 rounded-full border border-border bg-secondary shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      {person.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {person.age} · {person.city} · {person.occupation}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-foreground leading-snug">
                  {line}
                </p>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {person.portrait}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
