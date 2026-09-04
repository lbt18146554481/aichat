import { chatCompletionJson } from "./llm.server";
import type { SideLang } from "./wish-types";
import { formatNowContext } from "./wish-date";
import {
  findPlaceInText,
  isPlaceFlexText,
  isPlaceOnlineText,
  isPlacePublishable,
  legacyFlagsFromSpec,
  normalizeWishPlaceFromExtract,
  type PlaceMode,
  type PlaceSpec,
  type WishPlace,
} from "./wish-place";

export interface PlaceExtractInput {
  lang: SideLang;
  /** Free-text location cue (placeRaw, city phrase, or combined blob). */
  placeRaw: string;
  profileCity?: string;
  rawText?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface PlaceExtractOutput {
  placeRaw: string;
  placeMode: PlaceMode;
  placeOnline: boolean;
  placeFlex: boolean;
  place: WishPlace | null;
  publishable: boolean;
}

interface LlmPlaceExtractJson {
  placeMode?: string | null;
  country?: string | null;
  admin1?: string | null;
  city?: string | null;
  detail?: string | null;
  detailLabel?: string | null;
  detailLabel_zh?: string | null;
}

function extractPlaceRuleBased(placeRaw: string): PlaceSpec & {
  placeOnline: boolean;
  placeFlex: boolean;
  publishable: boolean;
} {
  const raw = placeRaw.trim();
  if (!raw) {
    return {
      placeMode: "offline",
      placeOnline: false,
      placeFlex: false,
      place: null,
      publishable: false,
    };
  }
  if (isPlaceOnlineText(raw)) {
    return {
      placeMode: "online",
      placeOnline: true,
      placeFlex: false,
      place: null,
      publishable: true,
    };
  }
  if (isPlaceFlexText(raw)) {
    const flags = legacyFlagsFromSpec({ placeMode: "offline", place: { city: "any" } });
    return { ...flags, publishable: true };
  }
  const place = findPlaceInText(raw);
  const flags = legacyFlagsFromSpec({ placeMode: "offline", place });
  const publishable = isPlacePublishable({
    placeRaw: raw,
    placeMode: flags.placeMode,
    placeOnline: flags.placeOnline,
    placeFlex: flags.placeFlex,
    place: flags.place,
  });
  return { ...flags, publishable };
}

function buildSystem(lang: SideLang): string {
  const isZh = lang === "zh-CN";
  const nowLine = formatNowContext(lang);
  return isZh
    ? `你是心愿地点抽取器。把用户自由输入解析成五维地点，只输出 JSON。
${nowLine}
placeMode: "online" | "offline" | "any"
- online：明确线上/远程 → country/admin1/city/detail 全 null
- any：线上线下都行 → 地理字段可 null
- offline：线下见面

地理四级（未提及则 null；用户说该层「不限/都行」则填字符串 "any"，禁止填中文「不限」）：
- country: 国家（中国/cn）— 可选
- admin1: 省/州 — 可选
- city: 城市 id 或中文名（beijing/北京），或 "any"
- detail: 具体地点（商圈/公园），或 "any"；没有具体点则 null
detailLabel_zh / detailLabel: 展示名（detail 为 any 时可省略）
strength（可选，写入同级外的说明）：用户说「最好在某城」时仍填具体 city，由调用方用 placeStrength=flex；说「必须同城」→ hard。本 JSON 只填地点字段。
禁止编造未提及的城市。无法识别则对应字段 null。
JSON: {"placeMode":"offline","country":null,"admin1":null,"city":null,"detail":null,"detailLabel":null,"detailLabel_zh":null}`
    : `Extract wish location into JSON. ${nowLine}
placeMode: "online" | "offline" | "any".
Levels country/admin1/city/detail: specific value, "any" if user said unrestricted for that level, or null if unset. Never invent cities.
JSON: {"placeMode":"offline","country":null,"admin1":null,"city":null,"detail":null,"detailLabel":null,"detailLabel_zh":null}`;
}

function buildUserBlob(input: PlaceExtractInput): string {
  return [
    input.placeRaw?.trim(),
    input.rawText?.trim(),
    ...(input.history ?? [])
      .filter((m) => m.role === "user")
      .slice(-4)
      .map((m) => m.content.trim()),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * LLM-first place extract. Rules only for empty input, trivial "线上", or LLM failure.
 */
export async function runPlaceExtract(input: PlaceExtractInput): Promise<PlaceExtractOutput> {
  const displayRaw = (input.placeRaw || input.rawText || "").trim();
  const blob = buildUserBlob(input);

  if (!blob.trim()) {
    return {
      placeRaw: "",
      placeMode: "offline",
      placeOnline: false,
      placeFlex: false,
      place: null,
      publishable: false,
    };
  }

  // Cheap short-circuit: entire cue is exactly online.
  if (displayRaw && isPlaceOnlineText(displayRaw)) {
    return {
      placeRaw: displayRaw,
      placeMode: "online",
      placeOnline: true,
      placeFlex: false,
      place: null,
      publishable: true,
    };
  }

  try {
    const parsed = await chatCompletionJson<LlmPlaceExtractJson>(
      [
        { role: "system", content: buildSystem(input.lang) },
        {
          role: "user",
          content: [
            `地点相关文本：\n${blob}`,
            input.profileCity?.trim()
              ? `用户资料城市（仅作参考，用户未提及时勿填入）：${input.profileCity.trim()}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      { temperature: 0.1, maxTokens: 280 },
    );

    if (parsed) {
      const normalized = normalizeWishPlaceFromExtract(parsed);
      const publishable = isPlacePublishable({
        placeRaw: displayRaw || blob.slice(0, 80),
        placeMode: normalized.placeMode,
        placeOnline: normalized.placeOnline,
        placeFlex: normalized.placeFlex,
        place: normalized.place,
      });
      if (publishable) {
        return {
          placeRaw: displayRaw || blob.slice(0, 80),
          ...normalized,
          publishable: true,
        };
      }
      // LLM returned something incomplete — still prefer partial structured if city/mode set
      if (normalized.placeMode === "online" || normalized.placeMode === "any" || normalized.place) {
        return {
          placeRaw: displayRaw || blob.slice(0, 80),
          ...normalized,
          publishable,
        };
      }
    }
  } catch {
    /* fall through to rules */
  }

  const rule = extractPlaceRuleBased(displayRaw || blob);
  return {
    placeRaw: displayRaw || blob.slice(0, 80),
    ...rule,
    publishable: rule.publishable,
  };
}
