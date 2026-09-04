import { buildSeedPeople } from "@/lib/people-seed.data";

/** In-memory pool for unit tests (same records as db:seed). */
export const TEST_PEOPLE_POOL = buildSeedPeople();
