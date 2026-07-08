import { useTranslation } from "react-i18next";
import { BellRing, Check, MessageCircle, RefreshCw, Sparkles, Users } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { SideState, WhenTier, LevelTier } from "@/lib/agents/side-by-side";
import { currentView } from "@/lib/agents/side-by-side";
import type { ActivityKind, Weekday } from "@/lib/types";

interface Props {
  state: SideState;
  onSwap: () => void;
  onSayHello: () => void;
  onTryNearMiss: (slot: { day: Weekday; window: "morning" | "midday" | "evening" }) => void;
  onJoinWaitlist: () => void;
}

const KIND_EMOJI: Record<ActivityKind, string> = {
  tennis: "🎾", run: "🏃", climb: "🧗", cook: "🍳", exhibition: "🖼", bookstore: "📚",
};

export function MeetCanvas(props: Props) {
  const view = currentView(props.state);
  if (view === "candidate") return <CandidateView {...props} />;
  if (view === "nearmiss")  return <NearMissView {...props} />;
  return <EmptyCanvas />;
}

// ---- Empty canvas ---------------------------------------------------------

function EmptyCanvas() {
  const { t } = useTranslation();
  return (
    <div className="h-full grid place-items-center px-8 py-12">
      <div className="max-w-sm text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-secondary border border-border grid place-items-center text-muted-foreground">
          <Users className="w-6 h-6" />
        </div>
        <h2 className="mt-5 text-[18px] font-medium text-foreground leading-snug">
          {t("meet.empty_title")}
        </h2>
        <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
          {t("meet.empty_hint")}
        </p>
      </div>
    </div>
  );
}

// ---- Candidate ------------------------------------------------------------

function CandidateView({ state, onSwap, onSayHello }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const c = state.candidate!;
  const intent = state.intent!;
  const kindLabel = t(`activity.kind.${c.kind}`);
  const dayLabel = t(`activity.day.${c.day}`);
  const winLabel = t(`activity.window.${c.window}`);
  const venue = lang === "zh-CN" ? c.venue_zh : c.venue;
  const reason = lang === "zh-CN" ? c.reason_zh : c.reason;

  return (
    <div className="h-full px-6 py-12 overflow-y-auto">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
            {t("meet.pick_label")}
          </div>
          <HeardYou intent={intent} />
        </div>

        <div className="mt-4 rounded-xl border border-border bg-card p-5">
          {/* Mutual badge — the emotional core of Side by Side. */}
          {c.mutual && (
            <div className="mb-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium">
              <Sparkles className="w-3 h-3" />
              {t("meet.mutual_badge", { day: dayLabel, window: winLabel, kind: kindLabel })}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-secondary border border-border grid place-items-center text-[24px] leading-none">
              {KIND_EMOJI[c.kind]}
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-foreground">
                {kindLabel} · {dayLabel} {winLabel}
              </div>
              <div className="text-[12px] text-muted-foreground">{venue}</div>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-full bg-secondary border border-border grid place-items-center text-muted-foreground text-[13px] font-mono">?</div>
            <p className="text-[12.5px] text-foreground/85 leading-relaxed pt-1">{reason}</p>
          </div>

          <div className="mt-6 flex gap-2">
            <button
              onClick={onSayHello}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {t("meet.say_hello")}
            </button>
            <button
              onClick={onSwap}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t("meet.swap")}
            </button>
          </div>
        </div>

        <p className="mt-5 text-[11.5px] text-muted-foreground leading-relaxed">
          {t("meet.pick_footnote")}
        </p>
      </div>
    </div>
  );
}

// ---- No match — waitlist card + near-miss list ----------------------------

function NearMissView({ state, onTryNearMiss, onJoinWaitlist }: Props) {
  const { t } = useTranslation();
  const intent = state.intent!;
  const kindLabel = t(`activity.kind.${intent.kind}`);
  const whenLabel = intent.when ? t(`meet.when.${intent.when}`) : t("meet.when.any");
  const joined = state.waitlistJoinedForCurrent || state.recalledFromWaitlist;

  return (
    <div className="h-full px-6 py-12 overflow-y-auto">
      <div className="mx-auto max-w-md">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
          {t("meet.pick_label")}
        </div>

        {/* Waitlist card */}
        <div className="mt-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-full bg-secondary border border-border grid place-items-center text-muted-foreground">
              {joined ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <BellRing className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-foreground">
                {joined ? t("meet.waitlist_joined_title") : t("meet.waitlist_offer_title")}
              </div>
              <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">
                {joined
                  ? t("meet.waitlist_joined_body", { kind: kindLabel, when: whenLabel })
                  : t("meet.waitlist_offer_body", { kind: kindLabel, when: whenLabel })}
              </p>
              {!joined && (
                <button
                  onClick={onJoinWaitlist}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-foreground text-background text-[12.5px] font-medium hover:opacity-90 transition-opacity"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  {t("meet.waitlist_cta")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Near-miss list */}
        {!state.poolExhausted && state.nearMisses.length > 0 && (
          <div className="mt-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
              {t("meet.near_label")}
            </div>
            <ul className="space-y-2">
              {state.nearMisses.slice(0, 3).map((nm) => (
                <li key={`${nm.slot.day}-${nm.slot.window}`}>
                  <button
                    onClick={() => onTryNearMiss(nm.slot)}
                    className="w-full text-left rounded-lg border border-border bg-card px-3.5 py-2.5 hover:border-foreground/40 transition-colors"
                  >
                    <div className="text-[13px] text-foreground">
                      {t(`activity.day.${nm.slot.day}`)} {t(`activity.window.${nm.slot.window}`)}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground mt-0.5">
                      {t("meet.near_people", { count: nm.personCount })}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {state.poolExhausted && (
          <p className="mt-4 text-[12.5px] text-muted-foreground leading-relaxed">
            {t("meet.pool_exhausted_hint")}
          </p>
        )}
      </div>
    </div>
  );
}

// ---- Shared ---------------------------------------------------------------

function HeardYou({ intent }: { intent: { kind: ActivityKind; when?: WhenTier; level?: LevelTier } }) {
  const { t } = useTranslation();
  const bits: string[] = [t(`activity.kind.${intent.kind}`)];
  if (intent.when) bits.push(t(`meet.when.${intent.when}`));
  if (intent.level) bits.push(t(`meet.level.${intent.level}`));
  return (
    <span className="text-[10.5px] font-mono text-muted-foreground truncate max-w-[60%]" title={bits.join(" · ")}>
      {t("meet.heard_you")}: {bits.join(" · ")}
    </span>
  );
}
