export type ConnStatus = "sent" | "incoming" | "connected" | "faded";

export interface ChatMsg {
  id: string;
  from: "me" | "them";
  t: number;
  text: string;
}

export interface HelloFromMe {
  quotedMomentId: string | null;
  reply: string;
}

export interface HelloFromThem {
  quotedUserMomentPromptId: string;
  reply: string;
}

export interface Connection {
  id?: string;
  personId: string;
  status: ConnStatus;
  initiatedBy: "me" | "them";
  helloAt: number;
  connectedAt?: number;
  fadedAt?: number;
  lastSeenAt?: number;
  originSessionId?: string;
  fromMe?: HelloFromMe;
  fromThem?: HelloFromThem;
  messages: ChatMsg[];
}
