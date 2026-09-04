/**
 * Rule-based signals: Side by Side (find an activity / buddy for the activity)
 * vs Matchmaker (find people who like something — person is the goal).
 */

const MEET_SOMEONE_RE =
  /认识新朋友|想通过.*认识|想认识.*(朋友|女生|男生|人)|交(?:个|)?朋友|找对象|谈恋爱|相亲|expand my circle|meet someone new|meet new people|make new friends/i;

/** Person-centric: meet people who like an activity (Matchmaker). */
const MEET_PEOPLE_WHO_LIKE_RE =
  /想认识.*(喜欢|爱)|认识.*(喜欢|爱).*的人|找.*(喜欢|爱).*的人|meet someone who (likes|loves)|people who (like|love)/i;

const ACTIVITY_BUDDY_RE =
  /找(?:个|)?搭子|一起(?:跑步|跑|打|做|逛|看)|约(?:个|)?一起|找人一起|activity buddy|find a buddy|find someone to (?:run|do|play)|do .* together/i;

const DISAMBIG_ASK_RE =
  /一起.*(事|做|跑步|跑|逛|看).*还是.*(喜欢|爱|认识)|找.*(活动|搭子).*(还是|或).*?(喜欢|爱|认识|人)|activity.*or.*people who (like|love)|people who like.*or.*(?:together|buddy)/i;

/** User clearly wants Matchmaker (find people), not Side by Side (find activity). */
export function explicitMeetSomeoneSignal(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (MEET_SOMEONE_RE.test(t)) return true;
  if (MEET_PEOPLE_WHO_LIKE_RE.test(t)) return true;
  if (/不是.*搭子|不是找搭子|不想找搭子|不是找活动|not a buddy|not just the activity|not the activity/i.test(t))
    return true;
  return false;
}

/** User clearly wants to stay on Side by Side (find activity / activity buddy). */
export function explicitActivityBuddySignal(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (explicitMeetSomeoneSignal(t)) return false;
  if (/发布.*心愿|发.*心愿|先看看别人的|browse others/i.test(t)) return true;
  if (ACTIVITY_BUDDY_RE.test(t)) return true;
  if (/继续找(?:活动|搭子)|还是找(?:活动|搭子)|找人一起|keep finding.*(?:activit|buddy)|stay on activit/i.test(t))
    return true;
  return false;
}

/** Assistant recently asked activity vs people-who-like-it disambiguation. */
export function recentlyAskedMeetVsBuddy(
  history: Array<{ role: string; content: string }>,
): boolean {
  const lastAssist = [...history].reverse().find((m) => m.role === "assistant");
  if (!lastAssist?.content) return false;
  return DISAMBIG_ASK_RE.test(lastAssist.content);
}

/** After disambiguation, user picked find-people path (→ handoff to Matchmaker). */
export function userChoseMeetSomeoneAfterDisambig(
  userMessage: string,
  history: Array<{ role: string; content: string }>,
): boolean {
  if (!explicitMeetSomeoneSignal(userMessage)) return false;
  if (explicitActivityBuddySignal(userMessage)) return false;
  return recentlyAskedMeetVsBuddy(history) || explicitMeetSomeoneSignal(userMessage);
}
