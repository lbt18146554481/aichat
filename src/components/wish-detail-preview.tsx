import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Intent } from "@/lib/intents";
import type { ActivityKind } from "@/lib/types";
import type { AppLang } from "@/lib/lang";
import { normalizeLang } from "@/lib/lang";
import { formatWishContentLines } from "@/lib/wish-display";
import { loadProfile } from "@/lib/profile";
import { WishPublisherHeader } from "@/components/wish-publisher-header";

const KIND_EMOJI: Record<ActivityKind, string> = {
  tennis: "🎾",
  run: "🏃",
  climb: "🧗",
  cook: "🍳",
  exhibition: "🖼",
  bookstore: "📚",
  other: "✨",
};

function WishContentRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] sm:grid-cols-[5rem_1fr] gap-x-2 gap-y-0.5 text-[13px] leading-relaxed">
      <dt className="text-muted-foreground font-mono text-[11px] uppercase tracking-wide pt-0.5">
        {label}
      </dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

export function WishDetailPreview({ intent, lang }: { intent: Intent; lang?: AppLang }) {
  const { t, i18n } = useTranslation();
  const resolvedLang = lang ?? normalizeLang(i18n.resolvedLanguage);
  const lines = formatWishContentLines(intent, resolvedLang);
  const profile = loadProfile();

  return (
    <div className="space-y-4">
      <WishPublisherHeader profile={profile} lang={resolvedLang} />

      <section className="rounded-xl border border-border bg-card px-4 py-3.5">
        <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
          {t("intent.wish_content_label")}
        </div>
        <dl className="mt-3 space-y-2.5">
          <WishContentRow label={t("intent.wish_time_label")} value={lines.time} />
          <WishContentRow label={t("intent.wish_place_label")} value={lines.place} />
          <WishContentRow
            label={t("intent.wish_activity_label")}
            value={
              lines.activity ? (
                <>
                  <span className="mr-1.5">{KIND_EMOJI[intent.kind]}</span>
                  {lines.activity}
                </>
              ) : (
                <span className="text-muted-foreground">{t(`activity.kind.${intent.kind}`)}</span>
              )
            }
          />
          <WishContentRow label={t("intent.wish_buddy_pref_label")} value={lines.buddyPref} />
        </dl>
      </section>
    </div>
  );
}
