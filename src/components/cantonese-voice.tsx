import { useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Volume2 } from "lucide-react";
import { showPhrase } from "@/lib/elder-phrases";

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognitionCtor(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickCantoneseVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined" || !window.speechSynthesis) return undefined;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /yue|zh-HK|hong kong|cantonese/i.test(`${v.lang} ${v.name}`)) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("zh"))
  );
}

export function speakCantonese(text: string) {
  const spoken = text.trim();
  if (!spoken || typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(spoken);
  const voice = pickCantoneseVoice();
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  } else {
    utter.lang = "zh-HK";
  }
  utter.rate = 0.9;
  window.speechSynthesis.speak(utter);
}

export function CantoneseListenButton({ text }: { text: string }) {
  const { i18n } = useTranslation();
  if (!text.trim()) return null;
  return (
    <button
      type="button"
      onClick={() => speakCantonese(text)}
      className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-[16px] text-foreground hover:border-foreground/30"
    >
      <Volume2 className="w-4 h-4" />
      {showPhrase(i18n.resolvedLanguage, "听粤语")}
    </button>
  );
}

/** Press and hold to dictate Cantonese into the composer. */
export function CantoneseMicButton({
  disabled,
  onText,
}: {
  disabled?: boolean;
  onText: (transcript: string) => void;
}) {
  const { i18n } = useTranslation();
  const show = (text: string) => showPhrase(i18n.resolvedLanguage, text);
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState("");

  function start(e: PointerEvent) {
    e.preventDefault();
    if (disabled || listening) return;
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setHint(show("这部设备暂时不支持语音输入，可以打字。"));
      return;
    }
    const rec = new Ctor();
    rec.lang = "zh-HK";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const transcript = ev.results?.[0]?.[0]?.transcript?.trim() ?? "";
      if (transcript) onText(transcript);
    };
    rec.onerror = () => setHint(show("没听清，请再说一次，或改用打字。"));
    rec.onend = () => setListening(false);
    setHint("");
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      setHint(show("语音暂时开不了，请改用打字。"));
    }
    const stop = () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointerup", stop);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={disabled}
        onPointerDown={start}
        className={[
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[16px] disabled:opacity-40",
          listening
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-foreground",
        ].join(" ")}
        aria-pressed={listening}
      >
        <Mic className="w-4 h-4" />
        {show(listening ? "正在听…" : "按住说话")}
      </button>
      {hint ? <p className="text-[15px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
