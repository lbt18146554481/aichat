import { Link, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { LangSwitcher } from "./lang-switcher";

interface Props {
  /** Translation key for the agent's name (e.g. "agents.matchmaker.name"). */
  agentNameKey: string;
  /** Translation key for the short subtitle. */
  agentSubtitleKey: string;
  /** Show a reset button. */
  onReset?: () => void;
}

export function WorkspaceHeader({ agentNameKey, agentSubtitleKey, onReset }: Props) {
  const { t } = useTranslation();
  return (
    <header className="w-full border-b border-border bg-background/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("nav.home")}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-mono uppercase tracking-wide">Kindred</span>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[13.5px] font-semibold tracking-tight text-foreground truncate">
              {t(agentNameKey)}
            </span>
            <span className="text-[10px] font-mono tracking-wide text-muted-foreground uppercase truncate">
              {t(agentSubtitleKey)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onReset && (
            <button
              onClick={onReset}
              aria-label={t("header.reset")}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              {t("header.reset")}
            </button>
          )}
          <LangSwitcher />
        </div>
      </div>
    </header>
  );
}
