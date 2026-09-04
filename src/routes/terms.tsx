import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms of Service — Maitri" },
      { name: "description", content: "The terms and conditions for using Maitri." },
    ],
  }),
});

function TermsPage() {
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
          {t("terms.title")}
        </h1>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">{t("terms.acceptance")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("terms.acceptance_body")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">{t("terms.eligibility")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("terms.eligibility_body")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">{t("terms.conduct")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("terms.conduct_body")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">{t("terms.content")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("terms.content_body")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">{t("terms.termination")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("terms.termination_body")}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">{t("terms.contact")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("terms.contact_body")}
          </p>
        </section>

        <p className="text-[11px] text-muted-foreground/70 pt-4 border-t border-border">
          {t("terms.last_updated")}
        </p>
      </main>
    </div>
  );
}
