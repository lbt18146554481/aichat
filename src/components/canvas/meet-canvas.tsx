import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X, Loader2, Plus, Pencil } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { NearMiss, SideState, UserActivity } from "@/lib/agents/side-by-side";
import { findNearMisses, otherKinds } from "@/lib/agents/side-by-side";
import type { ActivityKind, Weekday } from "@/lib/types";
import { avatarUrl, getPersonById, localized } from "@/lib/people";

interface Props {
  state: SideState;
  onSetActivity: (a: UserActivity) => void;
  onUpdateActivity: (a: UserActivity) => void;
  onAddSlot: (slot: { day: Weekday; window: "morning" | "midday" | "evening" }) => void;
  onSwitchKind: (kind: ActivityKind) => void;
  onAccept: () => void;
  onDecline: () => void;
  onTheirReply: (accepted: boolean) => void;
}

const KINDS: ActivityKind[] = ["tennis", "run", "climb", "cook", "exhibition", "bookstore"];
const DAYS: Weekday[] = ["mon","tue","wed","thu","fri","sat","sun"];
const WINDOWS = ["morning", "midday", "evening"] as const;
const LEVELS = ["beginner","intermediate","advanced"] as const;

export function MeetCanvas({
  state,
  onSetActivity,
  onUpdateActivity,
  onAddSlot,
  onSwitchKind,
  onAccept,
  onDecline,
  onTheirReply,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";

  // Simulate the other side replying ~6–10 seconds after Accept.
  useEffect(() => {
    if (state.phase !== "awaiting_them") return;
    const ms = 6000 + Math.random() * 4000;
    const handle = window.setTimeout(() => onTheirReply(true), ms);
    return () => window.clearTimeout(handle);
  }, [state.phase, onTheirReply]);

  if (!state.user) {
    return <ActivityForm onSubmit={onSetActivity} />;
  }

  if (state.phase === "waiting") {
    return (
      <WaitingPane
        state={state}
        lang={lang}
        onAddSlot={onAddSlot}
        onSwitchKind={onSwitchKind}
        onUpdate={onUpdateActivity}
      />
    );
  }

  const proposal = state.proposal;
  if (!proposal) return null;
  const person = getPersonById(proposal.personId);
  if (!person) return null;
  const loc = localized(person, lang);

  const anon = state.phase === "proposed" || state.phase === "awaiting_them";
  const reason = lang === "zh-CN" ? proposal.reason_zh : proposal.reason;
  const venue = lang === "zh-CN" ? proposal.venue_zh : proposal.venue;
  const kindLabel = t(`activity.kind.${proposal.kind}`);
  const dayLabel = t(`activity.day.${proposal.day}`);
  const winLabel = t(`activity.window.${proposal.window}`);

  return (
    <div className="h-full px-8 py-10 overflow-y-auto">
      <div className="mx-auto max-w-md">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
          {t("meet.label")}
        </div>
        <h2 className="mt-2 text-[18px] font-semibold tracking-tight text-foreground">
          {t("meet.title")}
        </h2>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground leading-relaxed">
          {t("meet.subtitle")}
        </p>

        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            {anon ? (
              <div className="w-12 h-12 rounded-full bg-secondary border border-border grid place-items-center text-muted-foreground text-[18px] font-mono">
                ?
              </div>
            ) : (
              <img src={avatarUrl(person.id)} alt={loc.name} className="w-12 h-12 rounded-full border border-border" />
            )}
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-foreground">
                {anon ? t("meet.anon_name") : `${loc.name}, ${person.age}`}
              </div>
              <div className="text-[11.5px] text-muted-foreground font-mono">
                {kindLabel} · {t(`activity.level.${state.user.level}`)}
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-2 text-[13px] text-foreground">
            <Row label={t("meet.when")} value={`${dayLabel} · ${winLabel}`} />
            <Row label={t("meet.where")} value={venue} />
          </div>

          <p className="mt-5 pt-4 border-t border-border text-[12.5px] text-muted-foreground leading-relaxed">
            {reason}
          </p>
        </div>

        {state.phase === "proposed" && (
          <div className="mt-5 flex gap-2">
            <button
              onClick={onAccept}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              <Check className="w-3.5 h-3.5" />
              {t("meet.accept")}
            </button>
            <button
              onClick={onDecline}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              {t("meet.decline")}
            </button>
          </div>
        )}

        {state.phase === "awaiting_them" && (
          <p className="mt-5 inline-flex items-center gap-2 text-[12px] text-muted-foreground font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t("meet.awaiting_them")}
          </p>
        )}

        {state.phase === "confirmed" && (
          <p className="mt-5 text-[12.5px] text-foreground leading-relaxed border-l-2 border-foreground pl-3">
            {t("meet.confirmed_note")}
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground w-14 shrink-0">{label}</span>
      <span className="text-[13.5px] text-foreground">{value}</span>
    </div>
  );
}

// ---- Waiting pane -------------------------------------------------------

function WaitingPane({
  state,
  lang,
  onAddSlot,
  onSwitchKind,
  onUpdate,
}: {
  state: SideState;
  lang: Lang;
  onAddSlot: (slot: { day: Weekday; window: "morning" | "midday" | "evening" }) => void;
  onSwitchKind: (kind: ActivityKind) => void;
  onUpdate: (a: UserActivity) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const user = state.user!;
  const nears = findNearMisses(state);
  const swaps = otherKinds(state);

  if (editing) {
    return (
      <ActivityForm
        initial={user}
        onSubmit={(a) => { onUpdate(a); setEditing(false); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const primarySlot = user.slots[0];

  return (
    <div className="h-full px-8 py-10 overflow-y-auto">
      <div className="mx-auto max-w-md">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
          {t("meet.recap_label")}
        </div>
        <h2 className="mt-2 text-[18px] font-semibold tracking-tight text-foreground">
          {t("meet.watching_title")}
        </h2>

        {/* Recap */}
        <div className="mt-5 rounded-xl border border-border bg-secondary/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-foreground">
                {t(`activity.kind.${user.kind}`)} · {t(`activity.level.${user.level}`)}
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                {user.slots.map((s) => `${t(`activity.day.${s.day}`)} · ${t(`activity.window.${s.window}`)}`).join(" / ")}
                {user.area && user.area !== "—" ? ` · ${user.area}` : ""}
              </div>
            </div>
            <button
              onClick={() => setEditing(true)}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            >
              <Pencil className="w-3 h-3" />
              {t("meet.adjust")}
            </button>
          </div>
        </div>

        {/* Near misses */}
        {nears.length > 0 ? (
          <>
            <p className="mt-6 text-[12.5px] text-muted-foreground leading-relaxed">
              {t("meet.near_intro")}
            </p>
            <div className="mt-3 space-y-2">
              {nears.map((n, i) => (
                <NearCard key={i} near={n} lang={lang} onAddSlot={onAddSlot} onSwitchKind={onSwitchKind} />
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="mt-6 text-[12.5px] text-muted-foreground leading-relaxed">
              {t("meet.near_empty_intro", { kind: t(`activity.kind.${user.kind}`) })}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {swaps.map((k) => (
                <button
                  key={k}
                  onClick={() => onSwitchKind(k)}
                  className="px-2.5 py-1.5 rounded-md text-[12px] border border-border bg-card text-foreground/80 hover:border-foreground/40 hover:text-foreground transition-colors"
                >
                  {t(`activity.kind.${k}`)}
                </button>
              ))}
            </div>
          </>
        )}

        <p className="mt-8 text-[11.5px] text-muted-foreground leading-relaxed border-t border-border pt-4">
          {t("meet.watching_hint")}
          {primarySlot ? "" : ""}
        </p>
      </div>
    </div>
  );
}

function NearCard({
  near,
  lang,
  onAddSlot,
  onSwitchKind,
}: {
  near: NearMiss;
  lang: Lang;
  onAddSlot: (slot: { day: Weekday; window: "morning" | "midday" | "evening" }) => void;
  onSwitchKind: (kind: ActivityKind) => void;
}) {
  const { t } = useTranslation();
  if (near.variant === "other_slot" && near.hint.slot) {
    const s = near.hint.slot;
    const line = lang === "zh-CN"
      ? `${t(`activity.day.${s.day}`)}${t(`activity.window.${s.window}`)} · ${t("meet.near_people_count", { count: near.personCount })}`
      : `${t(`activity.day.${s.day}`)} ${t(`activity.window.${s.window}`)} · ${t("meet.near_people_count", { count: near.personCount })}`;
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5">
        <div className="text-[13px] text-foreground">{line}</div>
        <button
          onClick={() => onAddSlot(s)}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] bg-foreground text-background hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3 h-3" />
          {t("meet.near_add_slot")}
        </button>
      </div>
    );
  }
  if (near.variant === "other_kind_same_slot" && near.hint.kind) {
    const k = near.hint.kind;
    const line = t("meet.near_other_kind", {
      kind: t(`activity.kind.${k}`),
      count: near.personCount,
    });
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5">
        <div className="text-[13px] text-foreground">{line}</div>
        <button
          onClick={() => onSwitchKind(k)}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] border border-border text-foreground hover:border-foreground/60 transition-colors"
        >
          {t("meet.near_switch_kind")}
        </button>
      </div>
    );
  }
  return null;
}

// ---- Activity form ------------------------------------------------------

function ActivityForm({
  onSubmit,
  initial,
  onCancel,
}: {
  onSubmit: (a: UserActivity) => void;
  initial?: UserActivity;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ActivityKind>(initial?.kind ?? "tennis");
  const [level, setLevel] = useState<typeof LEVELS[number]>(initial?.level ?? "intermediate");
  const [day, setDay] = useState<Weekday>(initial?.slots[0]?.day ?? "sat");
  const [windowSel, setWindow] = useState<typeof WINDOWS[number]>(initial?.slots[0]?.window ?? "morning");
  const [area, setArea] = useState(initial?.area && initial.area !== "—" ? initial.area : "");

  return (
    <div className="h-full px-8 py-10 overflow-y-auto">
      <div className="mx-auto max-w-md">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
          {t(initial ? "meet.adjust_label" : "meet.form_label")}
        </div>
        <h2 className="mt-2 text-[18px] font-semibold tracking-tight text-foreground">
          {t(initial ? "meet.adjust_title" : "meet.form_title")}
        </h2>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground leading-relaxed">
          {t("meet.form_subtitle")}
        </p>

        <div className="mt-6 space-y-5">
          <Field label={t("meet.form_what")}>
            <ChipGroup
              options={KINDS.map((k) => ({ id: k, label: t(`activity.kind.${k}`) }))}
              value={kind}
              onChange={(v) => setKind(v as ActivityKind)}
            />
          </Field>
          <Field label={t("meet.form_level")}>
            <ChipGroup
              options={LEVELS.map((l) => ({ id: l, label: t(`activity.level.${l}`) }))}
              value={level}
              onChange={(v) => setLevel(v as typeof LEVELS[number])}
            />
          </Field>
          <Field label={t("meet.form_day")}>
            <ChipGroup
              options={DAYS.map((d) => ({ id: d, label: t(`activity.day_short.${d}`) }))}
              value={day}
              onChange={(v) => setDay(v as Weekday)}
            />
          </Field>
          <Field label={t("meet.form_window")}>
            <ChipGroup
              options={WINDOWS.map((w) => ({ id: w, label: t(`activity.window.${w}`) }))}
              value={windowSel}
              onChange={(v) => setWindow(v as typeof WINDOWS[number])}
            />
          </Field>
          <Field label={t("meet.form_area")}>
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder={t("meet.form_area_placeholder")}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/30"
            />
          </Field>
        </div>

        <div className="mt-7 flex items-center gap-2">
          <button
            onClick={() => onSubmit({ kind, level, area: area || "—", slots: [{ day, window: windowSel }] })}
            className="inline-flex items-center px-4 py-2.5 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
          >
            {t(initial ? "meet.adjust_submit" : "meet.form_submit")}
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="inline-flex items-center px-4 py-2.5 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("meet.adjust_cancel")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground mb-2">{label}</div>
      {children}
    </div>
  );
}

function ChipGroup({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`px-2.5 py-1.5 rounded-md text-[12px] border transition-colors ${
              active ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/40"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
