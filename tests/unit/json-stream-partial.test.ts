import { describe, expect, it } from "vitest";
import { extractPartialJsonStringField, recoverPlainTextAsJsonField } from "@/lib/json-partial";

describe("extractPartialJsonStringField", () => {
  it("reads a growing reply field", () => {
    expect(extractPartialJsonStringField('{"reply":"', "reply")).toBe("");
    expect(extractPartialJsonStringField('{"reply":"你好', "reply")).toBe("你好");
    expect(extractPartialJsonStringField('{"reply":"你好呀","action":', "reply")).toBe("你好呀");
  });

  it("handles escapes", () => {
    expect(extractPartialJsonStringField('{"reply":"a\\"b\\nc"', "reply")).toBe('a"b\nc');
  });
});

describe("recoverPlainTextAsJsonField", () => {
  it("wraps plain text as reply", () => {
    expect(recoverPlainTextAsJsonField("明白，你想找搭子。", "reply")).toEqual({
      reply: "明白，你想找搭子。",
    });
  });

  it("ignores JSON-looking buffers", () => {
    expect(recoverPlainTextAsJsonField('{"reply":"hi"}', "reply")).toBeNull();
  });
});
