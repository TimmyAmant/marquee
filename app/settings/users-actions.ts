"use server";

import { hash } from "argon2";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export type HouseholdMember = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
};

export async function listHouseholdMembers(): Promise<HouseholdMember[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));
}

const createUserSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1).max(80).optional(),
});

export type CreateUserState = { error?: string; success?: boolean };

/** Adding another household member's account — the only way to create an
 * account once initial setup is done, since there's no public signup page. */
export async function createUserAction(
  _prevState: CreateUserState | undefined,
  formData: FormData,
): Promise<CreateUserState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };

  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, password, displayName } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return { error: "An account with that email already exists" };
  }

  const passwordHash = await hash(password);
  await db.insert(users).values({ email, passwordHash, displayName });

  revalidatePath("/settings");
  return { success: true };
}
