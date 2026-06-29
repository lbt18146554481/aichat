import { useTranslation } from "react-i18next";
import { ArrowLeft, Archive, Lock } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { LetterStore, LetterThread } from "@/lib/letters";
import { allThreadsSorted, UNLOCK_AFTER_ROUNDTRIPS } from "@/lib/letters";

interface InboxProps {
  store: LetterStore;
  onOpenThread: (personId: string) => void;
  onClose: () => void;
  onArchive: (personId: string) => void;
}

export function InboxPane({ store, onOpenThread, onClose, onArchive }: InboxProps) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const threads = allThreadsSorted(store);

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <button
          onClick={onClose}
          className="w-7 h-7 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="text-[13.5px] font-medium text-foreground">{t("inbox.title")}</div>
        <span className="ml-auto text-[10.5px] font-mono text-muted-foreground uppercase tracking-wide">
          {threads.length} {t("inbox.threads")}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="h-full grid place-items-center px-8 text-center">
            <p className="text-[13px] text-muted-foreground max-w-xs leading-relaxed">{t("inbox.empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {threads.map((th) => (
              <ThreadRow
                key={th.personId}
                thread={th}
                lang={lang}
                onOpen={() => onOpenThread(th.personId)}
                onArchive={() => onArchive(th.personId)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ThreadRow({
  thread, lang, onOpen, onArchive,
}: { thread: LetterThread; lang: Lang; onOpen: () => void; onArchive: () => void }) {
  const { t } = useTranslation();
  const person = getPersonById(thread.personId);
  if (!person) return null;
  const loc = localized(person, lang);
  const last = thread.letters[thread.letters.length - 1];
  const unread = last && last.author === "them" && last.sentAt > thread.lastReadAt;
  const isArchived = thread.status === "archived";

  return (
    <li className="group relative">
      <button
        onClick={onOpen}
        className="w-full text-left px-6 py-4 flex items-start gap-3 hover:bg-secondary/50 transition-colors"
      >
        <img src={avatarUrl(person.id)} alt={loc.name} className="w-9 h-9 rounded-full border border-border shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-medium text-foreground truncate">{loc.name}</span>
            {unread && <span className="w-1.5 h-1.5 rounded-full bg-foreground" />}
            {thread.unlockedChat && (
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground border border-border rounded px-1 py-px">
                {t("inbox.chat_unlocked")}
              </span>
            )}
            {isArchived && (
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                {t("inbox.archived")}
              </span>
            )}
            <span className="ml-auto text-[10.5px] font-mono text-muted-foreground">
              {fmtTime(last?.sentAt ?? thread.startedAt, lang)}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] text-muted-foreground line-clamp-2 leading-relaxed">
            {last?.author === "me" ? `${t("inbox.you_wrote")} ` : ""}
            {last?.body}
          </p>
        </div>
      </button>
      {!isArchived && (
        <button
          onClick={onArchive}
          aria-label="Archive"
          className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 w-7 h-7 grid place-items-center rounded-md hover:bg-background text-muted-foreground hover:text-foreground transition"
        >
          <Archive className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  );
}

interface ThreadProps {
  personId: string;
  store: LetterStore;
  onBack: () => void;
  onReply: () => void;
}

export function LetterThreadView({ personId, store, onBack, onReply }: ThreadProps) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const person = getPersonById(personId);
  const thread = store.threads[personId];
  if (!person || !thread) return null;
  const loc = localized(person, lang);

  const theirReplies = thread.letters.filter((l) => l.author === "them").length;
  const progress = Math.min(theirReplies, UNLOCK_AFTER_ROUNDTRIPS);
  const last = thread.letters[thread.letters.length - 1];
  const waitingOnThem = last?.author === "me";

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-7 h-7 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <img src={avatarUrl(person.id)} alt={loc.name} className="w-8 h-8 rounded-full border border-border" />
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium text-foreground truncate">{loc.name}</div>
          <div className="text-[10.5px] font-mono text-muted-foreground uppercase tracking-wide">
            {progress}/{UNLOCK_AFTER_ROUNDTRIPS} {t("letter.toward_unlock")}
          </div>
        </div>
        {thread.unlockedChat && (
          <span className="ml-auto text-[10.5px] font-mono uppercase tracking-wider text-foreground border border-foreground/40 rounded px-1.5 py-0.5">
            {t("inbox.chat_unlocked")}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {thread.letters.map((l) => (
          <article key={l.id} className={l.author === "me" ? "ml-6" : "mr-6"}>
            <div className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground mb-1.5">
              {l.author === "me" ? t("letter.you") : loc.name} · {fmtTime(l.sentAt, lang)}
            </div>
            <p className={`text-[14px] leading-[1.7] whitespace-pre-wrap rounded-lg px-4 py-3 ${
              l.author === "me"
                ? "bg-secondary text-foreground"
                : "bg-card border border-border text-foreground"
            }`}>
              {l.body}
            </p>
          </article>
        ))}
      </div>

      <div className="border-t border-border px-6 py-3 flex items-center gap-3">
        {thread.unlockedChat ? (
          <p className="text-[12.5px] text-muted-foreground flex items-center gap-1.5">
            <Lock className="w-3 h-3" />
            {t("letter.realtime_hint")}
          </p>
        ) : waitingOnThem ? (
          <p className="text-[12.5px] text-muted-foreground">{t("letter.waiting")}</p>
        ) : (
          <button
            onClick={onReply}
            className="px-3 py-1.5 rounded-md bg-foreground text-background text-[12.5px] hover:opacity-90 transition-opacity"
          >
            {t("letter.write_reply")}
          </button>
        )}
      </div>
    </div>
  );
}

function fmtTime(ts: number, lang: Lang): string {
  const d = new Date(ts);
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return lang === "zh-CN" ? "刚刚" : "just now";
  if (m < 60) return lang === "zh-CN" ? `${m} 分钟前` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === "zh-CN" ? `${h} 小时前` : `${h}h ago`;
  return d.toLocaleDateString(lang === "zh-CN" ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
}
