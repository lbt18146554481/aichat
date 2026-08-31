import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, LogOut, UserCircle, Ticket } from "lucide-react";
import {
  useAuthActions,
  useInviteActions,
  useMyInvites,
  useRemainingInvites,
  useSession,
} from "@/data/hooks";
import { useProfile } from "@/data/hooks";
import type { InviteCode } from "@/lib/invites";

/**
 * Header-right account affordance:
 *  - Signed out: renders a plain "Sign in" link preserving the current path
 *    in `redirect` so the user returns where they were.
 *  - Signed in : renders an avatar dot with a dropdown (Profile / Invites / Sign out).
 */
export function AccountMenu({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { user, hydrated } = useSession();
  const profile = useProfile().data;
  const { data: codes = [] } = useMyInvites(user?.id);
  const { data: remaining = 0 } = useRemainingInvites(user?.id);
  const { generate: generateInvite } = useInviteActions();
  const { signOut } = useAuthActions();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const displayName = (profile?.name && profile.name.trim()) || user?.name || user?.email || "";
  const displayAvatar = profile?.avatar || user?.avatar || "";

  if (!hydrated) return <span className="w-6 h-6" />;

  if (!user) {
    return (
      <Link
        to="/auth"
        search={{
          mode: "signin",
          redirect: location.pathname === "/auth" ? "/" : location.pathname,
        }}
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium text-foreground hover:bg-secondary transition-colors"
      >
        {t("auth.sign_in")}
      </Link>
    );
  }

  const initial = (displayName || user.email).charAt(0).toUpperCase();

  async function onGenerate() {
    if (!user) return;
    const code = await generateInvite(user.id);
    if (!code) {
      toast(t("auth.invites.no_more"));
      return;
    }
    void navigator.clipboard.writeText(code.code).catch(() => {});
    toast.success(t("auth.invites.generated", { code: code.code }));
  }

  function onCopy(code: string) {
    void navigator.clipboard.writeText(code).catch(() => {});
    toast.success(t("auth.invites.copied"));
  }

  async function onSignOut() {
    await signOut();
    setOpen(false);
    void navigate({ to: "/" });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={t("auth.account_menu")}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90"
      >
        {displayAvatar ? (
          <img src={displayAvatar} alt="" className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <span>{initial}</span>
        )}
      </button>

      {open && (
        <div
          className={[
            "absolute right-0 mt-2 rounded-lg border border-border bg-card shadow-lg z-50",
            compact ? "w-64" : "w-72",
          ].join(" ")}
        >
          <div className="px-3 py-3 border-b border-border">
            <div className="text-[13px] font-medium text-foreground truncate">{displayName}</div>
            <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
          </div>

          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-secondary"
          >
            <UserCircle className="w-4 h-4" />
            {t("auth.your_profile")}
          </Link>

          <div className="px-3 py-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px] text-foreground">
                <Ticket className="w-4 h-4" />
                <span>{t("auth.invites.title")}</span>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">
                {t("auth.invites.remaining", { n: remaining })}
              </span>
            </div>
            <button
              onClick={onGenerate}
              disabled={remaining <= 0}
              className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("auth.invites.generate")}
            </button>
            {codes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {codes.slice(0, 5).map((c) => (
                  <li
                    key={c.code}
                    className="flex items-center justify-between gap-2 rounded-md bg-secondary/50 px-2 py-1"
                  >
                    <code
                      className={[
                        "text-[11.5px] font-mono tracking-wider",
                        c.usedBy ? "text-muted-foreground line-through" : "text-foreground",
                      ].join(" ")}
                    >
                      {c.code}
                    </code>
                    {c.usedBy ? (
                      <span className="text-[10px] font-mono uppercase text-muted-foreground">
                        {t("auth.invites.used")}
                      </span>
                    ) : (
                      <button
                        onClick={() => onCopy(c.code)}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        aria-label={t("auth.invites.copy")}
                      >
                        <Copy className="w-3 h-3" />
                        {t("auth.invites.copy")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-secondary border-t border-border"
          >
            <LogOut className="w-4 h-4" />
            {t("auth.sign_out")}
          </button>
        </div>
      )}
    </div>
  );
}
