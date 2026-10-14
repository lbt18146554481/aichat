import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/data/hooks";
import { resolveUserDisplayName } from "@/lib/profile";

/**
 * Header-right account affordance. One click opens the profile page.
 * Signed-out visitors go through sign-in first, then land on the profile.
 */
export function AccountMenu() {
  const { t } = useTranslation();
  const { user, hydrated } = useAuth();
  const { data: profile } = useProfile();

  if (!hydrated) return <span className="w-8 h-8 shrink-0" />;

  if (!user) {
    return (
      <Link
        to="/auth"
        search={{ mode: "signin", redirect: "/profile" }}
        aria-label={t("auth.your_profile")}
        className="inline-flex shrink-0 items-center justify-center w-8 h-8 rounded-full border border-border bg-card text-foreground"
      >
        <UserRound className="w-4 h-4" />
      </Link>
    );
  }

  const displayName = resolveUserDisplayName(profile, user);
  const displayAvatar = profile?.avatar || user.avatar || "";
  const initial = (displayName || user.email || "?").charAt(0).toUpperCase();

  return (
    <Link
      to="/profile"
      aria-label={t("auth.your_profile")}
      className="inline-flex shrink-0 items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-[14px] font-semibold overflow-hidden"
    >
      {displayAvatar ? (
        <img src={displayAvatar} alt="" className="w-8 h-8 object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </Link>
  );
}
