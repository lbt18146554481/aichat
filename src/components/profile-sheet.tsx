// Profile editor as a right-side sheet. Renders the same ProfileForm as the
// dedicated /profile route; all fields save-on-change to localStorage, so
// closing the sheet at any point never loses work.

import { useTranslation } from "react-i18next";
import type { Lang } from "@/lib/i18n";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ProfileForm } from "@/components/profile-form";
import { loadProfile, profileProgress } from "@/lib/profile";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
}

export function ProfileSheet({ open, onOpenChange, lang }: Props) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState({ done: 0, total: 3 });

  // Refresh progress badge whenever the sheet opens (form persists continuously).
  useEffect(() => {
    if (open) setProgress(profileProgress(loadProfile()));
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col gap-0"
      >
        <div className="border-b border-border px-6 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 pr-8">
            <SheetTitle className="text-[15px] font-semibold">
              {t("hello.gate.title")}
            </SheetTitle>
            <SheetDescription className="text-[12.5px] leading-relaxed mt-0.5">
              {t("hello.gate.body")}
            </SheetDescription>
          </div>
          <span className="shrink-0 text-[11px] font-mono uppercase tracking-wide text-muted-foreground tabular-nums">
            {t("profile.progress", { done: progress.done, total: progress.total })}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <ProfileForm lang={lang} compact />
        </div>
        <div className="border-t border-border px-6 py-3 flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11.5px] text-muted-foreground leading-snug">
            {t("profile.autosave_hint")}
          </p>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-1.5 rounded-md bg-foreground text-background text-[12.5px] font-medium hover:opacity-90 transition-opacity"
          >
            {t("profile.done_generic")}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
