import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AppHeader } from "@/components/app-header";
import type { Lang } from "@/lib/i18n";
import { avatarUrl, getPersonById, localized } from "@/lib/people";

export const Route = createFileRoute("/profile/$id")({
  loader: ({ params }) => {
    const person = getPersonById(params.id);
    if (!person) throw notFound();
    return { person };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.person.name} — Kindred` },
          { name: "description", content: loaderData.person.portrait },
        ]
      : [{ title: "Kindred" }],
  }),
  notFoundComponent: NotFoundView,
  errorComponent: ErrorView,
  component: ProfilePage,
});

function ProfilePage() {
  const { person } = Route.useLoaderData();
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const L = localized(person, lang);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader savedCount={0} onOpenSaved={() => {}} />
      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-5 py-8 md:py-12">
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground font-mono"
          >
            ← {t("profile.back")}
          </Link>

          <div className="mt-6 flex flex-col sm:flex-row gap-5 items-start">
            <img
              src={avatarUrl(person.id)}
              alt=""
              className="w-20 h-20 rounded-full border border-border bg-secondary shrink-0"
            />
            <div>
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-mono">
                {L.occupation}
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
                {L.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground font-mono">
                {person.age} · {L.city}
              </p>
            </div>
          </div>

          <p className="mt-8 text-[16px] text-foreground leading-[1.8]">
            {L.portrait}
          </p>

          <div className="mt-10 pt-6 border-t border-border">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-2.5 font-mono">
              {t("profile.traits")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {person.signals.map((s: string) => (
                <span
                  key={s}
                  className="px-2.5 py-1 rounded-md bg-secondary text-foreground text-xs font-mono border border-border"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function NotFoundView() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader savedCount={0} onOpenSaved={() => {}} />
      <div className="flex-1 grid place-items-center px-6 py-20 text-center">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("notfound.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("notfound.body")}</p>
          <Link
            to="/"
            className="mt-6 inline-flex px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium"
          >
            {t("notfound.home")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorView({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader savedCount={0} onOpenSaved={() => {}} />
      <div className="flex-1 grid place-items-center px-6 py-20 text-center">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Error</h1>
          <p className="mt-2 text-sm text-muted-foreground font-mono">{error.message}</p>
          <button
            onClick={reset}
            className="mt-6 px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
