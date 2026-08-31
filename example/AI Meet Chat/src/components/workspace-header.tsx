import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, MessageCircle, RotateCcw } from "lucide-react";
import { LangSwitcher } from "./lang-switcher";
import { HistoryTrigger } from "./history-trigger";
import { SavedTrigger } from "./saved-trigger";
import { AccountMenu } from "./account-menu";
import { useConnections, hasUnseenIn, usePeopleLookup } from "@/data/hooks";
import type { Connection } from "@/lib/connections";
import { avatarUrl, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";

interface Props {
  agentNameKey: string;
  agentSubtitleKey: string;
  onReset?: () => void;
}

// The connection whose "arrival" should light up the bell: prefer a newly
// connected reply, then an incoming hello. Anything the user has already
// seen is filtered out.
function pickAlert(items: Connection[]): Connection | null {
  const unseenConnected = items
    .filter((c) => c.status === "connected" && (c.lastSeenAt ?? 0) < (c.connectedAt ?? c.helloAt))
    .sort((a, b) => (b.connectedAt ?? 0) - (a.connectedAt ?? 0))[0];
  if (unseenConnected) return unseenConnected;
  const unseenIncoming = items
    .filter((c) => c.status === "incoming" && (c.lastSeenAt ?? 0) < c.helloAt)
    .sort((a, b) => b.helloAt - a.helloAt)[0];
  return unseenIncoming ?? null;
}

export function WorkspaceHeader({ agentNameKey, agentSubtitleKey, onReset }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const items = useConnections().data;
  const unseen = hasUnseenIn(items);
  const alert = pickAlert(items);
  const personById = usePeopleLookup();

  const alertPerson = alert ? personById(alert.personId) : null;
  const alertName = alertPerson ? localized(alertPerson, lang).name : "";

  return (
    <header className="w-full border-b border-border bg-background/90 backdrop-blur sticky top-0 z-30 pt-safe">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 h-14 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link
            to="/"
            className="inline-flex items-center gap-1 min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 -ml-2 sm:ml-0 px-2 sm:px-0 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("nav.home")}
          >
            <ArrowLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="font-mono uppercase tracking-wide hidden sm:inline">Maitri</span>
          </Link>
          <span className="text-muted-foreground/40 hidden sm:inline">/</span>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[13.5px] font-semibold tracking-tight text-foreground truncate">
              {t(agentNameKey)}
            </span>
            <span className="text-[10px] font-mono tracking-wide text-muted-foreground uppercase truncate hidden sm:inline">
              {t(agentSubtitleKey)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {alert && alertPerson ? (
            <Link
              to="/connections"
              aria-label={
                alert.status === "connected"
                  ? t("notify.replied", { name: alertName })
                  : t("notify.new_hello", { name: alertName })
              }
              className="relative inline-flex items-center gap-2 pl-1 pr-1 sm:pr-2.5 py-1 rounded-full border border-border bg-card hover:bg-secondary transition-colors"
            >
              <span className="relative">
                <img
                  src={avatarUrl(alertPerson.id)}
                  alt=""
                  className="w-6 h-6 rounded-full border border-border bg-secondary"
                />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background" />
              </span>
              <span className="hidden sm:inline text-[11.5px] text-foreground max-w-[9rem] truncate">
                {alert.status === "connected"
                  ? t("notify.replied", { name: alertName })
                  : t("notify.new_hello", { name: alertName })}
              </span>
            </Link>
          ) : (
            <Link
              to="/connections"
              aria-label={t("header.connections")}
              className="relative inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <MessageCircle className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">{t("header.connections")}</span>
              {unseen && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Link>
          )}
          <SavedTrigger variant="compact" />
          <HistoryTrigger variant="compact" />

          {onReset && (
            <button
              onClick={onReset}
              aria-label={t("header.reset")}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <RotateCcw className="w-4 h-4 sm:w-3 sm:h-3" />
              <span className="hidden sm:inline">{t("header.reset")}</span>
            </button>
          )}
          <div className="hidden sm:block">
            <LangSwitcher />
          </div>
          <AccountMenu compact />
        </div>
      </div>
    </header>
  );
}
