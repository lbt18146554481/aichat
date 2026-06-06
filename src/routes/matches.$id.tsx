import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Hand, MapPin, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { avatarUrl, CANDIDATES } from "@/lib/candidates";
import { computeMatches } from "@/lib/matching";
import { loadProfile } from "@/lib/store";
import { EMPTY_PROFILE, type UserProfile } from "@/lib/types";

export const Route = createFileRoute("/matches/$id")({
  head: () => ({
    meta: [{ title: "TA 的档案 — 小荷 · 慢慢相遇" }],
  }),
  component: CandidatePage,
});

function CandidatePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setHydrated(true);
  }, []);

  const candidate = useMemo(() => CANDIDATES.find((c) => c.id === id), [id]);
  const match = useMemo(() => {
    if (!hydrated || !candidate) return null;
    return computeMatches(profile).find((m) => m.candidate.id === id) ?? null;
  }, [profile, candidate, id, hydrated]);

  if (!candidate) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto px-5 py-16 text-center">
          <p className="text-muted-foreground">没有找到这位 TA。</p>
          <button
            onClick={() => navigate({ to: "/matches" })}
            className="mt-4 px-4 py-2 rounded-full bg-secondary text-sm"
          >
            回到匹配列表
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Toaster position="top-center" />
      <div className="max-w-3xl mx-auto px-5 py-8">
        <Link
          to="/matches"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-5"
        >
          <ArrowLeft className="w-4 h-4" /> 返回匹配列表
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl bg-card/85 backdrop-blur border border-border/60 shadow-soft overflow-hidden"
        >
          <div className="md:flex">
            <div className="md:w-2/5 aspect-square md:aspect-auto bg-secondary/40">
              <img
                src={avatarUrl(candidate.avatarSeed)}
                alt={candidate.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 p-6 md:p-8">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h1 className="text-3xl font-display">{candidate.name}</h1>
                <span className="text-muted-foreground">{candidate.age} 岁</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                  {candidate.gender}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {candidate.city} · {candidate.occupation}
              </p>

              {match && (
                <div
                  className="mt-5 rounded-2xl p-4 border border-border/60"
                  style={{ background: "color-mix(in oklab, var(--peach) 12%, white)" }}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="w-4 h-4 text-primary" />
                    契合度 {match.score}% · 小荷的推荐理由
                  </div>
                  <p className="mt-2 text-sm text-foreground/80 leading-relaxed">
                    {match.reason}
                  </p>
                </div>
              )}

              <Section title="TA 的自我介绍">
                <p className="text-foreground/80 leading-relaxed italic">「{candidate.bio}」</p>
              </Section>

              <Section title="兴趣">
                <Tags tags={candidate.interests} variant="peach" highlights={match?.sharedInterests} />
              </Section>

              <Section title="性格">
                <Tags tags={candidate.personalityTags} variant="sage" highlights={match?.sharedTraits} />
              </Section>

              <button
                onClick={() => toast.success(`你向 ${candidate.name} 打了个招呼 🌷`, {
                  description: "私聊功能即将上线，敬请期待～",
                })}
                className="mt-8 w-full md:w-auto px-6 py-3 rounded-full gradient-warm text-white text-sm font-medium shadow-soft flex items-center justify-center gap-2"
              >
                <Hand className="w-4 h-4" /> 向 TA 打招呼
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Tags({
  tags,
  variant,
  highlights = [],
}: {
  tags: string[];
  variant: "peach" | "sage";
  highlights?: string[];
}) {
  const base =
    variant === "peach"
      ? { background: "color-mix(in oklab, var(--peach) 15%, white)", color: "color-mix(in oklab, var(--peach) 60%, black)" }
      : { background: "color-mix(in oklab, var(--sage) 15%, white)", color: "color-mix(in oklab, var(--sage) 55%, black)" };
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((t) => {
        const hl = highlights.includes(t);
        return (
          <span
            key={t}
            className={[
              "px-3 py-1 rounded-full text-sm",
              hl ? "ring-2 ring-primary/50 font-medium" : "",
            ].join(" ")}
            style={base}
          >
            {hl && "✦ "}{t}
          </span>
        );
      })}
    </div>
  );
}
