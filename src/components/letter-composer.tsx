import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Send } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import {
  SOFT_CHAR_LIMIT,
  canSendNow,
  remainingToday,
} from "@/lib/letters";
import type { LetterStore } from "@/lib/letters";

interface Props {
  personId: string;
  store: LetterStore;
  onCancel: () => void;
  onSend: (body: string) => void;
}

export function LetterComposer({ personId, store, onCancel, onSend }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const person = getPersonById(personId);
  const [body, setBody] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { taRef.current?.focus(); }, []);

  if (!person) return null;
  const loc = localized(person, lang);
  const sendCheck = canSendNow(store, personId);
  const remaining = remainingToday(store);
  const count = body.trim().length;
  const over = count > SOFT_CHAR_LIMIT;
  const disabled = count === 0 || !sendCheck.ok;

  const notes = lang === "zh-CN"
    ? [
        `TA 在意：${person.signals.slice(0, 3).map((s) => zhSignal(s)).join("、")}`,
        `TA 的画像：${loc.portrait}`,
        `建议：写一件具体的小事，比写"我很喜欢你"有用得多。`,
      ]
    : [
        `What ${loc.name} cares about: ${person.signals.slice(0, 3).join(", ")}`,
        `Who they are: ${loc.portrait}`,
        `Tip: one specific small thing beats "I like you a lot."`,
      ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <button
          onClick={onCancel}
          className="w-7 h-7 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={avatarUrl(person.id)} alt={loc.name} className="w-8 h-8 rounded-full border border-border" />
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium text-foreground truncate">
              {t("letter.to")} {loc.name}
            </div>
            <div className="text-[10.5px] font-mono text-muted-foreground uppercase tracking-wide">
              {t("letter.composer_subtitle")}
            </div>
          </div>
        </div>
        <div className="ml-auto text-[10.5px] font-mono text-muted-foreground uppercase tracking-wide">
          {t("letter.remaining_today", { n: remaining })}
        </div>
      </div>

      {/* Two columns */}
      <div className="flex-1 grid md:grid-cols-[minmax(0,1fr)_240px] min-h-0 overflow-y-auto">
        <div className="flex flex-col p-6 min-h-0">
          <textarea
            ref={taRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("letter.placeholder", { name: loc.name })}
            className="flex-1 min-h-[260px] resize-none bg-transparent text-[14.5px] leading-[1.7] text-foreground placeholder:text-muted-foreground outline-none"
          />
          <div className="mt-3 flex items-center justify-between">
            <span className={`text-[10.5px] font-mono ${over ? "text-foreground" : "text-muted-foreground"}`}>
              {count} / {SOFT_CHAR_LIMIT}{over ? ` · ${t("letter.over_limit")}` : ""}
            </span>
            <button
              onClick={() => onSend(body)}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-[12.5px] hover:opacity-90 disabled:opacity-25 disabled:cursor-not-allowed transition-opacity"
            >
              <Send className="w-3.5 h-3.5" />
              {t("letter.send")}
            </button>
          </div>
          {!sendCheck.ok && (
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              {sendCheck.reason === "quota" && t("letter.err_quota")}
              {sendCheck.reason === "inflight" && t("letter.err_inflight")}
              {sendCheck.reason === "already" && t("letter.err_already")}
            </p>
          )}
        </div>

        <aside className="border-t md:border-t-0 md:border-l border-border bg-secondary/30 p-5 space-y-3">
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
            {t("letter.agent_notes")}
          </div>
          {notes.map((n, i) => (
            <p key={i} className="text-[12.5px] text-foreground leading-relaxed">
              <span className="text-muted-foreground font-mono mr-1.5">›</span>
              {n}
            </p>
          ))}
        </aside>
      </div>
    </div>
  );
}

function zhSignal(s: string): string {
  const map: Record<string, string> = {
    reading: "读书", quiet: "安静", funny: "幽默", kind: "温柔",
    ambitious: "上进", art: "艺术", coffee: "咖啡", city: "城市",
    travel: "旅行", outdoors: "户外", rain: "雨天", music: "音乐",
    cooking: "做饭", curious: "好奇心", brave: "坦诚",
  };
  return map[s] ?? s;
}
