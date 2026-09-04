import { useTranslation } from "react-i18next";

/** Shown on seed profile cards — these people are AI companion personas, not real users. */
export function AiPersonaBadge({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={[
        "inline-flex items-center rounded-md border border-border/80 bg-secondary/80",
        "px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground",
        className,
      ].join(" ")}
    >
      {t("persona.ai_badge")}
    </span>
  );
}
