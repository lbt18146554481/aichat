// SavedTrigger — global header entry for "Saved for later".
//
// Two sections in one drawer:
//   · People — parked from Introduce someone (Matchmaker). Reopening jumps
//     back to that person's matchmaker session and focuses their card so
//     the user can Say hello.
//   · Wishes — saved candidates from Side by Side.
// Hidden entirely when both lists are empty.

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Bookmark, BookmarkCheck, MessageCircle, UserRound, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useSavedBootstrap, useSavedPeople, useSavedWishes } from "@/data/hooks";
import { getIntentById, type Intent } from "@/lib/intents";
import { pickLocaleText, normalizeLang } from "@/lib/lang";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import { removeSaved, type SavedRecord } from "@/lib/saved-intents";
import { openSavedPersonTarget, removeSavedPerson, type SavedPersonRecord } from "@/lib/saved-people";
import { getSession } from "@/lib/sessions";
import { setFocusPerson } from "@/lib/seed";

interface Props {
  variant?: "default" | "compact";
  /** Controlled open state — lets other surfaces (e.g. the mobile Me page)
   *  reuse the same drawer without rendering the header pill. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function SavedTrigger({
  variant = "default",
  open: openProp,
  onOpenChange,
  hideTrigger,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.resolvedLanguage);
  useSavedBootstrap();
  const { data: saved = [] } = useSavedWishes();
  const { data: people = [] } = useSavedPeople();
  const [hydrated, setHydrated] = useState(false);
  const navigate = useNavigate();
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? !!openProp : openState;
  const setOpen = (v: boolean) => {
    if (!controlled) setOpenState(v);
    onOpenChange?.(v);
  };
  useEffect(() => {
    setHydrated(true);
  }, []);
  const count = saved.length + people.length;

  if (count === 0 && !controlled) return null;

  const btnClass =
    variant === "compact"
      ? "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      : "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-foreground/80 hover:text-foreground hover:bg-secondary transition-colors";

  function handleOpenChat(rec: SavedRecord) {
    setOpen(false);
    void navigate({
      to: "/side-by-side",
      search: { session: rec.sessionId, chatWith: rec.intentId },
    });
  }

  function handleOpenPerson(rec: SavedPersonRecord) {
    const target = openSavedPersonTarget(rec);
    if (!target) return;
    setOpen(false);
    setFocusPerson(target.personId);
    void navigate({
      to: "/matchmaker",
      search: { session: target.sessionId, focus: target.personId },
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <button
          type="button"
          className={btnClass}
          aria-label={t("saved.header_aria")}
          onClick={() => setOpen(true)}
        >
          <BookmarkCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>{t("saved.header", { count })}</span>
        </button>
      )}
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-3 border-b border-border">
          <SheetTitle className="text-[16px] font-semibold tracking-tight text-foreground text-left">
            {t("saved.title")}
          </SheetTitle>
        </SheetHeader>
        <Tabs
          defaultValue={people.length > 0 || saved.length === 0 ? "people" : "wishes"}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="px-6 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="people" className="flex-1">
                {t("saved.section_people")} · {people.length}
              </TabsTrigger>
              <TabsTrigger value="wishes" className="flex-1">
                {t("saved.section_wishes")} · {saved.length}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="people" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
            {!hydrated ? (
              <ul className="space-y-3" data-testid="saved-loading" aria-busy="true">
                {[0, 1].map((i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-border bg-card p-4 flex items-center gap-3"
                  >
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-36" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : people.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Bookmark className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="text-[13px]">{t("saved.people_empty")}</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {people.map((rec) => {
                  const person = getPersonById(rec.personId);
                  if (!person) return null;
                  const loc = localized(person, lang);
                  return (
                    <li key={rec.personId} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={avatarUrl(person.id)}
                          alt=""
                          className="w-10 h-10 rounded-full border border-border"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-medium text-foreground truncate">
                            {loc.name}
                            <span className="text-muted-foreground font-normal">
                              , {person.age}
                            </span>
                          </div>
                          <div className="text-[11.5px] text-muted-foreground truncate">
                            {loc.occupation} · {loc.city}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenPerson(rec)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium hover:opacity-90 transition-opacity"
                        >
                          <UserRound className="w-3 h-3" />
                          {t("saved.open_person")}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSavedPerson(rec.personId)}
                          aria-label={t("saved.remove")}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-[12.5px] text-foreground/85 hover:bg-secondary transition-colors"
                        >
                          <X className="w-3 h-3" />
                          {t("saved.remove")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="wishes" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
            {!hydrated ? (
              <ul className="space-y-3" data-testid="saved-loading" aria-busy="true">
                {[0, 1].map((i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-border bg-card p-4 flex items-center gap-3"
                  >
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-36" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : saved.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Bookmark className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="text-[13px]">{t("saved.wishes_empty")}</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {saved.map((rec) => {
                  const intent = getIntentById(rec.intentId) as Intent | null;
                  if (!intent) return null;
                  const person = getPersonById(intent.ownerId);
                  const name = pickLocaleText(lang, intent.ownerName, intent.ownerName_zh);
                  const city = pickLocaleText(lang, intent.ownerCity, intent.ownerCity_zh);
                  const occ = person
                    ? pickLocaleText(lang, person.occupation, person.occupation_zh)
                    : "";
                  const meta = [city, occ].filter((s) => s && s.trim()).join(" · ");
                  const raw = pickLocaleText(lang, intent.rawText, intent.rawText_zh);
                  const session = getSession(rec.sessionId);
                  const wishSummary = session?.seed ?? "";

                  return (
                    <li key={rec.intentId} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={avatarUrl(intent.ownerId)}
                          alt=""
                          className="w-10 h-10 rounded-full border border-border"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-medium text-foreground truncate">
                            {name}
                            {person?.age ? (
                              <span className="text-muted-foreground font-normal">
                                , {person.age}
                              </span>
                            ) : null}
                          </div>
                          {meta && (
                            <div className="text-[11.5px] text-muted-foreground truncate">
                              {meta}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 text-[12.5px] text-foreground/85 leading-relaxed line-clamp-3">
                        "{raw}"
                      </p>
                      {wishSummary && (
                        <p className="mt-1.5 text-[11px] text-muted-foreground truncate">
                          {t("saved.from_wish")}: {wishSummary}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => handleOpenChat(rec)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium hover:opacity-90 transition-opacity"
                        >
                          <MessageCircle className="w-3 h-3" />
                          {t("saved.start_chat")}
                        </button>
                        <button
                          onClick={() => removeSaved(rec.intentId)}
                          aria-label={t("saved.remove")}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-[12.5px] text-foreground/85 hover:bg-secondary transition-colors"
                        >
                          <X className="w-3 h-3" />
                          {t("saved.remove")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/** Hook: subscribe to whether a given intent is currently saved. */
export function useIsSaved(intentId: string | null | undefined): boolean {
  const { data: saved = [] } = useSavedWishes();
  if (!intentId) return false;
  return saved.some((r) => r.intentId === intentId);
}
