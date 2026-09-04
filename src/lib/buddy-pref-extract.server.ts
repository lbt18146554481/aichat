import { chatCompletionJson } from "./llm.server";
import type { SideLang } from "./wish-types";
import type { PersonGender } from "./types";
import { normalizeGender } from "./match-normalize";
import {
  EMPTY_BUDDY_MATCH_QUERY,
  normalizeBuddyMatchQuery,
  type BuddyMatchQuery,
  type MatchMode,
} from "./wish-match-profile";

export interface BuddyPrefExtractInput {
  lang: SideLang;
  buddyPrefRaw: string;
  activityDescRaw?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface LlmBuddyPrefJson {
  genders?: string[] | null;
  genderMode?: MatchMode;
  ageMin?: number | null;
  ageMax?: number | null;
  ageMode?: MatchMode;
  personalityTags?: string[] | null;
  personalityQueryText?: string | null;
}

const FEMALE_RE = /女生|女的|女性|小姐姐|妹子|姑娘|female|woman|women|girl/i;
const MALE_RE = /男生|男的|男性|小哥|汉子|male|man|men|boy/i;
const STRICT_RE = /必须|只要|仅限|一定要|只能|非要|must|only|strictly/i;
const SOFT_RE = /最好|优先|倾向|希望|更想|prefer|ideally|better if/i;
const AGE_RANGE_RE = /(\d{2})\s*[-~到至]\s*(\d{2})\s*岁?/;
const AGE_AROUND_RE = /(?:大约|大概|左右|around)?\s*(\d{2})\s*岁/;

function normGenders(raw: string[] | null | undefined): PersonGender[] {
  if (!raw?.length) return [];
  const out: PersonGender[] = [];
  for (const g of raw) {
    const n = normalizeGender(g);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

function extractGenderRule(raw: string): { genders: PersonGender[]; mode: MatchMode } {
  const t = raw.trim();
  if (!t) return { genders: [], mode: null };
  const genders: PersonGender[] = [];
  if (FEMALE_RE.test(t)) genders.push("female");
  if (MALE_RE.test(t)) genders.push("male");
  if (!genders.length) return { genders: [], mode: null };
  const mode: MatchMode = STRICT_RE.test(t) ? "strict" : SOFT_RE.test(t) ? "soft" : "soft";
  return { genders, mode };
}

function extractAgeRule(raw: string): {
  ageMin: number | null;
  ageMax: number | null;
  mode: MatchMode;
} {
  const t = raw.trim();
  const range = t.match(AGE_RANGE_RE);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (min > 0 && max >= min) {
      return {
        ageMin: min,
        ageMax: max,
        mode: STRICT_RE.test(t) ? "strict" : "soft",
      };
    }
  }
  const around = t.match(AGE_AROUND_RE);
  if (around) {
    const age = Number(around[1]);
    if (age >= 16 && age <= 99) {
      return {
        ageMin: Math.max(16, age - 3),
        ageMax: Math.min(99, age + 3),
        mode: SOFT_RE.test(t) ? "soft" : "strict",
      };
    }
  }
  return { ageMin: null, ageMax: null, mode: null };
}

function buildSystem(lang: SideLang): string {
  const isZh = lang === "zh-CN";
  return isZh
    ? `你是搭子偏好抽取器。只从用户对「搭子/同伴」的要求中抽取 JSON，不编造。
genderMode/ageMode: "strict"=硬性要求（要/必须/只要），"soft"=偏好（最好/倾向），null=未提及
genders: female|male|nonbinary 数组；未提及则 []
ageMin/ageMax: 数字或 null
personalityTags: 自由中文/英文短语标签（性格、相处方式、特点），如「话多」「靠谱」「慢热」
personalityQueryText: 用于语义匹配的一句话（标签+关键词），无则 null
只抽对搭子本人的要求；同行人/举例/活动本身不算。
JSON: {"genders":[],"genderMode":null,"ageMin":null,"ageMax":null,"ageMode":null,"personalityTags":[],"personalityQueryText":null}`
    : `Extract buddy preferences JSON only. genderMode/ageMode: strict|soft|null. personalityTags: free-form tags. Do not invent. JSON: {"genders":[],"genderMode":null,"ageMin":null,"ageMax":null,"ageMode":null,"personalityTags":[],"personalityQueryText":null}`;
}

export async function runBuddyPrefExtract(
  input: BuddyPrefExtractInput,
): Promise<BuddyMatchQuery> {
  const raw = input.buddyPrefRaw.trim();
  if (!raw) return { ...EMPTY_BUDDY_MATCH_QUERY };

  const genderRule = extractGenderRule(raw);
  const ageRule = extractAgeRule(raw);

  try {
    const parsed = await chatCompletionJson<LlmBuddyPrefJson>(
      [
        { role: "system", content: buildSystem(input.lang) },
        ...(input.history ?? []).slice(-6).map((m) => ({ role: m.role, content: m.content })),
        {
          role: "user",
          content: [
            `搭子偏好：${raw}`,
            input.activityDescRaw?.trim() ? `活动描述：${input.activityDescRaw.trim()}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      { temperature: 0.15, maxTokens: 320 },
    );

    if (parsed) {
      const llmGenders = normGenders(parsed.genders ?? undefined);
      const genders = llmGenders.length ? llmGenders : genderRule.genders;
      const genderMode = parsed.genderMode ?? (genders.length ? genderRule.mode : null);
      const ageMin = parsed.ageMin ?? ageRule.ageMin;
      const ageMax = parsed.ageMax ?? ageRule.ageMax;
      const ageMode =
        parsed.ageMode ?? (ageMin != null || ageMax != null ? ageRule.mode : null);
      const personalityTags = (parsed.personalityTags ?? [])
        .map((t) => String(t).trim())
        .filter(Boolean);
      return normalizeBuddyMatchQuery({
        genders,
        genderMode,
        ageMin,
        ageMax,
        ageMode,
        personalityTags,
        personalityQueryText: parsed.personalityQueryText ?? undefined,
      });
    }
  } catch {
    /* fall through */
  }

  return normalizeBuddyMatchQuery({
    genders: genderRule.genders,
    genderMode: genderRule.genders.length ? genderRule.mode : null,
    ageMin: ageRule.ageMin,
    ageMax: ageRule.ageMax,
    ageMode: ageRule.ageMin != null || ageRule.ageMax != null ? ageRule.mode : null,
    personalityTags: [],
    personalityQueryText: raw,
  });
}
