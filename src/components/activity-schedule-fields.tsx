import { useEffect, useRef, useState } from "react";
import {
  composeIsoDateParts,
  composeTimeHHmm,
  splitIsoDateParts,
  splitTimeHHmm,
  type ActivityScheduleValue,
} from "@/lib/wish-date";

interface Props {
  value: ActivityScheduleValue;
  disabled?: boolean;
  onChange: (next: ActivityScheduleValue) => void;
  labels: {
    year: string;
    month: string;
    day: string;
    start: string;
    end: string;
    preview: string;
  };
  formatPreview: (value: ActivityScheduleValue) => string;
}

function segmentClass(disabled?: boolean, extra = "") {
  return [
    "min-w-0 bg-transparent px-2 py-2.5 text-center text-[15px] font-mono tabular-nums",
    "placeholder:text-muted-foreground/50 focus:outline-none focus:bg-secondary/40",
    disabled ? "opacity-50" : "",
    extra,
  ].join(" ");
}

export function ActivityScheduleFields({
  value,
  disabled,
  onChange,
  labels,
  formatPreview,
}: Props) {
  const parts = splitIsoDateParts(value.dateStart);
  const start = splitTimeHHmm(value.timeStart);
  const end = splitTimeHHmm(value.timeEnd);

  const [y, setY] = useState(parts.y);
  const [mo, setMo] = useState(parts.m);
  const [d, setD] = useState(parts.d);
  const [sh, setSh] = useState(start.h);
  const [sm, setSm] = useState(start.m);
  const [eh, setEh] = useState(end.h);
  const [em, setEm] = useState(end.m);

  const yRef = useRef<HTMLInputElement>(null);
  const moRef = useRef<HTMLInputElement>(null);
  const dRef = useRef<HTMLInputElement>(null);
  const shRef = useRef<HTMLInputElement>(null);
  const smRef = useRef<HTMLInputElement>(null);
  const ehRef = useRef<HTMLInputElement>(null);
  const emRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = splitIsoDateParts(value.dateStart);
    const s = splitTimeHHmm(value.timeStart);
    const e = splitTimeHHmm(value.timeEnd);
    setY(p.y);
    setMo(p.m);
    setD(p.d);
    setSh(s.h);
    setSm(s.m);
    setEh(e.h);
    setEm(e.m);
  }, [value.dateStart, value.timeStart, value.timeEnd]);

  function emit(
    ny: string,
    nmo: string,
    nd: string,
    nsh: string,
    nsm: string,
    neh: string,
    nem: string,
  ) {
    const dateStart = composeIsoDateParts(ny, nmo, nd);
    const timeStart = composeTimeHHmm(nsh, nsm);
    const timeEnd = composeTimeHHmm(neh, nem);
    onChange({
      dateStart,
      dateEnd: dateStart,
      timeStart,
      timeEnd,
    });
  }

  const preview = formatPreview(value);

  return (
    <div className="space-y-2">
      <div
        className={[
          "flex items-stretch rounded-lg border border-border bg-background overflow-hidden",
          "focus-within:border-primary/50 transition-colors",
          disabled ? "opacity-60" : "",
        ].join(" ")}
      >
        <input
          ref={yRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={y}
          placeholder={labels.year}
          aria-label={labels.year}
          maxLength={4}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
            setY(digits);
            emit(digits, mo, d, sh, sm, eh, em);
            if (digits.length >= 4) moRef.current?.focus();
          }}
          className={segmentClass(disabled, "min-w-[4.25rem] max-w-[4.75rem]")}
        />
        <span className="self-center text-muted-foreground/40 font-mono text-[13px] select-none">/</span>
        <input
          ref={moRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={mo}
          placeholder={labels.month}
          aria-label={labels.month}
          maxLength={2}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
            setMo(digits);
            emit(y, digits, d, sh, sm, eh, em);
            if (digits.length >= 2) dRef.current?.focus();
          }}
          className={segmentClass(disabled, "max-w-[2.75rem]")}
        />
        <span className="self-center text-muted-foreground/40 font-mono text-[13px] select-none">/</span>
        <input
          ref={dRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={d}
          placeholder={labels.day}
          aria-label={labels.day}
          maxLength={2}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
            setD(digits);
            emit(y, mo, digits, sh, sm, eh, em);
            if (digits.length >= 2) shRef.current?.focus();
          }}
          className={segmentClass(disabled, "max-w-[2.75rem] border-r border-border")}
        />

        <input
          ref={shRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={sh}
          placeholder="12"
          aria-label={labels.start}
          maxLength={2}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
            setSh(digits);
            emit(y, mo, d, digits, sm, eh, em);
            if (digits.length >= 2) smRef.current?.focus();
          }}
          className={segmentClass(disabled, "max-w-[2.5rem]")}
        />
        <span className="self-center text-muted-foreground/50 font-mono select-none">:</span>
        <input
          ref={smRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={sm}
          placeholder="00"
          aria-label={labels.start}
          maxLength={2}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
            setSm(digits);
            emit(y, mo, d, sh, digits, eh, em);
            if (digits.length >= 2) ehRef.current?.focus();
          }}
          className={segmentClass(disabled, "max-w-[2.5rem] border-r border-border")}
        />

        <span className="self-center px-1.5 text-muted-foreground/50 font-mono text-[13px] select-none">–</span>

        <input
          ref={ehRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={eh}
          placeholder="16"
          aria-label={labels.end}
          maxLength={2}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
            setEh(digits);
            emit(y, mo, d, sh, sm, digits, em);
            if (digits.length >= 2) emRef.current?.focus();
          }}
          className={segmentClass(disabled, "max-w-[2.5rem]")}
        />
        <span className="self-center text-muted-foreground/50 font-mono select-none">:</span>
        <input
          ref={emRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={em}
          placeholder="00"
          aria-label={labels.end}
          maxLength={2}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
            setEm(digits);
            emit(y, mo, d, sh, sm, eh, digits);
          }}
          className={segmentClass(disabled, "max-w-[2.5rem]")}
        />
      </div>
      {preview && (
        <p className="text-[11px] text-muted-foreground font-mono tabular-nums">
          {labels.preview}: {preview}
        </p>
      )}
    </div>
  );
}
