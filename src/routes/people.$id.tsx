import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Loader2, MessageCircle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { setAgent } from "@/lib/agents";
import { avatarUrl, getPersonById } from "@/lib/people";
import { findResonant } from "@/lib/resonance";
import { loadSeeker } from "@/lib/store";

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
    <AppShell>
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
    </AppShell>
  ),
  errorComponent: ({ error, reset }) => (
    <AppShell>
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
    </AppShell>
  ),
  component: PersonPage,
});

function PersonPage() {
  const { person } = Route.useLoaderData();
  const [resonance, setResonance] = useState<{ shared: string[]; line: string } | null>(null);
  const [spark, setSpark] = useState<{ loading: boolean; text: string | null }>({
    loading: false,
    text: null,
  });
  const [coach, setCoach] = useState<{ loading: boolean; text: string | null }>({
    loading: false,
    text: null,
  });

  useEffect(() => {
    const seeker = loadSeeker();
    if (seeker.signals.length === 0) return;
    const hit = findResonant(seeker.signals).find((r) => r.person.id === person.id);
    if (hit) setResonance({ shared: hit.shared, line: hit.line });
  }, [person.id]);

  function activateSpark() {
    setAgent("spark", "working");
    setSpark({ loading: true, text: null });
    setTimeout(() => {
      const firstName = person.name.split(" ")[0];
      const shared = resonance?.shared[0] ?? "something small";
      const text = `Hi ${firstName} — your note about ${shared} caught me. I'd love to hear what made you land there.`;
      setSpark({ loading: false, text });
      setAgent("spark", "done");
    }, 1200);
  }

  function activateCoach() {
    setAgent("coach", "working");
    setCoach({ loading: true, text: null });
    setTimeout(() => {
      const text = `Lead with one specific thing from their portrait. Ask, don't pitch. If the reply is short, mirror it — don't pile on questions.`;
      setCoach({ loading: false, text });
      setAgent("coach", "done");
    }, 1200);
  }

  return (
    <AppShell>
      <section className="max-w-3xl mx-auto px-6 py-10 md:py-14">
        <Link
          to="/people"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← People
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-6 rounded-xl bg-card border border-border p-6 md:p-8 shadow-soft"
        >
          <div className="flex flex-col md:flex-row gap-5 items-start">
            <img
              src={avatarUrl(person.name)}
              alt=""
              className="w-20 h-20 rounded-md border border-border bg-secondary shrink-0"
            />
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-secondary text-foreground text-xs font-medium border border-border">
                {person.occupation}
              </div>
              <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
                {person.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {person.age} · {person.city}
              </p>
            </div>
          </div>

          {resonance && (
            <div className="mt-6 p-4 rounded-md bg-secondary border border-border">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 font-medium">
                Scout · why {person.name.split(" ")[0]}
              </div>
              <p className="text-sm text-foreground leading-snug">{resonance.line}</p>
            </div>
          )}

          <p className="mt-6 text-lg text-foreground leading-[1.65]">
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
                  className="px-2.5 py-1 rounded-md bg-secondary text-foreground text-xs font-medium border border-border"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Spark + Coach */}
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-card border border-border p-5 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                  Spark agent
                </div>
                <div className="text-sm font-semibold text-foreground mt-0.5">
                  An opening line
                </div>
              </div>
              <button
                onClick={activateSpark}
                disabled={spark.loading}
                className="px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {spark.loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {spark.text ? "Regenerate" : "Activate"}
              </button>
            </div>
            {spark.text && (
              <p className="mt-3 text-sm text-foreground leading-relaxed bg-secondary border border-border rounded-md px-3 py-2.5">
                {spark.text}
              </p>
            )}
          </div>

          <div className="rounded-xl bg-card border border-border p-5 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                  Coach agent
                </div>
                <div className="text-sm font-semibold text-foreground mt-0.5">
                  Light advice
                </div>
              </div>
              <button
                onClick={activateCoach}
                disabled={coach.loading}
                className="px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {coach.loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <MessageCircle className="w-3.5 h-3.5" />
                )}
                {coach.text ? "Ask again" : "Get advice"}
              </button>
            </div>
            {coach.text && (
              <p className="mt-3 text-sm text-foreground leading-relaxed bg-secondary border border-border rounded-md px-3 py-2.5">
                {coach.text}
              </p>
            )}
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
    </AppShell>
  );
}
