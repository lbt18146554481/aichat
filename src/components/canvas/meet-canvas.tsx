import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowUp, MessageCircle, Pencil, SkipForward, Users, X, Undo2 } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { SideState, ChatMsg, LevelTier, WhenTier } from "@/lib/agents/side-by-side";
import { currentView } from "@/lib/agents/side-by-side";
import { countAvailableMatches, getIntentById, type Intent } from "@/lib/intents";
import type { ActivityKind } from "@/lib/types";
import { avatarUrl } from "@/lib/people";

interface Props {
  state: SideState;
  onStartChat: () => void;
  onRevoke: () => void;
  onTryNearMiss: (intentId: string) => void;
  onSendChat: (text: string) => void;
  onEditWish: (patch: { when?: WhenTier; level?: LevelTier; location?: string }) => void;
  onSkip: () => void;
  onRevokeReshare: () => void;
}



const KIND_EMOJI: Record<ActivityKind, string> = {
  tennis: "🎾", run: "🏃", climb: "🧗", cook: "🍳", exhibition: "🖼", bookstore: "📚", other: "✨",
};

export function MeetCanvas(props: Props) {
  const view = currentView(props.state);
  if (view === "chat") return <ChatView {...props} />;
  if (view === "match") return <MatchView {...props} />;
  if (view === "nomatch") return <NoMatchView {...props} />;
  return <EmptyCanvas />;
}

// ---- Empty ---------------------------------------------------------------

function EmptyCanvas() {
  const { t } = useTranslation();
  return (
    <div className="h-full grid place-items-center px-8 py-12">
      <div className="max-w-sm text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-secondary border border-border grid place-items-center text-muted-foreground">
          <Users className="w-6 h-6" />
        </div>
        <h2 className="mt-5 text-[18px] font-medium text-foreground leading-snug">
          {t("meet.empty_title")}
        </h2>
        <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
          {t("meet.empty_hint")}
        </p>
      </div>
    </div>
  );
}

// ---- Match — two intent cards side by side + [start chat] --------------

function MatchView({ state, onStartChat, onEditWish }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const [editing, setEditing] = useState(false);
  const mine = state.myIntentId ? getIntentById(state.myIntentId) : null;
  const other = state.matchIntentId ? getIntentById(state.matchIntentId) : null;
  if (!mine || !other) return <EmptyCanvas />;

  const alignedKind = t(`activity.kind.${mine.kind}`);
  const alignedWhen = sharedWhenLabel(mine, other, t);
  const alignedLevel = sharedLevelLabel(mine, other, t);
  const showLevel = mine.kind === "tennis" || mine.kind === "climb";

  return (
    <div className="h-full overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-lg">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
          {t("intent.match_label")}
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <IntentCard intent={mine} side="me" lang={lang} />
          <IntentCard intent={other} side="them" lang={lang} />
        </div>

        <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-emerald-700 dark:text-emerald-400">
            {t("intent.aligned_label")}
          </div>
          <p className="mt-1.5 text-[13px] text-foreground leading-relaxed">
            {t("intent.aligned_body", {
              kind: alignedKind,
              when: alignedWhen,
              level: alignedLevel,
            })}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={onStartChat}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-foreground text-background text-[13.5px] font-medium hover:opacity-90 transition-opacity"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {t("intent.start_chat")}
          </button>
          <button
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-md border border-border text-[13px] text-foreground/85 hover:bg-secondary transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            {editing ? t("intent.edit_close") : t("intent.edit_wish")}
          </button>
        </div>

        {editing && (
          <EditWishPanel
            intent={mine}
            showLevel={showLevel}
            onApply={(patch) => { onEditWish(patch); setEditing(false); }}
          />
        )}

        <p className="mt-4 text-[11.5px] text-muted-foreground leading-relaxed text-center">
          {t("intent.match_footnote")}
        </p>
      </div>
    </div>
  );
}

function EditWishPanel({
  intent,
  showLevel,
  onApply,
}: {
  intent: Intent;
  showLevel: boolean;
  onApply: (patch: { when?: WhenTier; level?: LevelTier; location?: string }) => void;
}) {
  const { t } = useTranslation();
  const currentWhen: WhenTier = intent.whenAny
    ? "any"
    : intent.day === "sat" || intent.day === "sun" ? "weekend"
    : intent.window === "evening" ? "weeknight" : "any";
  const [when, setWhen] = useState<WhenTier>(currentWhen);
  const [level, setLevel] = useState<LevelTier | "any">(intent.levelAny ? "any" : intent.level);
  const [location, setLocation] = useState<string>(intent.location ?? "");

  const whenOptions: WhenTier[] = ["weekend", "weeknight", "any"];
  const levelOptions: (LevelTier | "any")[] = ["beginner", "intermediate", "advanced", "any"];

  function apply() {
    const patch: { when?: WhenTier; level?: LevelTier; location?: string } = {};
    if (when !== currentWhen) patch.when = when;
    if (showLevel) {
      const cur = intent.levelAny ? "any" : intent.level;
      if (level !== cur && level !== "any") patch.level = level as LevelTier;
    }
    if ((intent.location ?? "") !== location) patch.location = location;
    onApply(patch);
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-4 space-y-4">
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
          {t("intent.edit_when")}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {whenOptions.map((w) => (
            <button
              key={w}
              onClick={() => setWhen(w)}
              className={[
                "px-3 py-1 rounded-full text-[12px] border transition-colors",
                when === w
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-secondary text-foreground/80 hover:border-foreground/40",
              ].join(" ")}
            >
              {t(`meet.when.${w}`)}
            </button>
          ))}
        </div>
      </div>

      {showLevel && (
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
            {t("intent.edit_level")}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {levelOptions.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={[
                  "px-3 py-1 rounded-full text-[12px] border transition-colors",
                  level === l
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-secondary text-foreground/80 hover:border-foreground/40",
                ].join(" ")}
              >
                {t(`meet.level.${l}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
          {t("intent.edit_location")}
        </div>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={t("intent.edit_location_placeholder")}
          className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/40"
        />
      </div>

      <button
        onClick={apply}
        className="w-full inline-flex items-center justify-center px-4 py-2 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
      >
        {t("intent.edit_apply")}
      </button>
    </div>
  );
}


function IntentCard({ intent, side, lang }: { intent: Intent; side: "me" | "them"; lang: Lang }) {
  const { t } = useTranslation();
  const raw = lang === "zh-CN" ? intent.rawText_zh : intent.rawText;
  const label = side === "me" ? t("intent.you_said") : t("intent.they_said");
  const nameOrYou = side === "me"
    ? t("intent.your_tag")
    : `${lang === "zh-CN" ? intent.ownerName_zh : intent.ownerName}${(lang === "zh-CN" ? intent.ownerCity_zh : intent.ownerCity) ? " · " + (lang === "zh-CN" ? intent.ownerCity_zh : intent.ownerCity) : ""}`;

  return (
    <article className="rounded-xl border border-border bg-card p-4 flex flex-col">
      <div className="flex items-center gap-2">
        {side === "them" ? (
          <img src={avatarUrl(intent.ownerId)} alt="" className="w-7 h-7 rounded-full border border-border" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-secondary border border-border grid place-items-center text-[11px] font-mono text-muted-foreground">
            {t("intent.you_short")}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">{label}</div>
          <div className="text-[12px] text-foreground/85 truncate">{nameOrYou}</div>
        </div>
      </div>
      <p className="mt-2.5 text-[13px] text-foreground leading-relaxed">"{raw}"</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Tag>{KIND_EMOJI[intent.kind]} {t(`activity.kind.${intent.kind}`)}</Tag>
        {!intent.whenAny && (
          <Tag>{t(`activity.day.${intent.day}`)} {t(`activity.window.${intent.window}`)}</Tag>
        )}
        {!intent.levelAny && (intent.kind === "tennis" || intent.kind === "climb") && (
          <Tag>{t(`activity.level.${intent.level}`)}</Tag>
        )}
        {intent.whenAny && <Tag>{t("meet.when.any")}</Tag>}
        {side === "me" && intent.location && <Tag>📍 {intent.location}</Tag>}

      </div>
    </article>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary border border-border text-[11px] text-foreground/80">
      {children}
    </span>
  );
}

// ---- No match — my published card + near-miss list ---------------------

function NoMatchView({ state, onRevoke, onTryNearMiss }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const mine = state.myIntentId ? getIntentById(state.myIntentId) : null;
  if (!mine) return <EmptyCanvas />;

  const nears = state.nearMissIds.map((id) => getIntentById(id)).filter(Boolean) as Intent[];

  return (
    <div className="h-full overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-lg">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
          {t("intent.published_label")}
        </div>

        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <IntentCard intent={mine} side="me" lang={lang} />
          <button
            onClick={onRevoke}
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Undo2 className="w-3 h-3" />
            {t("intent.revoke")}
          </button>
        </div>

        {nears.length > 0 && (
          <div className="mt-6">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
              {t("intent.near_label")}
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
              {t("intent.near_hint")}
            </p>
            <ul className="mt-3 space-y-2.5">
              {nears.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => onTryNearMiss(n.id)}
                    className="w-full text-left rounded-lg border border-border bg-card p-3.5 hover:border-foreground/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <img src={avatarUrl(n.ownerId)} alt="" className="w-6 h-6 rounded-full border border-border" />
                      <div className="text-[12px] text-foreground/85">
                        {lang === "zh-CN" ? n.ownerName_zh : n.ownerName}
                        {(lang === "zh-CN" ? n.ownerCity_zh : n.ownerCity) && (
                          <span className="text-muted-foreground"> · {lang === "zh-CN" ? n.ownerCity_zh : n.ownerCity}</span>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-[12.5px] text-foreground/85 leading-relaxed">
                      "{lang === "zh-CN" ? n.rawText_zh : n.rawText}"
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Tag>{t(`activity.day.${n.day}`)} {t(`activity.window.${n.window}`)}</Tag>
                      <Tag>{t(`activity.level.${n.level}`)}</Tag>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Chat view (in-canvas) ---------------------------------------------

function ChatView({ state, onSendChat }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const mine = state.myIntentId ? getIntentById(state.myIntentId) : null;
  const other = state.matchIntentId ? getIntentById(state.matchIntentId) : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [state.chatMessages.length]);

  if (!mine || !other) return <EmptyCanvas />;

  function submit() {
    const v = text.trim();
    if (!v) return;
    onSendChat(v);
    setText("");
  }

  const otherName = lang === "zh-CN" ? other.ownerName_zh : other.ownerName;
  const otherCity = lang === "zh-CN" ? other.ownerCity_zh : other.ownerCity;

  return (
    <div className="h-full flex flex-col">
      {/* Slim aligned banner (click to expand full alignment card) */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-left border-b border-border bg-emerald-500/5 px-5 py-2.5 hover:bg-emerald-500/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <img src={avatarUrl(other.ownerId)} alt="" className="w-8 h-8 rounded-full border border-border" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-foreground truncate">{otherName}{otherCity ? ` · ${otherCity}` : ""}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {t("intent.aligned_slim", {
                kind: t(`activity.kind.${mine.kind}`),
                day: t(`activity.day.${mine.day}`),
                window: t(`activity.window.${mine.window}`),
              })}
            </div>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
            {expanded ? t("intent.hide_alignment") : t("intent.show_alignment")}
          </span>
        </div>
        {expanded && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 pointer-events-none">
            <IntentCard intent={mine} side="me" lang={lang} />
            <IntentCard intent={other} side="them" lang={lang} />
          </div>
        )}
      </button>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        <div className="max-w-md mx-auto">
          <ul className="space-y-2.5">
            {state.chatMessages.map((m) => <ChatBubble key={m.id} m={m} />)}
          </ul>
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-background px-4 py-3">
        <div className="max-w-md mx-auto relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={1}
            placeholder={t("intent.chat_placeholder")}
            className="w-full resize-none rounded-xl border border-border bg-card px-4 py-2.5 pr-11 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/30"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            aria-label="Send"
            className="absolute right-2 bottom-1.5 w-8 h-8 grid place-items-center rounded-lg bg-foreground text-background disabled:opacity-25 hover:opacity-90 transition-opacity"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ m }: { m: ChatMsg }) {
  const isMine = m.from === "me";
  return (
    <li className={isMine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "max-w-[80%] px-3.5 py-2 text-[14px] leading-relaxed",
          isMine
            ? "rounded-2xl rounded-br-md bg-foreground text-background"
            : "rounded-2xl rounded-bl-md bg-secondary text-foreground",
        ].join(" ")}
      >
        {m.text}
      </div>
    </li>
  );
}

// ---- Helpers -------------------------------------------------------------

function sharedWhenLabel(a: Intent, b: Intent, t: TFunction): string {
  if (a.day === b.day && a.window === b.window) {
    return `${t(`activity.day.${a.day}`)} ${t(`activity.window.${a.window}`)}`;
  }
  return t(`activity.day.${b.day}`) + " " + t(`activity.window.${b.window}`);
}
function sharedLevelLabel(a: Intent, b: Intent, t: TFunction): string {
  if (a.level === b.level) return t(`activity.level.${a.level}`);
  return t("intent.level_similar");
}

// Silence unused imports for consumers that used to pass X icon here.
export const _KeepX = X;
