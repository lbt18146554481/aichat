// HistoryTrigger — global entry point to the History drawer.
//
// A minimal header button that opens a right-side drawer listing every
// session the user has ever started. Reused on every page's header.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Clock, ArrowRight } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SessionList } from "@/components/session-list";

interface Props {
  /** Visual density — "compact" matches the workspace header, "default" the home header. */
  variant?: "default" | "compact";
}

export function HistoryTrigger({ variant = "default" }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const btnClass =
    variant === "compact"
      ? "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      : "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-foreground/80 hover:text-foreground hover:bg-secondary transition-colors";
  const iconClass = "w-3.5 h-3.5";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" className={btnClass} aria-label={t("history.title")}>
          <Clock className={iconClass} strokeWidth={1.75} />
          <span>{t("home.history")}</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-3 border-b border-border">
          <div className="flex items-baseline justify-between gap-4">
            <SheetTitle className="text-[16px] font-semibold tracking-tight text-foreground">
              {t("history.title")}
            </SheetTitle>
            <Link
              to="/sessions"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("history.view_all")}
              <ArrowRight className="w-3 h-3" strokeWidth={1.75} />
            </Link>
          </div>
          <p className="text-[12px] text-muted-foreground text-left">
            {t("history.subtitle")}
          </p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4" onClick={() => setOpen(false)}>
          <SessionList limit={8} embedded />
        </div>
      </SheetContent>
    </Sheet>
  );
}
