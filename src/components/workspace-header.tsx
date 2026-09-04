import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MessageCircle, Plus, Sparkles } from "lucide-react";
import { LangSwitcher } from "./lang-switcher";
import { HistoryTrigger } from "./history-trigger";
import { SavedTrigger } from "./saved-trigger";
import { AccountMenu } from "./account-menu";
import { useConnections, hasUnseenIn } from "@/data/hooks";
import { hasUnseenFor, type Connection } from "@/lib/connections";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import { normalizeLang } from "@/lib/lang";

interface Props {
  agentNameKey: string;
  agentSubtitleKey: string;
  onReset?: () => void;
}

function connectionActivityAt(c: Connection): number {
  const last = c.messages[c.messages.length - 1];
  return Math.max(last?.t ?? 0, c.connectedAt ?? 0, c.helloAt);
}

function pickAlert(items: Connection[]): Connection | null {
  return (
    items
      .filter((c) => hasUnseenFor(c))
      .sort((a, b) => connectionActivityAt(b) - connectionActivityAt(a))[0] ?? null
  );
}

export function WorkspaceHeader({ agentNameKey, agentSubtitleKey, onReset }: Props) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.resolvedLanguage);
  const { data: items = [] } = useConnections(true);
  const unseen = hasUnseenIn(items);
  const alert = pickAlert(items);
  const alertPerson = alert ? getPersonById(alert.personId) : null;
  const alertName = alertPerson ? localized(alertPerson, lang).name : "";

  return (
    <header className="w-full border-b border-border bg-background/90 backdrop-blur sticky top-0 z-30 pt-safe">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 h-14 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <span className="w-6 h-6 shrink-0 rounded-md bg-primary text-primary-foreground grid place-items-center font-mono text-[11px] font-bold">
              K
            </span>
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[13.5px] font-semibold tracking-tight text-foreground truncate">
                Maitri
              </span>
              <span className="text-[10px] text-muted-foreground truncate sm:hidden">
                {t(agentNameKey)}
              </span>
              <span className="text-[10px] font-mono tracking-wide text-muted-foreground uppercase truncate hidden sm:inline">
                {t(agentSubtitleKey)}
              </span>
            </div>
          </div>
          <span className="text-muted-foreground/30 hidden sm:inline">·</span>
          <span className="text-[13px] text-muted-foreground truncate hidden sm:inline">
            {t(agentNameKey)}
          </span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {alert && alertPerson ? (
            <Link
              to="/connections"
              search={{ open: alert.personId }}
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
          <Link
            to="/wishes"
            aria-label={t("tabs.wishes")}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Sparkles className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">{t("tabs.wishes")}</span>
          </Link>
          <SavedTrigger variant="compact" />
          <HistoryTrigger variant="compact" />

          {onReset && (
            <button
              type="button"
              onClick={onReset}
              aria-label={t("header.reset")}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Plus className="w-4 h-4 sm:w-3 sm:h-3" />
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
