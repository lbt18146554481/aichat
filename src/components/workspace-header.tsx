import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, MessageCircle, RotateCcw, UserCircle } from "lucide-react";
import { LangSwitcher } from "./lang-switcher";
import { HistoryTrigger } from "./history-trigger";
import { SavedTrigger } from "./saved-trigger";
import { AccountMenu } from "./account-menu";
import { hasUnseen, list, subscribe, type Connection } from "@/lib/connections";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
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
  const [connCount, setConnCount] = useState(0);
  const [unseen, setUnseen] = useState(false);
  const [alert, setAlert] = useState<Connection | null>(null);

  useEffect(() => {
    const update = () => {
      const items = list();
      setConnCount(items.length);
      setUnseen(hasUnseen());
      setAlert(pickAlert(items));
    };
    update();
    const unsub = subscribe(update);
    // Poll every 3s to catch background scheduleResolution flips while the
    // user is still on this page.
    const iv = window.setInterval(update, 3000);
    return () => { unsub(); window.clearInterval(iv); };
  }, []);

  const alertPerson = alert ? getPersonById(alert.personId) : null;
  const alertName = alertPerson ? localized(alertPerson, lang).name : "";

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
          {alert && alertPerson ? (
            <Link
              to="/connections"
              aria-label={
                alert.status === "connected"
                  ? t("notify.replied", { name: alertName })
                  : t("notify.new_hello", { name: alertName })
              }
              className="relative inline-flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-border bg-card hover:bg-secondary transition-colors"
            >
              <span className="relative">
                <img
                  src={avatarUrl(alertPerson.id)}
                  alt=""
                  className="w-6 h-6 rounded-full border border-border bg-secondary"
                />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background" />
              </span>
              <span className="text-[11.5px] text-foreground max-w-[9rem] truncate">
                {alert.status === "connected"
                  ? t("notify.replied", { name: alertName })
                  : t("notify.new_hello", { name: alertName })}
              </span>
            </Link>
          ) : connCount > 0 ? (
            <Link
              to="/connections"
              className="relative inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>{t("header.connections")}</span>
              {unseen && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />}
            </Link>
          ) : null}
          <SavedTrigger variant="compact" />
          <HistoryTrigger variant="compact" />
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
          <AccountMenu compact />
        </div>
      </div>
    </header>
  );
}
