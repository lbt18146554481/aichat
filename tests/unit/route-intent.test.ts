import { describe, expect, it } from "vitest";
import { isGreeting, routeIntent, wantsActivity, wantsPerson } from "@/lib/route-intent";

describe("route-intent", () => {
  it("treats 一个人 as matchmaker, not vague", () => {
    expect(wantsPerson("一个人")).toBe(true);
    expect(routeIntent("一个人")).toBe("matchmaker");
    expect(isGreeting("一个人")).toBe(false);
  });

  it("keeps greetings as greetings", () => {
    expect(isGreeting("你好")).toBe(true);
    expect(isGreeting("hello")).toBe(true);
  });

  it("routes activity wishes to sidebyside", () => {
    expect(wantsActivity("周末一起跑步")).toBe(true);
    expect(routeIntent("周末一起跑步")).toBe("sidebyside");
  });

  it("treats gender/age prefs as meet-someone", () => {
    expect(wantsPerson("找女生，20岁以下的")).toBe(true);
    expect(routeIntent("找女生，20岁以下的")).toBe("matchmaker");
  });

  it("routes park outings to sidebyside even with 找人", () => {
    expect(routeIntent("我想找人一起逛公园")).toBe("sidebyside");
  });
});
