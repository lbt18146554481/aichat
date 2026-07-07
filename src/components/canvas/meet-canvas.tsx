import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, RefreshCw, Pencil } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { SideState, UserActivity } from "@/lib/agents/side-by-side";
import { phaseOf } from "@/lib/agents/side-by-side";
import type { ActivityKind, Weekday } from "@/lib/types";

interface Props {
  state: SideState;
  onSetActivity: (a: UserActivity) => void;
  onSwap: () => void;
  onAddSlot: (slot: { day: Weekday; window: "morning" | "midday" | "evening" }) => void;
  onSayHello: () => void;
  onEdit: () => void;
}

const KINDS: ActivityKind[] = ["tennis", "run", "climb", "cook", "exhibition", "bookstore"];
const KIND_EMOJI: Record<ActivityKind, string> = {
  tennis: "🎾", run: "🏃", climb: "🧗", cook: "🍳", exhibition: "🖼", bookstore: "📚",
};

// Three quick presets that cover most intents. Users can pick multiple
// (weekend + weeknight, for instance) — this is intentional, more slots =
// more matches.
type WhenPreset = "weekend" | "weeknight" | "any";

function slotsFor(preset: WhenPreset): Array<{ day: Weekday; window: "morning" | "midday" | "evening" }> {
  if (preset === "weekend") {
    const out: Array<{ day: Weekday; window: "morning" | "midday" | "evening" }> = [];
    for (const day of ["sat", "sun"] as Weekday[]) {
      for (const w of ["morning", "midday", "evening"] as const) out.push({ day, window: w });
    }
    return out;
  }
  if (preset === "weeknight") {
    return (["mon","tue","wed","thu","fri"] as Weekday[]).map((day) => ({ day, window: "evening" as const }));
  }
  const out: Array<{ day: Weekday; window: "morning" | "midday" | "evening" }> = [];
  for (const day of ["mon","tue","wed","thu","fri","sat","sun"] as Weekday[]) {
    for (const w of ["morning", "midday", "evening"] as const) out.push({ day, window: w });
  }
  return out;
}

function presetFrom(user: UserActivity): WhenPreset {
  const n = user.slots.length;
  if (n <= 6 && user.slots.every((s) => s.day === "sat" || s.day === "sun")) return "weekend";
  if (n <= 5 && user.slots.every((s) => s.window === "evening" && s.day !== "sat" && s.day !== "sun")) return "weeknight";
  return "any";
}

export function MeetCanvas({ state, onSetActivity, onSwap, onAddSlot, onSayHello, onEdit }: Props) {
  const phase = phaseOf(state);
  if (phase === "gathering") return <FormView onSubmit={onSetActivity} />;
  if (phase === "reviewing") return <PickView state={state} onSwap={onSwap} onSayHello={onSayHello} onEdit={onEdit} />;
  return <EmptyView state={state} onAddSlot={onAddSlot} onEdit={onEdit} />;
}

// ---- Step 1 · say what + when ------------------------------------------

function FormView({ onSubmit, initial }: { onSubmit: (a: UserActivity) => void; initial?: UserActivity }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ActivityKind>(initial?.kind ?? "tennis");
  const [when, setWhen] = useState<WhenPreset>(initial ? presetFrom(initial) : "weekend");

  return (
    <div className="h-full px-6 py-12 overflow-y-auto">
      <div className="mx-auto max-w-lg">
        <h1 className="text-[24px] sm:text-[28px] font-serif italic leading-snug text-foreground text-center">
          {t("meet.hero_prompt")}
        </h1>

        <div className="mt-10 space-y-8">
          <Field label={t("meet.what_label")}>
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map((k) => {
                const active = k === kind;
                return (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={[
                      "flex flex-col items-center justify-center gap-1 rounded-lg border py-3 transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-foreground/80 hover:border-foreground/40 hover:text-foreground",
                    ].join(" ")}
                  >
                    <span className="text-[22px] leading-none">{KIND_EMOJI[k]}</span>
                    <span className="text-[12px]">{t(`activity.kind.${k}`)}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={t("meet.when_label")}>
            <div className="grid grid-cols-1 gap-1.5">
              {(["weekend","weeknight","any"] as WhenPreset[]).map((w) => {
                const active = when === w;
                return (
                  <button
                    key={w}
                    onClick={() => setWhen(w)}
                    className={[
                      "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-foreground/80 hover:border-foreground/40 hover:text-foreground",
                    ].join(" ")}
                  >
                    <span className="text-[13.5px] font-medium">{t(`meet.when_group.${w}`)}</span>
                    <span className={`text-[11px] font-mono ${active ? "text-background/70" : "text-muted-foreground"}`}>
                      {t(`meet.when_group.${w}_hint`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        <button
          onClick={() => onSubmit({ kind, slots: slotsFor(when) })}
          className="mt-10 w-full inline-flex items-center justify-center px-4 py-3 rounded-lg bg-foreground text-background text-[14px] font-medium hover:opacity-90 transition-opacity"
        >
          {t("meet.form_submit")}
        </button>

        <p className="mt-6 text-center text-[11.5px] text-muted-foreground leading-relaxed font-mono">
          {t("meet.disclaimer")}
        </p>
      </div>
    </div>
  );
}

// ---- Step 2 · a candidate on a topic -----------------------------------

function PickView({
  state, onSwap, onSayHello, onEdit,
}: {
  state: SideState;
  onSwap: () => void;
  onSayHello: () => void;
  onEdit: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const c = state.candidate!;
  const user = state.user!;
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
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Pencil className="w-3 h-3" />
            {t("meet.adjust")}
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-secondary border border-border grid place-items-center text-[24px] leading-none">
              {KIND_EMOJI[c.kind]}
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-foreground">
                {kindLabel} · {dayLabel} {winLabel}
              </div>
              <div className="text-[12px] text-muted-foreground">
                {venue}
              </div>
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

        {/* Silence unused-var lint for `user` while keeping the reference
            available if we later want to render the user's own recap. */}
        <span className="hidden">{user.kind}</span>
      </div>
    </div>
  );
}

// ---- Step 2 · no one --------------------------------------------------

function EmptyView({
  state, onAddSlot, onEdit,
}: {
  state: SideState;
  onAddSlot: (slot: { day: Weekday; window: "morning" | "midday" | "evening" }) => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const top = state.nearMisses[0];

  const headline = state.poolExhausted
    ? t("meet.pool_exhausted")
    : t("meet.no_one");

  return (
    <div className="h-full px-6 py-16 overflow-y-auto">
      <div className="mx-auto max-w-md text-center">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
          {t("meet.pick_label")}
        </div>
        <h2 className="mt-3 text-[19px] font-medium text-foreground leading-snug">
          {headline}
        </h2>

        {top ? (
          <>
            <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">
              {t("meet.near_hint", {
                day: t(`activity.day.${top.slot.day}`),
                window: t(`activity.window.${top.slot.window}`),
                count: top.personCount,
              })}
            </p>
            <button
              onClick={() => onAddSlot(top.slot)}
              className="mt-6 inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              {t("meet.near_try", {
                day: t(`activity.day.${top.slot.day}`),
                window: t(`activity.window.${top.slot.window}`),
              })}
            </button>
            <div className="mt-3">
              <button
                onClick={onEdit}
                className="text-[12px] text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2"
              >
                {t("meet.adjust_conditions")}
              </button>
            </div>
          </>
        ) : (
          <div className="mt-6">
            <button
              onClick={onEdit}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              {t("meet.adjust_conditions")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground mb-3">{label}</div>
      {children}
    </div>
  );
}

// Re-export a helper the route uses to know whether to open the edit form.
export { FormView as EditForm };
