// AgentAsk — the Agent's inline "补充 / 确认" card.
//
// Renders inside the chat stream, attached to the last assistant message.
// The Agent uses this whenever it needs something from you to continue —
// a fact, a choice, or a yes/no on an action. Not tied to Profile: the
// answer drives the current action; if a Profile field is involved, an
// explicit "☐ Also save to my profile" checkbox controls the side effect.
//
// Presentation only — the caller owns state via `onResolve(value | null)`.
// value: string for text/select, "confirm" | "cancel" for confirm.
// The optional 2nd arg `writeback` tells the caller whether the user opted
// in to persisting the value to their Profile (only meaningful for text
// asks with `writebackToProfile: true`).

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  MessageCircle,
  User,
  AlertTriangle,
  Pencil,
  Check,
} from "lucide-react";

export type AskScope = "wish" | "hello" | "profile" | "action";

interface ScopeMeta {
  /** Optional label override; defaults to a scoped translation key. */
  label?: string;
}

interface CommonFields {
  id: string;
  prompt?: string;
  /** What this ask serves. Shown as a small tag at the top of the card. */
  scope?: AskScope;
  scopeMeta?: ScopeMeta;
}

export type AgentAsk =
  | (CommonFields & {
      kind: "text";
      placeholder?: string;
      initial?: string;
      /** Multi-line textarea instead of single-line input. */
      multiline?: boolean;
      confirmLabel: string;
      skipLabel?: string;
      /** When set, the card shows a "☐ Also save to my profile" checkbox.
       *  Caller reads the second argument of onResolve to decide the writeback. */
      writebackToProfile?: boolean;
      /** Default state of the writeback checkbox (defaults to true). */
      writebackDefault?: boolean;
      /** Label for the writeback checkbox (falls back to i18n default). */
      writebackLabel?: string;
    })
  | (CommonFields & {
      kind: "select";
      options: { value: string; label: string }[];
      skipLabel?: string;
    })
  | (CommonFields & {
      kind: "confirm";
      confirmLabel: string;
      cancelLabel: string;
      tone?: "default" | "danger";
    });

interface Props {
  ask: AgentAsk;
  disabled?: boolean;
  /** value === null when the user passed / skipped. `writeback` is only
   *  meaningful when the ask is `text` + `writebackToProfile: true`. */
  onResolve: (value: string | null, writeback?: boolean) => void;
}

/** Small scoped tag at the top of an ask card. Makes it obvious what the
 *  Agent is asking *for* — a wish, a hello, a profile field, or an action. */
function ScopeTag({ scope, meta }: { scope?: AskScope; meta?: ScopeMeta }) {
  const { t } = useTranslation();
  if (!scope) return null;
  const Icon =
    scope === "wish"
      ? Sparkles
      : scope === "hello"
        ? MessageCircle
        : scope === "profile"
          ? User
          : AlertTriangle;
  const isDanger = scope === "action";
  const label = meta?.label ?? t(`ask.scope.${scope}`);
  return (
    <div
      className={[
        "flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] font-mono mb-2",
        isDanger ? "text-destructive/85" : "text-muted-foreground",
      ].join(" ")}
    >
      <Icon className="w-3 h-3" />
      <span>{label}</span>
    </div>
  );
}

export function AgentAskCard({ ask, disabled, onResolve }: Props) {
  const { t } = useTranslation();

  if (ask.kind === "text") {
    return (
      <TextAsk
        ask={ask}
        disabled={disabled}
        onResolve={onResolve}
        t={t}
      />
    );
  }
  if (ask.kind === "select") {
    return (
      <div className="mt-2 rounded-2xl border border-border bg-card px-3.5 py-3">
        <ScopeTag scope={ask.scope} meta={ask.scopeMeta} />
        {ask.prompt && (
          <p className="text-[13.5px] text-foreground leading-relaxed mb-2.5">
            {ask.prompt}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {ask.options.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              onClick={() => onResolve(o.value)}
              className="min-h-11 sm:min-h-9 px-3.5 py-1.5 rounded-full border border-border bg-background text-[13px] text-foreground/85 hover:border-primary/50 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {o.label}
            </button>
          ))}
          {ask.skipLabel && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onResolve(null)}
              className="min-h-11 sm:min-h-9 px-3 py-1.5 rounded-full text-[12.5px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {ask.skipLabel}
            </button>
          )}
        </div>
      </div>
    );
  }
  // confirm
  const scope: AskScope | undefined = ask.scope ?? (ask.tone === "danger" ? "action" : undefined);
  return (
    <div
      className={[
        "mt-2 rounded-2xl border px-3.5 py-3",
        ask.tone === "danger" ? "border-destructive/25 bg-destructive/5" : "border-border bg-card",
      ].join(" ")}
    >
      <ScopeTag scope={scope} meta={ask.scopeMeta} />
      {ask.prompt && (
        <p className="text-[13.5px] text-foreground leading-relaxed mb-2.5">
          {ask.prompt}
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onResolve("confirm")}
          className={[
            "min-h-11 sm:min-h-9 px-4 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
            ask.tone === "danger"
              ? "bg-destructive text-destructive-foreground hover:opacity-90"
              : "bg-primary text-primary-foreground hover:opacity-90",
          ].join(" ")}
        >
          {ask.confirmLabel}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onResolve(null)}
          className="min-h-11 sm:min-h-9 px-4 rounded-lg text-[13px] text-foreground/80 border border-border hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {ask.cancelLabel}
        </button>
      </div>
    </div>
  );
}

function TextAsk({
  ask,
  disabled,
  onResolve,
  onOpenProfile,
  t,
}: {
  ask: Extract<AgentAsk, { kind: "text" }>;
  disabled?: boolean;
  onResolve: (v: string | null, writeback?: boolean) => void;
  onOpenProfile?: () => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const [value, setValue] = useState(ask.initial ?? "");
  const [writeback, setWriteback] = useState<boolean>(ask.writebackDefault ?? true);
  const canSubmit = value.trim().length > 0 && !disabled;

  function submit() {
    if (!canSubmit) return;
    onResolve(value.trim(), ask.writebackToProfile ? writeback : undefined);
  }

  return (
    <div className="mt-2 rounded-2xl border border-border bg-card px-3.5 py-3">
      <ScopeTag scope={ask.scope} meta={ask.scopeMeta} />
      {ask.prompt && (
        <p className="text-[13.5px] text-foreground leading-relaxed mb-2.5">
          {ask.prompt}
        </p>
      )}
      {ask.multiline ? (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder={ask.placeholder}
          disabled={disabled}
          autoFocus
          className="w-full min-h-24 rounded-lg border border-border bg-background px-3 py-2 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50 disabled:opacity-50 resize-y"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={ask.placeholder}
          disabled={disabled}
          autoFocus
          className="w-full h-11 rounded-lg border border-border bg-background px-3 text-[14px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50 disabled:opacity-50"
        />
      )}

      {ask.writebackToProfile && (
        <label className="mt-2.5 flex items-start gap-2 text-[12.5px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={writeback}
            onChange={(e) => setWriteback(e.target.checked)}
            disabled={disabled}
            className="mt-[3px] w-3.5 h-3.5 rounded border-border accent-primary"
          />
          <span className="leading-relaxed">
            {ask.writebackLabel ?? t("ask.writeback_default")}
          </span>
        </label>
      )}

      <div className="mt-2 flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="min-h-11 sm:min-h-9 px-4 rounded-lg text-[13px] font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {ask.confirmLabel}
        </button>
        {ask.skipToProfile && onOpenProfile ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onOpenProfile}
            className="min-h-11 sm:min-h-9 px-4 rounded-lg text-[13px] text-foreground/80 border border-border hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {ask.skipLabel ?? t("ask.open_full_profile")}
          </button>
        ) : ask.skipLabel ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onResolve(null)}
            className="min-h-11 sm:min-h-9 px-4 rounded-lg text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {ask.skipLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Collapsed pill shown after the user resolved an ask — feeds a sense
 *  of "the Agent noted it and moved on". Rendered inline in place of the
 *  original card. Includes an optional "edit" affordance so the user is
 *  never locked into their first answer. */
export function AgentAskResolved({
  label,
  onEdit,
}: {
  label: string;
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[12px] text-muted-foreground">
      <Check className="w-3 h-3 text-primary" />
      <span className="truncate max-w-[240px]">{label}</span>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="ml-1 inline-flex items-center gap-0.5 text-[11.5px] text-muted-foreground/85 hover:text-foreground transition-colors"
          aria-label={t("ask.edit")}
        >
          <Pencil className="w-2.5 h-2.5" />
          {t("ask.edit")}
        </button>
      )}
    </div>
  );
}
