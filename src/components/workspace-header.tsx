import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, MessageCircle, RotateCcw, UserCircle } from "lucide-react";
import { LangSwitcher } from "./lang-switcher";
import { hasUnseen, list, subscribe } from "@/lib/connections";

interface Props {
  agentNameKey: string;
  agentSubtitleKey: string;
  onReset?: () => void;
}

export function WorkspaceHeader({ agentNameKey, agentSubtitleKey, onReset }: Props) {
  const { t } = useTranslation();
  const [connCount, setConnCount] = useState(0);
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    const update = () => { setConnCount(list().length); setUnseen(hasUnseen()); };
    update();
    const unsub = subscribe(update);
    return () => { unsub(); };
  }, []);

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
          {connCount > 0 && (
            <Link
              to="/connections"
              className="relative inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>{t("header.connections")}</span>
              {unseen && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-foreground" />}
            </Link>
          )}
          <Link
            to="/profile"
            aria-label={t("header.profile")}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <UserCircle className="w-3.5 h-3.5" />
            <span>{t("header.profile")}</span>
          </Link>
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
