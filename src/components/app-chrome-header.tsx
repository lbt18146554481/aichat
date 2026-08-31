import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";
import { LangSwitcher } from "./lang-switcher";
import { HistoryTrigger } from "./history-trigger";
import { SavedTrigger } from "./saved-trigger";
import { AccountMenu } from "./account-menu";
import { hasUnseen, rehydrate, subscribe } from "@/lib/connections";
import { useAuth } from "@/lib/auth";

/**
 * Shared top chrome for Home + agent Workspace — same brand header so
 * handoff into a sub-agent doesn't feel like entering another app.
 */
export function AppChromeHeader() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    rehydrate();
    const update = () => setUnseen(hasUnseen());
    update();
    return subscribe(update);
  }, []);

  return (
    <>
      <header className="hidden md:block w-full border-b border-border/60 shrink-0">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="relative inline-flex">
              <span className="w-6 h-6 rounded-md bg-primary text-primary-foreground grid place-items-center font-mono text-[11px] font-bold">
                K
              </span>
              {mounted && user && unseen && (
                <span
                  aria-label={t("home.connections")}
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background"
                />
              )}
            </span>
            <span className="text-[14px] font-semibold tracking-tight text-foreground">Maitri</span>
          </div>
          <div className="flex items-center gap-3">
            {mounted && user && (
              <Link
                to="/connections"
                className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <MessageCircle
                  className={`w-3.5 h-3.5 ${unseen ? "text-red-500" : ""}`}
                  strokeWidth={1.75}
                />
                <span suppressHydrationWarning>{mounted ? t("home.connections") : ""}</span>
                {unseen && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-medium leading-[16px] text-center ring-2 ring-background">
                    •
                  </span>
                )}
              </Link>
            )}
            {mounted && user && <SavedTrigger />}
            {mounted && user && <HistoryTrigger />}
            <LangSwitcher />
            {mounted && <AccountMenu />}
          </div>
        </div>
      </header>

      <div className="md:hidden pt-safe shrink-0">
        <div className="px-5 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative inline-flex">
              <span className="w-6 h-6 rounded-md bg-primary text-primary-foreground grid place-items-center font-mono text-[11px] font-bold">
                K
              </span>
              {mounted && user && unseen && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background" />
              )}
            </span>
            <span className="text-[13.5px] font-semibold tracking-tight text-foreground">Maitri</span>
          </div>
          <div className="flex items-center gap-1">
            {mounted && user && <SavedTrigger variant="compact" />}
            <LangSwitcher />
          </div>
        </div>
      </div>
    </>
  );
}
