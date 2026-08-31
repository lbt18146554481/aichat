// Public surface of the data layer for UI code.
//
// UI imports hooks from here; it never imports an adapter or src/lib storage
// module directly. That single rule is what keeps the swap to a real backend
// cheap.

export { dataKeys } from "./internal";
export { useProfile, useSaveProfile } from "./use-profile";
export {
  useConnections,
  useConnection,
  useConnectionActions,
  useTyping,
  hasUnseenIn,
} from "./use-connections";

export { useSavedWishes, useSavedPeople, useSavedActions } from "./use-saved";
export { useSessions, useSessionActions, useSessionLookup } from "./use-sessions";
export {
  useSession,
  useAuthActions,
  useAccountActions,
  useBlocklist,
  useModerationActions,
} from "./use-account";
export {
  useMyIntents,
  useIntentPool,
  useIntent,
  useIntentLookup,
  useIntentActions,
} from "./use-intents";
export {
  useValidateInvite,
  useMyInvites,
  useRemainingInvites,
  useInviteActions,
} from "./use-invites";
export { usePerson, usePeopleLookup } from "./use-people";
export { useAgentMemory, useUnderstanding } from "./use-agent";
