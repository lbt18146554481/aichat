import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { IrisHeader } from "@/components/iris-header";
import { avatarUrl, getPersonById } from "@/lib/people";

export const Route = createFileRoute("/people/$id")({
  loader: ({ params }) => {
    const person = getPersonById(params.id);
    if (!person) throw notFound();
    return { person };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.person.name} — Iris` : "Iris" },
      {
        name: "description",
        content: loaderData?.person.portrait ?? "Iris 介绍的人。",
      },
    ],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col">
      <IrisHeader />
      <div className="flex-1 grid place-items-center px-6 py-20 text-center">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">没找到这个人。</h1>
          <Link
            to="/"
            className="mt-6 inline-flex px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium"
          >
            回到 Iris
          </Link>
        </div>
      </div>
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen flex flex-col">
      <IrisHeader />
      <div className="flex-1 grid place-items-center px-6 py-20 text-center">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">出错了。</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
          <button
            onClick={reset}
            className="mt-6 px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium"
          >
            再试一次
          </button>
        </div>
      </div>
    </div>
  ),
  component: PersonPage,
});

function PersonPage() {
  const { person } = Route.useLoaderData();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <IrisHeader />
      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-5 py-8 md:py-12">
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← 回到 Iris
          </Link>

          <div className="mt-6 flex flex-col sm:flex-row gap-5 items-start">
            <img
              src={avatarUrl(person.name)}
              alt=""
              className="w-20 h-20 rounded-full border border-border bg-secondary shrink-0"
            />
            <div>
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                {person.occupation}
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
                {person.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {person.age} · {person.city}
              </p>
            </div>
          </div>

          <p className="mt-8 text-[16px] text-foreground leading-[1.8]">
            {person.portrait}
          </p>

          <div className="mt-10 pt-6 border-t border-border">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-2.5 font-medium">
              TA 在意的
            </div>
            <div className="flex flex-wrap gap-1.5">
              {person.signals.map((s: string) => (
                <span
                  key={s}
                  className="px-2.5 py-1 rounded-full bg-secondary text-foreground text-xs font-medium border border-border"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-10">
            <Link
              to="/"
              className="inline-flex px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90"
            >
              回到 Iris，继续聊
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
