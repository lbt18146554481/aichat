import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, MapPin, MessageCircle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { loadProfile } from "@/lib/store";
import { EMPTY_PROFILE, type UserProfile } from "@/lib/types";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "我的档案 — 小荷 · 慢慢相遇" },
      { name: "description", content: "AI 红娘为你整理的个人画像。" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setHydrated(true);
  }, []);

  const empty = hydrated && !profile.nickname;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-5 py-10">
        {empty ? (
          <EmptyState />
        ) : !hydrated ? null : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl bg-card/85 backdrop-blur border border-border/60 shadow-soft overflow-hidden"
          >
            <div className="gradient-warm h-32 relative">
              <div className="absolute -bottom-12 left-8 w-24 h-24 rounded-3xl bg-card border-4 border-card grid place-items-center font-display text-3xl shadow-soft">
                {profile.nickname.slice(0, 1)}
              </div>
            </div>
            <div className="pt-16 px-8 pb-8">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h1 className="text-3xl font-display">{profile.nickname}</h1>
                {profile.age && <span className="text-muted-foreground">{profile.age} 岁</span>}
                {profile.gender && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    {profile.gender}
                  </span>
                )}
              </div>
              {profile.city && (
                <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {profile.city}
                </p>
              )}

              {profile.bio && (
                <div className="mt-6 rounded-2xl bg-secondary/40 p-5 italic text-foreground/80 leading-relaxed">
                  「{profile.bio}」
                </div>
              )}

              <Section title="兴趣爱好">
                <TagRow tags={profile.interests} variant="peach" />
              </Section>

              <Section title="性格画像">
                <TagRow tags={profile.personalityTags} variant="sage" />
              </Section>

              <Section title="期待的 TA">
                <div className="text-sm text-foreground/80 space-y-1">
                  <p>
                    希望认识 <span className="font-medium">{profile.lookingFor || "不限"}</span>，年龄在{" "}
                    <span className="font-medium">
                      {profile.preferences.ageRange[0]} - {profile.preferences.ageRange[1]} 岁
                    </span>
                  </p>
                </div>
              </Section>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/matches"
                  className="px-5 py-2.5 rounded-full gradient-warm text-white text-sm font-medium shadow-soft flex items-center gap-1.5"
                >
                  查看为我推荐的人 <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/chat"
                  className="px-5 py-2.5 rounded-full bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 flex items-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4" /> 继续和小荷聊聊
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">{title}</h3>
      {children}
    </div>
  );
}

function TagRow({ tags, variant }: { tags: string[]; variant: "peach" | "sage" }) {
  if (tags.length === 0) {
    return <p className="text-sm text-muted-foreground">还没告诉小荷～</p>;
  }
  const styles =
    variant === "peach"
      ? { background: "color-mix(in oklab, var(--peach) 22%, white)", color: "color-mix(in oklab, var(--peach) 60%, black)" }
      : { background: "color-mix(in oklab, var(--sage) 22%, white)", color: "color-mix(in oklab, var(--sage) 55%, black)" };
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((t) => (
        <span key={t} className="px-3 py-1 rounded-full text-sm" style={styles}>
          {t}
        </span>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 mx-auto rounded-3xl gradient-warm grid place-items-center text-white mb-5 shadow-soft">
        <Sparkles className="w-7 h-7" />
      </div>
      <h2 className="text-2xl font-display">还没有档案哦</h2>
      <p className="mt-2 text-muted-foreground">先和小荷聊几句，TA 会替你整理好一切。</p>
      <Link
        to="/chat"
        className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full gradient-warm text-white text-sm font-medium shadow-soft"
      >
        <MessageCircle className="w-4 h-4" /> 现在去聊聊
      </Link>
    </div>
  );
}
