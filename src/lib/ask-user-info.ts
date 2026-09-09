/**
 * ask_user_info — human-in-the-loop tool.
 *
 * AI calls this when it must collect a specific piece of info via an inline card.
 * Confirm / cancel → tool result on the next turn.
 * User ignores the card and sends a new message → status "skipped", value null (empty).
 */

import type { AgentAsk } from "@/components/agent-ask";
import type { ToolDefinition } from "./llm.server";

export const ASK_USER_INFO_TOOL_NAME = "ask_user_info" as const;

/** Side browse search: structured place / city / online / anywhere. */
export const ACTIVITY_PLACE_FIELD_KEY = "activity_place" as const;

export type AskUserInfoKind = "text" | "select" | "confirm";

export type PendingUserAsk = {
  id: string;
  toolCallId: string;
  fieldKey: string;
  prompt: string;
  kind: AskUserInfoKind;
  placeholder?: string;
  multiline?: boolean;
  options?: { value: string; label: string }[];
  confirmLabel?: string;
  cancelLabel?: string;
};

export type UserAskResolutionStatus = "confirmed" | "cancelled" | "skipped";

export type UserAskResolution = {
  status: UserAskResolutionStatus;
  /** Confirmed text / select value / "confirm"; null when cancelled or skipped. */
  value: string | null;
  fieldKey: string;
  prompt: string;
};

export const ASK_USER_INFO_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: ASK_USER_INFO_TOOL_NAME,
    description:
      "Pause and show an inline card so the user can fill in one required piece of information. Use only when you must have that info structured (not when a normal chat question is enough). The turn stops after this tool; you get the answer (or empty) on the next turn.",
    parameters: {
      type: "object",
      required: ["fieldKey", "prompt", "kind"],
      properties: {
        fieldKey: {
          type: "string",
          description: "Short machine key for what you need, e.g. preferred_city, buddy_gender.",
        },
        prompt: {
          type: "string",
          description: "Question shown on the card (user-facing).",
        },
        kind: {
          type: "string",
          enum: ["text", "select", "confirm"],
          description: "text = free input; select = pick one option; confirm = yes/no.",
        },
        placeholder: { type: "string" },
        multiline: { type: "boolean" },
        options: {
          type: "array",
          items: {
            type: "object",
            required: ["value", "label"],
            properties: {
              value: { type: "string" },
              label: { type: "string" },
            },
          },
          description: "Required when kind=select.",
        },
        confirmLabel: { type: "string" },
        cancelLabel: { type: "string" },
      },
    },
  },
};

function newAskId(): string {
  return `user-info-${Math.random().toString(36).slice(2, 10)}`;
}

function asOptions(v: unknown): { value: string; label: string }[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: { value: string; label: string }[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const value = String(o.value ?? "").trim();
    const label = String(o.label ?? value).trim();
    if (!value) continue;
    out.push({ value, label: label || value });
  }
  return out.length ? out : undefined;
}

export function parseAskUserInfoArgs(
  args: Record<string, unknown>,
  toolCallId = "ask_user_info",
): PendingUserAsk | null {
  const fieldKey = String(args.fieldKey ?? "").trim();
  const prompt = String(args.prompt ?? "").trim();
  const kindRaw = String(args.kind ?? "text").trim();
  const kind: AskUserInfoKind =
    kindRaw === "select" || kindRaw === "confirm" ? kindRaw : "text";
  if (!fieldKey || !prompt) return null;

  const options = asOptions(args.options);
  if (kind === "select" && (!options || options.length === 0)) return null;

  return {
    id: newAskId(),
    toolCallId,
    fieldKey,
    prompt,
    kind,
    placeholder: typeof args.placeholder === "string" ? args.placeholder : undefined,
    multiline: args.multiline === true,
    options,
    confirmLabel: typeof args.confirmLabel === "string" ? args.confirmLabel : undefined,
    cancelLabel: typeof args.cancelLabel === "string" ? args.cancelLabel : undefined,
  };
}

export function toAgentAsk(
  pending: PendingUserAsk,
  defaults: { confirmLabel: string; cancelLabel: string },
): AgentAsk {
  const confirmLabel = pending.confirmLabel?.trim() || defaults.confirmLabel;
  const cancelLabel = pending.cancelLabel?.trim() || defaults.cancelLabel;
  if (pending.kind === "select") {
    return {
      id: pending.id,
      kind: "select",
      prompt: pending.prompt,
      options: pending.options ?? [],
      cancelLabel,
    };
  }
  if (pending.kind === "confirm") {
    return {
      id: pending.id,
      kind: "confirm",
      prompt: pending.prompt,
      confirmLabel,
      cancelLabel,
    };
  }
  return {
    id: pending.id,
    kind: "text",
    prompt: pending.prompt,
    placeholder: pending.placeholder,
    multiline: pending.multiline,
    confirmLabel,
    cancelLabel,
  };
}

export function formatUserAskResolutionForLlm(
  resolution: UserAskResolution,
  lang: "en" | "zh-CN",
): string {
  const empty =
    resolution.status !== "confirmed" ||
    resolution.value == null ||
    String(resolution.value).trim() === "";
  const valueShown = empty ? "" : String(resolution.value).trim();
  if (lang === "zh-CN") {
    if (resolution.status === "confirmed" && !empty) {
      return `[ask_user_info 结果] fieldKey=${resolution.fieldKey} status=confirmed value=${JSON.stringify(valueShown)}（用户已通过卡片确认；请据此继续）`;
    }
    if (resolution.status === "cancelled") {
      return `[ask_user_info 结果] fieldKey=${resolution.fieldKey} status=cancelled value=""（用户点了取消；该信息视为空，请继续回复）`;
    }
    return `[ask_user_info 结果] fieldKey=${resolution.fieldKey} status=skipped value=""（用户未填卡片、直接发了新消息；该信息视为空，请结合新消息继续）`;
  }
  if (resolution.status === "confirmed" && !empty) {
    return `[ask_user_info result] fieldKey=${resolution.fieldKey} status=confirmed value=${JSON.stringify(valueShown)} (user confirmed via card; continue with this)`;
  }
  if (resolution.status === "cancelled") {
    return `[ask_user_info result] fieldKey=${resolution.fieldKey} status=cancelled value="" (user cancelled; treat as empty and continue)`;
  }
  return `[ask_user_info result] fieldKey=${resolution.fieldKey} status=skipped value="" (user ignored the card and sent a new message; treat as empty and continue with the new message)`;
}

export function resolutionFromCardValue(
  pending: PendingUserAsk,
  value: string | null,
): UserAskResolution {
  if (value === null) {
    return {
      status: "cancelled",
      value: null,
      fieldKey: pending.fieldKey,
      prompt: pending.prompt,
    };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      status: "cancelled",
      value: null,
      fieldKey: pending.fieldKey,
      prompt: pending.prompt,
    };
  }
  return {
    status: "confirmed",
    value: trimmed,
    fieldKey: pending.fieldKey,
    prompt: pending.prompt,
  };
}

export function skippedUserAskResolution(pending: PendingUserAsk): UserAskResolution {
  return {
    status: "skipped",
    value: null,
    fieldKey: pending.fieldKey,
    prompt: pending.prompt,
  };
}

export function isUserInfoAskId(askId: string): boolean {
  return askId.startsWith("user-info-");
}

/** Inline card asking for activity place before Side can search the pool. */
export function buildActivityPlaceAsk(lang: "en" | "zh-CN"): PendingUserAsk {
  return {
    id: newAskId(),
    toolCallId: ASK_USER_INFO_TOOL_NAME,
    fieldKey: ACTIVITY_PLACE_FIELD_KEY,
    kind: "text",
    prompt:
      lang === "zh-CN"
        ? "找活动需要先有一个地点——城市、具体区域，或写「线上 / 地点不限」。"
        : "I need a place before searching — a city/area, or type “online” / “anywhere”.",
    placeholder: lang === "zh-CN" ? "例如：上海、线上、地点不限" : "e.g. Shanghai, online, anywhere",
    confirmLabel: lang === "zh-CN" ? "确认" : "Confirm",
    cancelLabel: lang === "zh-CN" ? "取消" : "Cancel",
  };
}

export function attachPendingUserAskToLastAssistant<
  M extends { role: string; ask?: AgentAsk; askResolvedLabel?: string },
  S extends { messages: M[]; pendingUserAsk?: PendingUserAsk | null },
>(state: S, ask: AgentAsk): S {
  const msgs = [...state.messages];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.role === "assistant") {
      msgs[i] = { ...msgs[i], ask, askResolvedLabel: undefined };
      break;
    }
  }
  return { ...state, messages: msgs };
}

export function clearPendingUserAskOnMessages<
  M extends { ask?: AgentAsk; askResolvedLabel?: string },
  S extends { messages: M[]; pendingUserAsk?: PendingUserAsk | null },
>(state: S, askId: string, resolvedLabel: string): S {
  return {
    ...state,
    pendingUserAsk: null,
    messages: state.messages.map((m) =>
      m.ask?.id === askId ? { ...m, ask: undefined, askResolvedLabel: resolvedLabel } : m,
    ),
  };
}

/** Brief note for chat system when a card is about to show. */
export function awaitingUserAskChatHint(pending: PendingUserAsk, lang: "en" | "zh-CN"): string {
  return lang === "zh-CN"
    ? `本轮已调用 ask_user_info（fieldKey=${pending.fieldKey}）。界面会弹出填写卡：「${pending.prompt}」。reply 里简短说明为何需要这条信息即可；不要假装用户已经回答；不要 affirmMatch / 出人。`
    : `This turn called ask_user_info (fieldKey=${pending.fieldKey}). An inline card will ask: "${pending.prompt}". In reply, briefly say why you need it; do not pretend they answered; do not affirmMatch / introduce.`;
}
