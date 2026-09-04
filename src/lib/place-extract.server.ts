import { chatCompletionJson } from "./llm.server";
import type { SideLang } from "./wish-types";
import { formatNowContext } from "./wish-date";
import {
  findPlaceInText,
  isPlaceFlexText,
  isPlaceOnlineText,
  isPlacePublishable,
  normalizeWishPlaceFromExtract,
  resolvePlaceRaw,
  type WishPlace,
} from "./wish-place";

export interface PlaceExtractInput {
  lang: SideLang;
  placeRaw: string;
  profileCity?: string;
  rawText?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface PlaceExtractOutput {
  placeRaw: string;
  placeOnline: boolean;
  placeFlex: boolean;
  place: WishPlace | null;
  publishable: boolean;
}

interface LlmPlaceExtractJson {
  placeOnline?: boolean;
  placeFlex?: boolean;
  country?: string | null;
  admin1?: string | null;
  city?: string | null;
  detail?: string | null;
  detailLabel?: string | null;
  detailLabel_zh?: string | null;
}

function extractPlaceRuleBased(placeRaw: string): Omit<PlaceExtractOutput, "placeRaw"> {
  const raw = placeRaw.trim();
  if (!raw) {
    return { placeOnline: false, placeFlex: false, place: null, publishable: false };
  }
  if (isPlaceOnlineText(raw)) {
    return { placeOnline: true, placeFlex: false, place: null, publishable: true };
  }
  if (isPlaceFlexText(raw)) {
    return { placeOnline: false, placeFlex: true, place: null, publishable: true };
  }
  const place = findPlaceInText(raw);
  const publishable = isPlacePublishable({ placeRaw: raw, placeFlex: false, place });
  return { placeOnline: false, placeFlex: false, place, publishable };
}

function buildSystem(lang: SideLang): string {
  const isZh = lang === "zh-CN";
  const nowLine = formatNowContext(lang);
  return isZh
    ? `你是心愿地点抽取器。把用户自由输入的地点解析成层级地址，只输出 JSON。
${nowLine}
placeOnline: 用户明确说「线上/远程/网上」→ true，此时 placeFlex=false，country/admin1/city/detail 全 null
placeFlex: 用户说「不限/哪里都行」等（线下但不挑地点）→ true，此时 placeOnline=false，地址字段全 null
否则 placeOnline=false、placeFlex=false，尽量填：
- country: 国家（中国/cn/China）
- admin1: 省/州/直辖市
- city: 城市（用英文 id 或中文名，如 beijing/北京）
- detail: 具体位置 slug（可选）
- detailLabel_zh / detailLabel: 具体位置展示名（商圈/公园/场馆）
placeOnline 与 placeFlex 不能同时为 true。无法识别时各字段 null。禁止编造。
JSON: {"placeOnline":false,"placeFlex":false,"country":null,"admin1":null,"city":null,"detail":null,"detailLabel":null,"detailLabel_zh":null}`
    : `Extract wish location into JSON. ${nowLine}
placeOnline true when user says online/virtual/remote only.
placeFlex true when user says anywhere / no preference for offline meetup.
Else fill country, admin1, city, detail; null if unknown. placeOnline and placeFlex cannot both be true. No guessing.
JSON: {"placeOnline":false,"placeFlex":false,"country":null,"admin1":null,"city":null,"detail":null,"detailLabel":null,"detailLabel_zh":null}`;
}

export async function runPlaceExtract(input: PlaceExtractInput): Promise<PlaceExtractOutput> {
  const placeRaw = resolvePlaceRaw(input.placeRaw, undefined, input.profileCity);
  if (!placeRaw.trim()) {
    return { placeRaw: "", placeOnline: false, placeFlex: false, place: null, publishable: false };
  }

  const rule = extractPlaceRuleBased(placeRaw);
  if (rule.publishable) {
    return { placeRaw, ...rule };
  }

  try {
    const parsed = await chatCompletionJson<LlmPlaceExtractJson>(
      [
        { role: "system", content: buildSystem(input.lang) },
        ...(input.history ?? []).slice(-6).map((m) => ({ role: m.role, content: m.content })),
        {
          role: "user",
          content: [
            `地点输入：${placeRaw}`,
            input.rawText?.trim() ? `活动描述：${input.rawText.trim()}` : "",
            input.profileCity?.trim() ? `用户资料城市：${input.profileCity.trim()}` : "",
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
        placeRaw,
        placeOnline: normalized.placeOnline,
        placeFlex: normalized.placeFlex,
        place: normalized.place,
      });
      if (publishable) {
        return { placeRaw, ...normalized, publishable: true };
      }
    }
  } catch {
    /* fall through to rule result */
  }

  return { placeRaw, ...rule, publishable: rule.publishable };
}
