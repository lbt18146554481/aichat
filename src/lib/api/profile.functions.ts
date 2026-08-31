import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { profiles } from "../db/schema";
import { getSessionUser } from "../db/session.server";
import { EMPTY_PROFILE, type Profile } from "../profile-shape";

function asProfile(data: unknown): Profile {
  if (!data || typeof data !== "object") return { ...EMPTY_PROFILE };
  return { ...EMPTY_PROFILE, ...(data as Profile) };
}

export const getProfileFn = createServerFn({ method: "GET" }).handler(async (): Promise<Profile> => {
  const user = await getSessionUser();
  if (!user) return { ...EMPTY_PROFILE };
  const db = getDb();
  const rows = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  return asProfile(rows[0]?.data);
});

export const saveProfileFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ profile: z.record(z.unknown()) }))
  .handler(async ({ data }): Promise<Profile> => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");
    const profile = asProfile(data.profile);
    const db = getDb();
    await db
      .insert(profiles)
      .values({ userId: user.id, data: profile as unknown as Record<string, unknown>, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { data: profile as unknown as Record<string, unknown>, updatedAt: new Date() },
      });
    return profile;
  });
