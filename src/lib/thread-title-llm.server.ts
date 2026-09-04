import { chatCompletion } from "./llm.server";
import { truncateTitle } from "./thread-title";

export async function generateThreadTitle(input: {
  lang: "en" | "zh-CN";
  agent: "introduce" | "do_something" | "reception";
  context: string;
}): Promise<string | null> {
  const isZh = input.lang === "zh-CN";
  const raw = await chatCompletion(
    [
      {
        role: "system",
        content: isZh
          ? "根据对话上下文，为历史列表生成一条短标题。8-18 个汉字，名词短语或短句；不要引号、不要句号、不要「用户想/正在寻找」这类前缀。只输出标题本身。"
          : "Generate a short history-list title from the context. 4-10 words, noun phrase; no quotes, no period, no 'User wants' prefix. Output the title only.",
      },
      { role: "user", content: input.context.slice(0, 2000) },
    ],
    { temperature: 0.35, maxTokens: 48, thinking: false },
  );
  if (!raw?.trim()) return null;
  const cleaned = raw
    .trim()
    .replace(/^["'「『]|["'」』]$/g, "")
    .replace(/[。．.!！?？]+$/g, "");
  return truncateTitle(cleaned);
}
