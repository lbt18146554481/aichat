import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useRequireAuth } from "@/lib/auth-guard";
import { useMyIntents, useSessions } from "@/data/hooks";
import { LangSwitcher } from "@/components/lang-switcher";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeLang, pickLocaleText } from "@/lib/lang";
import type { Intent } from "@/lib/intents";
import { findSessionForMyIntent } from "@/lib/wish-session";
import type { SideState } from "@/lib/agents/side-by-side";

export const Route = createFileRoute("/wishes/")({
  component: WishesListPage,
  head: () => ({
    meta: [
      { title: "My wishes — Maitri" },
      { name: "description", content: "Wishes you've published to the pool." },
    ],
  }),
});

function relTime(ts: number, t: (key: string, opts?: object) => string): string {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("home.time.just_now");
  if (mins < 60) return t("home.time.minutes", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("home.time.hours", { n: hours });
  const days = Math.floor(hours / 24);
  return t("home.time.days", { n: days });
}

function wishStatusLabel(
  intentId: string,
  sessions: ReturnType<typeof useSessions>["data"],
  t: (key: string) => string,
): string {
  const session = findSessionForMyIntent(sessions, intentId);
  if (!session) return t("wishes.status_active");
  const st = (session.state ?? {}) as Partial<SideState>;
  if (st.stage === "chat") return t("wishes.status_chatting");
  if (st.matchIntentId) return t("wishes.status_matched");
  return t("wishes.status_active");
}

function WishesListPage() {
  const { ready } = useRequireAuth();
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.resolvedLanguage);
  const navigate = useNavigate();
  const router = useRouter();
  const { data: wishes = [], isFetched } = useMyIntents(ready);
  const { data: sessions = [] } = useSessions();
  const items = wishes.slice().sort((a, b) => b.createdAt - a.createdAt);

  function handleBack() {
    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }
    void navigate({ to: "/" });
  }

  function openWish(intent: Intent) {
    void navigate({ to: "/wishes/$wishId", params: { wishId: intent.id } });
  }

  if (!ready) {
    return (
      <div className="min-h-dvh bg-background pt-safe" data-testid="wishes-auth-loading">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="max-w-2xl mx-auto px-4 space-y-4 pt-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col pb-tabbar lg:pb-0">
      <header className="w-full border-b border-border bg-background/90 backdrop-blur sticky top-0 z-30 pt-safe">
        <div className="max-w-2xl mx-auto px-4 md:px-5 h-14 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label={t("nav.back")}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-mono uppercase tracking-wide">{t("nav.back")}</span>
          </button>
          <div className="text-[13.5px] font-semibold tracking-tight">{t("wishes.title")}</div>
          <LangSwitcher />
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 md:px-5 py-4">
        {!isFetched ? (
          <ul data-testid="wishes-loading" aria-busy="true" className="space-y-2">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <Skeleton className="h-16 w-full rounded-xl" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div data-testid="wishes-empty" className="px-2 py-12 text-center">
            <Sparkles
              className="w-6 h-6 mx-auto mb-3 text-muted-foreground opacity-60"
              strokeWidth={1.5}
            />
            <p className="text-[13px] text-muted-foreground leading-relaxed">{t("wishes.empty")}</p>
          </div>
        ) : (
          <ul data-testid="wishes-list" className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {items.map((intent) => {
              const raw = pickLocaleText(lang, intent.rawText, intent.rawText_zh);
              const city = pickLocaleText(lang, intent.city || intent.ownerCity, intent.city_zh || intent.ownerCity_zh);
              const status = wishStatusLabel(intent.id, sessions, t);
              return (
                <li key={intent.id}>
                  <button
                    type="button"
                    onClick={() => openWish(intent)}
                    className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-secondary/40 transition-colors"
                  >
                    <span className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary grid place-items-center">
                      <Sparkles className="w-4 h-4" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[13.5px] font-medium text-foreground truncate flex-1">
                          {raw}
                        </span>
                        <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full border border-border bg-secondary text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                          {status}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted-foreground truncate">
                        {city ? `${city} · ` : ""}
                        {t("wishes.posted", { ago: relTime(intent.createdAt, t) })}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
