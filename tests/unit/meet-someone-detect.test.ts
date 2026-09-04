import { describe, expect, it } from "vitest";
import {
  explicitMeetSomeoneSignal,
  explicitActivityBuddySignal,
  userChoseMeetSomeoneAfterDisambig,
  recentlyAskedMeetVsBuddy,
} from "@/lib/meet-someone-detect";

describe("meet-someone-detect", () => {
  it("detects people-who-like-activity vs activity-together", () => {
    expect(explicitMeetSomeoneSignal("想认识喜欢跑步的女生")).toBe(true);
    expect(explicitMeetSomeoneSignal("想通过跑步认识新朋友")).toBe(true);
    expect(explicitActivityBuddySignal("想找人一起跑步")).toBe(true);
    expect(explicitActivityBuddySignal("想找女生一起跑步")).toBe(true);
    expect(explicitMeetSomeoneSignal("想找女生一起跑步")).toBe(false);
  });

  it("after activity-vs-people disambiguation, routes correctly", () => {
    const history = [
      { role: "user", content: "我想找一起跑步的女生" },
      {
        role: "assistant",
        content:
          "你是想找一起跑步这件事（约跑步、找跑步搭子），还是想找喜欢跑步的人（以认识这类人为目的）？",
      },
    ];
    expect(recentlyAskedMeetVsBuddy(history)).toBe(true);
    expect(userChoseMeetSomeoneAfterDisambig("想认识喜欢跑步的人", history)).toBe(true);
    expect(userChoseMeetSomeoneAfterDisambig("想找人一起跑步", history)).toBe(false);
    expect(explicitActivityBuddySignal("想找人一起跑步")).toBe(true);
  });
});
