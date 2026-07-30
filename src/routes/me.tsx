// Mobile "Me" hub — the phone equivalent of the desktop account menu.
//
// Desktop users get Profile / Invites / Sign out from the avatar dropdown;
// on phones the tab bar's "Me" tab lands here and offers the same entries
// (plus Saved, which has no other phone entry point), each opening its own
// detail surface rather than dumping the whole profile form on the user.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Bookmark, ChevronRight, Copy, LogOut, Ticket, UserCircle } from "lucide-react";
import { signOut, useAuth } from "@/lib/auth";
import { useRequireAuth } from "@/lib/auth-guard";
import { loadProfile } from "@/lib/profile";
import { LangSwitcher } from "@/components/lang-switcher";
import { Skeleton } from "@/components/ui/skeleton";
import { SavedTrigger } from "@/components/saved-trigger";
import { generateInvite, listMyCodes, remainingInvites, type InviteCode } from "@/lib/invites";

export const Route = createFileRoute("/me")({
  component: MePage,
  head: () => ({
    meta: [
      { title: "You — Maitri" },
      { name: "description", content: "Your profile, saved people, invites and account on Maitri." },
      { property: "og:title", content: "You — Maitri" },
      { property: "og:description", content: "Your profile, saved people, invites and account on Maitri." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function MePage() {
  const { ready } = useRequireAuth();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [savedOpen, setSavedOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [profile, setProfile] = useState<ReturnType<typeof loadProfile> | null>(null);

  useEffect(() => {
    if (!ready) return;
    setProfile(loadProfile());
  }, [ready]);

  useEffect(() => {
    if (!user) return;
    setCodes(listMyCodes(user.id));
    setRemaining(remainingInvites(user.id));
  }, [user, invitesOpen]);

  if (!ready) {
    return (
      <div className="min-h-dvh bg-background pt-safe pb-tabbar" data-testid="me-loading" aria-busy="true">
        <div className="max-w-2xl mx-auto px-5 h-12 flex items-center">
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">
          <div className="flex items-center gap-3">
            <Skeleton className="w-14 h-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <Skeleton className="h-[160px] w-full rounded-2xl" />
          <Skeleton className="h-[52px] w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const displayName = (profile?.name && profile.name.trim()) || user?.name || user?.email || "";
  const avatar = profile?.avatar || user?.avatar || "";

  function onGenerate() {
    if (!user) return;
    const code = generateInvite(user.id);
    if (!code) {
      toast(t("auth.invites.no_more"));
      return;
    }
    setCodes(listMyCodes(user.id));
    setRemaining(remainingInvites(user.id));
    void navigator.clipboard.writeText(code.code).catch(() => {});
    toast.success(t("auth.invites.generated", { code: code.code }));
  }

  function onCopy(code: string) {
    void navigator.clipboard.writeText(code).catch(() => {});
    toast.success(t("auth.invites.copied"));
  }

  return (
    <div className="min-h-dvh bg-background pt-safe pb-tabbar">
      <header className="border-b border-border bg-background/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-5 h-12 flex items-center justify-between">
          <span className="text-[15px] font-semibold tracking-tight text-foreground">{t("me.title")}</span>
          <LangSwitcher />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-6 space-y-6">
        <div className="flex items-center gap-3">
          {avatar ? (
            <img src={avatar} alt="" className="w-14 h-14 rounded-full object-cover border border-border" />
          ) : (
            <span className="w-14 h-14 rounded-full bg-primary text-primary-foreground grid place-items-center text-[18px] font-semibold">
              {(displayName || "?").charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <div className="text-[16px] font-semibold text-foreground truncate">{displayName}</div>
            <div className="text-[12px] text-muted-foreground truncate">{user?.email}</div>
          </div>
        </div>

        <ul className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
          <li>
            <Link to="/profile" className="flex items-center gap-3 px-4 py-3.5 min-h-[52px] active:bg-secondary">
              <UserCircle className="w-[18px] h-[18px] text-muted-foreground shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] text-foreground">{t("me.profile")}</span>
                <span className="block text-[11.5px] text-muted-foreground truncate">{t("me.profile_sub")}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setSavedOpen(true)}
              className="w-full text-left flex items-center gap-3 px-4 py-3.5 min-h-[52px] active:bg-secondary"
            >
              <Bookmark className="w-[18px] h-[18px] text-muted-foreground shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] text-foreground">{t("me.saved")}</span>
                <span className="block text-[11.5px] text-muted-foreground truncate">{t("me.saved_sub")}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setInvitesOpen((v) => !v)}
              className="w-full text-left flex items-center gap-3 px-4 py-3.5 min-h-[52px] active:bg-secondary"
            >
              <Ticket className="w-[18px] h-[18px] text-muted-foreground shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] text-foreground">{t("me.invites")}</span>
                <span className="block text-[11.5px] text-muted-foreground truncate">{t("me.invites_sub")}</span>
              </span>
              <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                {t("auth.invites.remaining", { n: remaining })}
              </span>
            </button>
            {invitesOpen && (
              <div className="px-4 pb-4">
                <button
                  onClick={onGenerate}
                  disabled={remaining <= 0}
                  className="w-full rounded-lg bg-primary text-primary-foreground px-3 py-2.5 text-[13px] font-medium disabled:opacity-40"
                >
                  {t("auth.invites.generate")}
                </button>
                {codes.length === 0 && (
                  <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                    {t("me.invites_empty")}
                  </p>
                )}
                {codes.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {codes.map((c) => (
                      <li key={c.code} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 px-3 py-2">
                        <code className={["text-[12.5px] font-mono tracking-wider", c.usedBy ? "text-muted-foreground line-through" : "text-foreground"].join(" ")}>
                          {c.code}
                        </code>
                        {c.usedBy ? (
                          <span className="text-[10px] font-mono uppercase text-muted-foreground">{t("auth.invites.used")}</span>
                        ) : (
                          <button
                            onClick={() => onCopy(c.code)}
                            className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground min-h-[32px]"
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
            )}
          </li>
        </ul>

        <button
          type="button"
          onClick={() => { signOut(); void navigate({ to: "/" }); }}
          className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 min-h-[52px] flex items-center gap-3 text-[14px] text-foreground active:bg-secondary"
        >
          <LogOut className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
          {t("me.signout")}
        </button>
      </main>

      <SavedTrigger hideTrigger open={savedOpen} onOpenChange={setSavedOpen} />
    </div>
  );
}
