import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { LangSwitcher } from "@/components/lang-switcher";

interface Search { type?: string }

export const Route = createFileRoute("/reset-password")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    type: typeof raw.type === "string" ? raw.type : undefined,
  }),
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Reset password — Kindred" },
      { name: "description", content: "Reset your Kindred password." },
    ],
  }),
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const search = useSearch({ from: "/reset-password" });
  const isRecovery = search.type === "recovery";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  function requestLink(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    toast.success(t("auth.reset.link_sent", { email }));
    setEmail("");
  }
  function updatePassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error(t("auth.reset.password_short")); return; }
    if (password !== confirm) { toast.error(t("auth.reset.mismatch")); return; }
    toast.success(t("auth.reset.updated"));
    setPassword(""); setConfirm("");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/auth" search={{ mode: "signin" }} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-mono uppercase tracking-wide">{t("auth.reset.back")}</span>
          </Link>
          <LangSwitcher />
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <h1 className="text-[22px] font-serif italic leading-tight text-foreground">
            {isRecovery ? t("auth.reset.title_new") : t("auth.reset.title_request")}
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
            {isRecovery ? t("auth.reset.sub_new") : t("auth.reset.sub_request")}
          </p>

          {isRecovery ? (
            <form onSubmit={updatePassword} className="mt-6 space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.reset.new_password")}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-[14px] outline-none focus:border-foreground/50"
              />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t("auth.reset.confirm_password")}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-[14px] outline-none focus:border-foreground/50"
              />
              <button className="w-full rounded-md bg-foreground text-background px-3 py-2 text-[13px] font-medium hover:opacity-90">
                {t("auth.reset.update_cta")}
              </button>
            </form>
          ) : (
            <form onSubmit={requestLink} className="mt-6 space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.email_placeholder")}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-[14px] outline-none focus:border-foreground/50"
              />
              <button className="w-full rounded-md bg-foreground text-background px-3 py-2 text-[13px] font-medium hover:opacity-90">
                {t("auth.reset.send_cta")}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
