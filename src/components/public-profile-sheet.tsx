import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { avatarUrl, isAiSeedPerson, localized } from "@/lib/people";
import { normalizeLang } from "@/lib/lang";
import { ReportMenu } from "@/components/report-menu";
import type { Person } from "@/lib/types";
import { AiPersonaBadge } from "@/components/ai-persona-badge";
import { PersonPublicDetail } from "@/components/person-public-detail";
import { ProfileSafetyFooter } from "@/components/profile-safety-footer";

interface Props {
  person: Person | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Show report / mute / delete / blacklist at the bottom (e.g. from a live chat). */
  connectionActions?: {
    personId: string;
    onActionComplete?: () => void;
  };
}

export function PublicProfileSheet({ person, open, onOpenChange, connectionActions }: Props) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.resolvedLanguage);
  if (!person) return null;
  const loc = localized(person, lang);
  const showConnectionFooter = Boolean(connectionActions);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between gap-3">
            <SheetTitle className="text-[13px] font-mono uppercase tracking-[0.18em] text-muted-foreground font-normal">
              {t("intro.public_profile_title")}
            </SheetTitle>
            {!showConnectionFooter && <ReportMenu personId={person.id} align="end" />}
          </div>
        </SheetHeader>

        <div className="mt-4 flex items-start gap-4">
          <img
            src={avatarUrl(person.id)}
            alt={loc.name}
            className="w-20 h-20 rounded-full border border-border bg-secondary shrink-0"
          />
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-[20px] font-semibold tracking-tight text-foreground">
                {loc.name}
              </h2>
              {isAiSeedPerson(person.id) && <AiPersonaBadge />}
              <span className="text-[12px] font-mono text-muted-foreground tabular-nums">
                {person.age}
              </span>
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {loc.occupation} · {loc.city}
            </p>
            {isAiSeedPerson(person.id) && (
              <p className="mt-2 text-[12px] text-muted-foreground leading-relaxed">
                {t("persona.ai_card_note")}
              </p>
            )}
          </div>
        </div>

        <PersonPublicDetail person={person} lang={lang} />

        {showConnectionFooter && connectionActions && (
          <ProfileSafetyFooter
            personId={connectionActions.personId}
            onActionComplete={() => {
              connectionActions.onActionComplete?.();
              onOpenChange(false);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
