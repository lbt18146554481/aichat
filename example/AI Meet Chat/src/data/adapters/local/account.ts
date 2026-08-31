// Local auth + account lifecycle.

import * as authStore from "@/lib/auth";
import * as accountStore from "@/lib/account";
import type { AuthRepo } from "@/data/ports";

export const auth: AuthRepo = {
  async current() {
    return authStore.loadUser();
  },
  signIn: (input) => authStore.signIn(input),
  signUp: (input) => authStore.signUp(input),
  async signOut() {
    authStore.signOut();
  },
  async deleteAllData() {
    accountStore.clearAllUserData();
  },
  subscribe: (fn) => authStore.subscribe(fn),
};
