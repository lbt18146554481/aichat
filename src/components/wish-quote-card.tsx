import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Intent } from "@/lib/intents";
import type { AppLang } from "@/lib/lang";
import { formatWishContentLines } from "@/lib/wish-display";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface WishQuoteCardProps {
  intent: Intent;
  lang: AppLang;
  compact?: boolean;
  onRemove?: () => void;
  className?: string;
}

export function WishQuoteCard({
  intent,
  lang,
  compact,
  onRemove,
  className = "",
}: WishQuoteCardProps) {
  const { t } = useTranslation();
  const lines = formatWishContentLines(intent, lang);
  const preview = lines.activity || t(`activity.kind.${intent.kind}`);

  return (
    <div
      className={[
        "rounded-lg border border-border bg-card px-3 py-2.5",
        className,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-wide font-mono text-muted-foreground mb-1">
            {t("intent.wish_quote_label")}
          </div>
          <p className="text-[13px] font-medium text-foreground leading-snug">
            {t("intent.saw_your_wish")}
          </p>
          {!compact && (
            <p className="mt-1 text-[12px] text-muted-foreground line-clamp-2">{preview}</p>
          )}
        </div>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 text-[18px] leading-none text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("intent.remove_wish_quote")}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function WishQuoteDetailSheet({
  intent,
  lang,
  open,
  onOpenChange,
}: {
  intent: Intent;
  lang: AppLang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const lines = formatWishContentLines(intent, lang);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <div className="pt-2 pb-6">
          <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
            {t("intent.wish_content_label")}
          </div>
          <dl className="mt-4 space-y-3 text-[13px]">
            <div>
              <dt className="text-muted-foreground text-[11px] font-mono uppercase">
                {t("intent.wish_time_label")}
              </dt>
              <dd className="mt-0.5 text-foreground">{lines.time}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[11px] font-mono uppercase">
                {t("intent.wish_place_label")}
              </dt>
              <dd className="mt-0.5 text-foreground">{lines.place}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[11px] font-mono uppercase">
                {t("intent.wish_activity_label")}
              </dt>
              <dd className="mt-0.5 text-foreground">{lines.activity}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[11px] font-mono uppercase">
                {t("intent.wish_buddy_pref_label")}
              </dt>
              <dd className="mt-0.5 text-foreground">{lines.buddyPref}</dd>
            </div>
          </dl>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function WishQuoteChatBubble({
  intent,
  lang,
  fromMe,
}: {
  intent: Intent;
  lang: AppLang;
  fromMe: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const lines = formatWishContentLines(intent, lang);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          "max-w-[85%] text-left rounded-2xl border px-3.5 py-2.5 transition-colors",
          fromMe
            ? "rounded-br-md border-primary/30 bg-primary/10 hover:bg-primary/15"
            : "rounded-bl-md border-border bg-secondary hover:bg-secondary/80",
        ].join(" ")}
      >
        <div className="text-[10px] uppercase tracking-wide font-mono text-muted-foreground mb-1">
          {t("intent.wish_quote_label")}
        </div>
        <div className="text-[13.5px] font-medium text-foreground">{t("intent.saw_your_wish")}</div>
        <div className="mt-1 text-[12px] text-muted-foreground line-clamp-2">
          {lines.activity || t(`activity.kind.${intent.kind}`)}
        </div>
        <div className="mt-1.5 text-[11px] text-primary/80">{t("intent.wish_quote_tap_detail")}</div>
      </button>
      <WishQuoteDetailSheet intent={intent} lang={lang} open={open} onOpenChange={setOpen} />
    </>
  );
}
