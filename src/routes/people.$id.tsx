import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { avatarUrl, getPersonById } from "@/lib/people";
import { findResonant } from "@/lib/resonance";
import { allSignals } from "@/lib/chats";

export const Route = createFileRoute("/people/$id")({
  loader: ({ params }) => {
    const person = getPersonById(params.id);
    if (!person) throw notFound();
    return { person };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.person.name} — Bloom` : "Bloom" },
      {
        name: "description",
        content: loaderData?.person.portrait ?? "A person on Bloom.",
      },
    ],
  }),
  notFoundComponent: () => (
    <AppLayout>
      <div className="max-w-xl mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Not found.</h1>
        <p className="mt-2 text-sm text-muted-foreground">This person isn't here.</p>
        <Link
          to="/people"
          className="mt-6 inline-flex px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium"
        >
          Back to people
        </Link>
      </div>
    </AppLayout>
  ),
  errorComponent: ({ error, reset }) => (
    <AppLayout>
      <div className="max-w-xl mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Something went wrong.</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={reset}
          className="mt-6 px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium"
        >
          Try again
        </button>
      </div>
    </AppLayout>
  ),
  component: PersonPage,
});

function PersonPage() {
  const { person } = Route.useLoaderData();
  const [resonance, setResonance] = useState<{ shared: string[]; line: string } | null>(null);

  useEffect(() => {
    const sigs = allSignals();
    if (sigs.length === 0) return;
    const hit = findResonant(sigs).find((r) => r.person.id === person.id);
    if (hit) setResonance({ shared: hit.shared, line: hit.line });
  }, [person.id]);

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto">
        <section className="max-w-3xl mx-auto px-6 py-8 md:py-12">
          <Link
            to="/people"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← People
          </Link>

          <div className="mt-6 rounded-lg bg-card border border-border p-6 md:p-8">
            <div className="flex flex-col md:flex-row gap-5 items-start">
              <img
                src={avatarUrl(person.name)}
                alt=""
                className="w-16 h-16 rounded-full border border-border bg-secondary shrink-0"
              />
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                  {person.occupation}
                </div>
                <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                  {person.name}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {person.age} · {person.city}
                </p>
              </div>
            </div>

            {resonance && (
              <div className="mt-6 p-4 rounded-md bg-secondary border border-border">
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1 font-medium">
                  Why {person.name.split(" ")[0]}
                </div>
                <p className="text-sm text-foreground leading-snug">{resonance.line}</p>
              </div>
            )}

            <p className="mt-6 text-base text-foreground leading-[1.7]">
              {person.portrait}
            </p>

            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2 font-medium">
                They notice
              </div>
              <div className="flex flex-wrap gap-1.5">
                {person.signals.map((s: string) => (
                  <span
                    key={s}
                    className="px-2.5 py-1 rounded-full bg-secondary text-foreground text-xs font-medium border border-border"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 items-center justify-between">
            <Link
              to="/people"
              className="px-4 py-2 rounded-md bg-card border border-border text-sm font-medium text-foreground hover:bg-secondary"
            >
              ← All people
            </Link>
            <button
              onClick={() =>
                toast("A quiet hello is on its way", {
                  description: "Direct messages are coming soon.",
                })
              }
              className="px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90"
            >
              Say hi
            </button>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
