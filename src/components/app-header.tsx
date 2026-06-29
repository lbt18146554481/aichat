import { Link } from "@tanstack/react-router";
import { Bookmark } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LangSwitcher } from "./lang-switcher";

interface Props {
  savedCount: number;
  onOpenSaved: () => void;
  onReset?: () => void;
}

export function AppHeader({ savedCount, onOpenSaved, onReset }: Props) {
  const { t } = useTranslation();

  return (
    <header className="w-full border-b border-border bg-background/85 backdrop-blur sticky top-0 z-30">
      <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-6 h-6 rounded-md bg-foreground text-background grid place-items-center font-mono text-[11px] font-bold">
            K
          </div>
          <div className="text-[14px] font-semibold tracking-tight text-foreground">
            {t("app.name")}
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {onReset && (
            <button
              onClick={onReset}
              className="hidden sm:inline-flex px-2.5 py-1 rounded-md border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              {t("header.reset")}
            </button>
          )}
          <button
            onClick={onOpenSaved}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-card text-xs text-foreground hover:bg-secondary transition-colors"
            aria-label={t("header.saved")}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span className="font-mono tabular-nums">{savedCount}</span>
          </button>
          <LangSwitcher />
        </div>
      </div>
    </header>
  );
}
