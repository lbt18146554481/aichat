import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy — Maitri" },
      { name: "description", content: "How Maitri collects, uses, and deletes your data." },
    ],
  }),
});

function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-background pt-safe pb-safe">
      <header className="border-b border-border bg-background/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-mono uppercase tracking-wide">Maitri</span>
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-5 py-8 space-y-8">
        <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
          {t("privacy.title")}
        </h1>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">{t("privacy.who_we_are")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground whitespace-pre-line">
            {t("privacy.who_body")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">{t("privacy.what_collect")}</h2>
          <ul className="list-disc pl-5 text-[13px] leading-relaxed text-muted-foreground space-y-1">
            <li>{t("privacy.collect_identity")}</li>
            <li>{t("privacy.collect_profile")}</li>
            <li>{t("privacy.collect_content")}</li>
            <li>{t("privacy.collect_tech")}</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">{t("privacy.how_use")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{t("privacy.use_body")}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">{t("privacy.delete")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("privacy.delete_body")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">{t("privacy.contact")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("privacy.contact_body")}
          </p>
        </section>

        <p className="text-[11px] text-muted-foreground/70 pt-4 border-t border-border">
          {t("privacy.last_updated")}
        </p>
      </main>
    </div>
  );
}
