import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { SessionList } from "@/components/session-list";

export const Route = createFileRoute("/sessions")({
  component: SessionsPage,
  head: () => ({
    meta: [
      { title: "History — Kindred" },
      { name: "description", content: "Every wish and conversation you've started with Kindred." },
    ],
  }),
});

function SessionsPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="w-full">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[13px] text-foreground/80 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
            {t("nav.home")}
          </Link>
        </div>
      </header>
      <main className="flex-1 px-6 pb-20">
        <div className="w-full max-w-3xl mx-auto">
          <h1 className="text-[22px] sm:text-[26px] font-serif italic text-foreground mb-1">
            {t("sessions.page_title")}
          </h1>
          <p className="text-[13px] text-muted-foreground mb-6">
            {t("sessions.page_subtitle")}
          </p>
          <SessionList />
        </div>
      </main>
    </div>
  );
}
