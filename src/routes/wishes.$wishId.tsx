import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { useRequireAuth } from "@/lib/auth-guard";
import { useMyIntents } from "@/data/hooks";
import { LangSwitcher } from "@/components/lang-switcher";
import { Skeleton } from "@/components/ui/skeleton";
import { WishDetailPreview } from "@/components/wish-detail-preview";
import { WishPublishForm, parseWishPublishFormValue } from "@/components/wish-publish-form";
import { intentToWishDraft, replaceMyIntent } from "@/lib/wish-intent-edit";
import { getIntentById } from "@/lib/intents";
import { loadProfile } from "@/lib/profile";

export const Route = createFileRoute("/wishes/$wishId")({
  component: WishDetailPage,
  head: () => ({
    meta: [
      { title: "Wish detail — Maitri" },
      { name: "description", content: "View and edit your published wish." },
    ],
  }),
});

function WishDetailPage() {
  const { wishId } = Route.useParams();
  const { ready } = useRequireAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const { data: wishes = [], isFetched } = useMyIntents(ready);
  const intent = wishes.find((w) => w.id === wishId) ?? getIntentById(wishId);
  const [editing, setEditing] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleBack() {
    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }
    void navigate({ to: "/wishes" });
  }

  function handleSave(raw: string | null) {
    if (!raw || !intent) {
      setEditing(false);
      return;
    }
    const payload = parseWishPublishFormValue(raw);
    if (!payload) return;
    setSaving(true);
    const profile = loadProfile();
    replaceMyIntent(intent.id, payload.draft, profile);
    setSaving(false);
    setEditing(false);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2500);
  }

  if (!ready || !isFetched) {
    return (
      <div className="min-h-dvh bg-background pt-safe">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!intent) {
    return (
      <div className="min-h-dvh bg-background flex flex-col pb-tabbar lg:pb-0">
        <header className="w-full border-b border-border bg-background/90 backdrop-blur sticky top-0 z-30 pt-safe">
          <div className="max-w-2xl mx-auto px-4 md:px-5 h-14 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="font-mono uppercase tracking-wide">{t("nav.back")}</span>
            </button>
            <div className="text-[13.5px] font-semibold tracking-tight">{t("wishes.detail_title")}</div>
            <LangSwitcher />
          </div>
        </header>
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-12 text-center">
          <p className="text-[13px] text-muted-foreground">{t("wishes.not_found")}</p>
        </main>
      </div>
    );
  }

  const draft = intentToWishDraft(intent);
  const profileCity = loadProfile().city?.trim() || "";

  return (
    <div className="min-h-dvh bg-background flex flex-col pb-tabbar lg:pb-0">
      <header className="w-full border-b border-border bg-background/90 backdrop-blur sticky top-0 z-30 pt-safe">
        <div className="max-w-2xl mx-auto px-4 md:px-5 h-14 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label={t("nav.back")}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-mono uppercase tracking-wide">{t("nav.back")}</span>
          </button>
          <div className="text-[13.5px] font-semibold tracking-tight">{t("wishes.detail_title")}</div>
          <LangSwitcher />
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 md:px-5 py-5 space-y-5">
        {savedFlash && (
          <p className="text-center text-[12px] text-emerald-600 dark:text-emerald-400">
            {t("wishes.saved")}
          </p>
        )}

        {!editing ? (
          <>
            <WishDetailPreview intent={intent} />
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="w-full min-h-11 rounded-lg border border-border bg-card text-[13px] font-medium text-foreground hover:bg-secondary/60 transition-colors"
            >
              {t("wishes.edit")}
            </button>
          </>
        ) : (
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground mb-4">
              {t("wishes.edit_section")}
            </div>
            <WishPublishForm
              variant="canvas"
              draft={draft}
              profileCity={profileCity}
              confirmLabel={t("wishes.save")}
              cancelLabel={t("wishes.cancel_edit")}
              disabled={saving}
              onResolve={handleSave}
            />
          </div>
        )}
      </main>
    </div>
  );
}
