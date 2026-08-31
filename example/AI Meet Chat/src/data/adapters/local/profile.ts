// Local profile storage.

import * as profileStore from "@/lib/profile";
import type { ProfileRepo } from "@/data/ports";

// The legacy module has no change notification, so the adapter owns one.
const profileListeners = new Set<() => void>();

export const profile: ProfileRepo = {
  async load() {
    return profileStore.loadProfile();
  },
  async save(p) {
    profileStore.saveProfile(p);
    profileListeners.forEach((fn) => fn());
  },
  subscribe(fn) {
    profileListeners.add(fn);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "kindred:profile.v1") fn();
    };
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
    return () => {
      profileListeners.delete(fn);
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    };
  },
};
