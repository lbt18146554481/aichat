import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { MapPin, MessageCircle, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { avatarUrl } from "@/lib/candidates";
import { computeMatches } from "@/lib/matching";
import { loadProfile } from "@/lib/store";
import { EMPTY_PROFILE, type UserProfile } from "@/lib/types";

export const Route = createFileRoute("/matches")({
  head: () => ({
    meta: [
      { title: "为你推荐 — 小荷 · 慢慢相遇" },
      { name: "description", content: "小荷为你挑选的合拍的人。" },
    ],
  }),
  component: MatchesPage,
});

function MatchesPage() {
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setHydrated(true);
  }, []);

  const matches = useMemo(() => (hydrated ? computeMatches(profile).slice(0, 12) : []), [
    profile,
    hydrated,
  ]);

  const empty = hydrated && !profile.nickname;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-5 py-10">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-display">小荷为你挑的人</h1>
          <p className="text-muted-foreground mt-2">
            根据你和小荷的对话，从候选人里挑出 {matches.length} 位与你最合拍的 TA。
          </p>
        </div>

        {empty ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {matches.map((m, i) => (
              <motion.div
                key={m.candidate.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.4 }}
              >
                <Link
                  to="/matches/$id"
                  params={{ id: m.candidate.id }}
                  className="block rounded-3xl bg-card/85 backdrop-blur border border-border/60 shadow-soft overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-transform"
                >
                  <div className="relative aspect-[4/3] bg-secondary/40">
                    <img
                      src={avatarUrl(m.candidate.avatarSeed)}
                      alt={m.candidate.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-card/90 backdrop-blur text-xs font-medium shadow-soft flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-primary" />
                      契合度 {m.score}%
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-baseline gap-2">
                      <h3 className="font-display text-xl">{m.candidate.name}</h3>
                      <span className="text-sm text-muted-foreground">
                        {m.candidate.age} · {m.candidate.gender}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {m.candidate.city} · {m.candidate.occupation}
                    </p>
                    <p className="mt-3 text-sm text-foreground/75 leading-relaxed line-clamp-2">
                      💭 {m.reason}
                    </p>
                    {m.sharedInterests.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {m.sharedInterests.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              background: "color-mix(in oklab, var(--peach) 18%, white)",
                              color: "color-mix(in oklab, var(--peach) 60%, black)",
                            }}
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl bg-card/80 border border-border/60 p-12 text-center shadow-soft">
      <div className="w-14 h-14 mx-auto rounded-2xl gradient-warm grid place-items-center text-white mb-4">
        <Sparkles className="w-6 h-6" />
      </div>
      <h2 className="text-xl font-display">先和小荷聊聊吧</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        TA 需要先了解你，才能为你挑出最合拍的人。
      </p>
      <Link
        to="/chat"
        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full gradient-warm text-white text-sm font-medium shadow-soft"
      >
        <MessageCircle className="w-4 h-4" /> 开始对话
      </Link>
    </div>
  );
}
