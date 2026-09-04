import type { SideState } from "@/lib/agents/side-by-side";
import type { MatchmakerState } from "@/lib/agents/matchmaker";
import type { Session, SessionAgent } from "@/lib/sessions";

type TFn = (key: string, opts?: object) => string;

export function sessionAgentLabel(agent: SessionAgent, t: TFn): string {
  switch (agent) {
    case "do_something":
      return t("history.agent_sidebyside");
    case "introduce":
      return t("history.agent_matchmaker");
    case "reception":
      return t("history.agent_reception");
  }
}

/** Human-readable exit state for history list (from persisted session snapshot). */
export function sessionExitLabel(session: Session, t: TFn): string {
  if (session.status === "revoked") {
    return t("history.exit_revoked");
  }

  if (session.agent === "do_something") {
    const st = (session.state ?? {}) as Partial<SideState>;
    if (st.stage === "chat") return t("history.exit_sidebyside_chatting");
    if (st.matchIntentId) return t("history.exit_sidebyside_matched");
    if (st.wishLane === "browse" && !st.browseSearched) {
      return t("history.exit_sidebyside_browsing");
    }
    if (st.wishLane === "publish" && !st.myIntentId) {
      return t("history.exit_sidebyside_publishing");
    }
    if (st.stage === "published" || st.myIntentId) return t("history.exit_sidebyside_waiting");
    if (st.wishLane === "unset") return t("history.exit_sidebyside_choosing_lane");
    return t("history.exit_sidebyside_drafting");
  }

  if (session.agent === "introduce") {
    const st = (session.state ?? {}) as Partial<MatchmakerState>;
    if (st.currentPersonId) return t("history.exit_matchmaker_matched");
    return t("history.exit_matchmaker_searching");
  }

  if (session.agent === "reception") {
    return t("history.exit_reception");
  }

  switch (session.status) {
    case "matched":
      return t("sessions.status_matched");
    case "chatting":
      return t("sessions.status_chatting");
    case "waiting":
      return t("sessions.status_waiting");
    case "revoked":
      return t("sessions.status_revoked");
    default:
      return t("sessions.status_waiting");
  }
}

export function sessionHistorySubtitle(session: Session, t: TFn): string {
  return `${sessionAgentLabel(session.agent, t)} · ${sessionExitLabel(session, t)}`;
}
