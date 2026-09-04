import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityKind } from "@/lib/types";
import type { LevelTier } from "@/lib/intents";
import type { WishDraft } from "@/lib/wish-types";
import { emptyWishDraft } from "@/lib/wish-types";
import { formatActivityWindow } from "@/lib/wish-date";
import { ActivityScheduleFields } from "@/components/activity-schedule-fields";
import { normalizeLang } from "@/lib/lang";
import { wishDescriptionsFromDraft } from "@/lib/wish-match-profile";

const KINDS: ActivityKind[] = [
  "tennis",
  "run",
  "climb",
  "cook",
  "exhibition",
  "bookstore",
  "other",
];
const LEVEL_OPTS: LevelTier[] = ["beginner", "intermediate", "advanced"];
const LEVEL_KINDS: ActivityKind[] = ["tennis", "climb"];

export const WISH_PUBLISH_FORM_VERSION = 2;

export interface WishPublishFormValue {
  v: typeof WISH_PUBLISH_FORM_VERSION;
  draft: WishDraft;
}

/** @deprecated v1 compat — ignored on read */
export interface WishPublishFormValueV1 {
  v: 1;
  draft: WishDraft;
  buddyHardFilters?: unknown;
  otherNotes?: string;
}

export function parseWishPublishFormValue(raw: string): WishPublishFormValue | null {
  try {
    const parsed = JSON.parse(raw) as WishPublishFormValue | WishPublishFormValueV1;
    if (!parsed?.draft) return null;
    if (parsed.v === WISH_PUBLISH_FORM_VERSION) {
      return parsed as WishPublishFormValue;
    }
    if (parsed.v === 1) {
      const v1 = parsed as WishPublishFormValueV1;
      const otherReqRaw =
        v1.otherNotes?.trim() ||
        v1.draft.otherReqRaw?.trim() ||
        "";
      return {
        v: WISH_PUBLISH_FORM_VERSION,
        draft: {
          ...v1.draft,
          otherReqRaw,
        },
      };
    }
    return null;
  } catch {
    return null;
  }
}

interface Props {
  prompt?: string;
  draft: WishDraft;
  buddyHardFilters?: unknown;
  understandingNotes?: string[];
  profileCity?: string;
  placeError?: string;
  confirmLabel: string;
  cancelLabel: string;
  disabled?: boolean;
  /** inline = chat bubble card; canvas = right pane panel */
  variant?: "inline" | "canvas";
  onResolve: (value: string | null) => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] uppercase tracking-[0.12em] font-mono text-muted-foreground mb-1.5">
      {children}
    </label>
  );
}

function inputClass(disabled?: boolean) {
  return [
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-[14px] text-foreground",
    "placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50",
    disabled ? "opacity-50" : "",
  ].join(" ");
}

export function WishPublishForm({
  prompt,
  draft: initialDraft,
  understandingNotes = [],
  profileCity = "",
  placeError,
  confirmLabel,
  cancelLabel,
  disabled,
  variant = "inline",
  onResolve,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.resolvedLanguage);
  const initialDesc = wishDescriptionsFromDraft(initialDraft);
  const [draft, setDraft] = useState<WishDraft>(() => ({
    ...emptyWishDraft(),
    ...initialDraft,
    activityDescRaw: initialDesc.activityDescRaw,
    rawText: initialDesc.activityDescRaw,
    buddyPrefRaw: initialDesc.buddyPrefRaw,
    otherReqRaw:
      initialDesc.otherReqRaw ||
      understandingNotes.join("；"),
    placeRaw:
      initialDraft.placeRaw?.trim() ||
      initialDraft.city?.trim() ||
      profileCity ||
      initialDraft.placeRaw,
    city: initialDraft.city?.trim() || profileCity || initialDraft.city,
    city_zh: initialDraft.city_zh?.trim() || profileCity || initialDraft.city_zh,
  }));

  const showLevel = draft.kind != null && LEVEL_KINDS.includes(draft.kind);
  const canSubmit = useMemo(
    () => (draft.kind != null || (draft.activityDescRaw ?? draft.rawText ?? "").trim().length >= 2) && !disabled,
    [draft.kind, draft.activityDescRaw, draft.rawText, disabled],
  );

  function setLevel(next: LevelTier | "any") {
    if (next === "any") {
      setDraft((d) => ({ ...d, levelAny: true, level: undefined }));
    } else {
      setDraft((d) => ({ ...d, levelAny: false, level: next }));
    }
  }

  function submit() {
    if (!canSubmit) return;
    const placeRaw = draft.placeRaw?.trim() || draft.city?.trim() || profileCity || "";
    const desc = wishDescriptionsFromDraft({
      ...draft,
      placeRaw,
    });
    const payload: WishPublishFormValue = {
      v: WISH_PUBLISH_FORM_VERSION,
      draft: {
        ...draft,
        kind: draft.kind ?? "other",
        placeRaw,
        city: placeRaw,
        city_zh: placeRaw,
        activityDescRaw: desc.activityDescRaw,
        rawText: desc.activityDescRaw,
        buddyPrefRaw: desc.buddyPrefRaw,
        otherReqRaw: desc.otherReqRaw,
        whenAny: !draft.dateStart,
        dateEnd: draft.dateStart ? (draft.dateEnd ?? draft.dateStart) : undefined,
      },
    };
    onResolve(JSON.stringify(payload));
  }

  const activityDesc = draft.activityDescRaw ?? draft.rawText ?? "";
  const shellClass =
    variant === "canvas"
      ? "rounded-xl border border-border bg-card px-4 py-4"
      : "mt-2 rounded-2xl border border-border bg-card px-3.5 py-3.5";

  return (
    <div className={shellClass}>
      {variant === "inline" && (
        <div className="text-[10px] uppercase tracking-[0.14em] font-mono text-muted-foreground/80 mb-2">
          {t("intent.wish_form.hint")}
        </div>
      )}
      {prompt?.trim() && (
        <p className="text-[13.5px] text-foreground leading-relaxed mb-3">{prompt}</p>
      )}
      <div className="text-[13px] font-medium text-foreground mb-3">{t("intent.wish_form.title")}</div>

      <div className="space-y-3.5">
        <div>
          <FieldLabel>{t("intent.wish_form.activity")}</FieldLabel>
          <select
            value={draft.kind ?? ""}
            disabled={disabled}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                kind: (e.target.value || null) as ActivityKind | null,
              }))
            }
            className={inputClass(disabled)}
          >
            <option value="">{t("intent.wish_form.activity_placeholder")}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`activity.kind.${k}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel>{t("intent.wish_form.schedule")}</FieldLabel>
          <ActivityScheduleFields
            disabled={disabled}
            value={{
              dateStart: draft.dateStart,
              timeStart: draft.timeStart,
              timeEnd: draft.timeEnd,
            }}
            labels={{
              year: t("intent.wish_form.year"),
              month: t("intent.wish_form.month"),
              day: t("intent.wish_form.day"),
              start: t("intent.wish_form.time_start"),
              end: t("intent.wish_form.time_end"),
              preview: t("intent.wish_form.schedule_preview"),
            }}
            formatPreview={(v) =>
              formatActivityWindow(
                {
                  dateStart: v.dateStart,
                  dateEnd: v.dateStart,
                  timeStart: v.timeStart,
                  timeEnd: v.timeEnd,
                  whenAny: !v.dateStart,
                },
                lang,
              )
            }
            onChange={(schedule) =>
              setDraft((d) => ({
                ...d,
                dateStart: schedule.dateStart,
                dateEnd: schedule.dateStart,
                timeStart: schedule.timeStart,
                timeEnd: schedule.timeEnd,
                whenAny: !schedule.dateStart,
              }))
            }
          />
        </div>

        <div>
          <FieldLabel>{t("intent.wish_form.place")}</FieldLabel>
          <input
            type="text"
            value={draft.placeRaw ?? draft.city ?? ""}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value;
              setDraft((d) => ({
                ...d,
                placeRaw: next,
                city: next,
                city_zh: next,
              }));
            }}
            placeholder={profileCity || t("intent.wish_form.place_placeholder")}
            className={[
              inputClass(disabled),
              placeError ? "border-destructive focus:border-destructive" : "",
            ].join(" ")}
          />
          {placeError ? (
            <p className="mt-1.5 text-[12px] text-destructive leading-snug">{placeError}</p>
          ) : null}
        </div>

        <div>
          <FieldLabel>{t("intent.wish_form.description")}</FieldLabel>
          <textarea
            value={activityDesc}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value;
              setDraft((d) => ({ ...d, activityDescRaw: next, rawText: next }));
            }}
            rows={3}
            placeholder={t("intent.wish_form.description_placeholder")}
            className={inputClass(disabled) + " min-h-[4.5rem] resize-y leading-relaxed"}
          />
        </div>

        {showLevel && (
          <div>
            <FieldLabel>{t("intent.wish_form.level")}</FieldLabel>
            <select
              value={draft.levelAny ? "any" : draft.level ?? "intermediate"}
              disabled={disabled}
              onChange={(e) => setLevel(e.target.value as LevelTier | "any")}
              className={inputClass(disabled)}
            >
              <option value="any">{t("meet.when.any")}</option>
              {LEVEL_OPTS.map((l) => (
                <option key={l} value={l}>
                  {t(`activity.level.${l}`)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <FieldLabel>{t("intent.wish_form.buddy_pref")}</FieldLabel>
          <textarea
            value={draft.buddyPrefRaw ?? ""}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, buddyPrefRaw: e.target.value }))}
            rows={2}
            placeholder={t("intent.wish_form.buddy_pref_placeholder")}
            className={inputClass(disabled) + " min-h-[3rem] resize-y leading-relaxed"}
          />
        </div>

        <div>
          <FieldLabel>{t("intent.wish_form.notes")}</FieldLabel>
          <textarea
            value={draft.otherReqRaw ?? ""}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, otherReqRaw: e.target.value }))}
            rows={2}
            placeholder={t("intent.wish_form.notes_placeholder")}
            className={inputClass(disabled) + " min-h-[3rem] resize-y leading-relaxed"}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="min-h-11 sm:min-h-9 px-4 rounded-lg text-[13px] font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onResolve(null)}
          className="min-h-11 sm:min-h-9 px-4 rounded-lg text-[13px] text-foreground/80 border border-border hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
