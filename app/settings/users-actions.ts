"use server";

import { hash } from "argon2";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/schema";

export type HouseholdMember = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: Date;
};

export async function listHouseholdMembers(): Promise<HouseholdMember[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
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
  if (session.user.role !== "admin") return { error: "Only the admin can add household members." };

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

const updateMemberSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  displayName: z.string().max(80).optional(),
});

export type UpdateMemberState = { error?: string; success?: boolean };

/** Edits a household member's email/name, and resets their password if a
 * new one is given — the only account-recovery path here, since there's no
 * email-based "forgot password" flow. Members may only edit their own
 * account; only the admin may edit anyone else's (including promoting
 * password/email resets for a member who's locked out). */
export async function updateHouseholdMemberAction(
  _prevState: UpdateMemberState | undefined,
  formData: FormData,
): Promise<UpdateMemberState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };

  const targetUserId = formData.get("userId");
  if (session.user.role !== "admin" && targetUserId !== session.user.id) {
    return { error: "You can only edit your own account." };
  }

  const parsed = updateMemberSchema.safeParse({
    userId: formData.get("userId"),
    email: formData.get("email"),
    password: formData.get("password") || undefined,
    displayName: formData.get("displayName") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { userId, email, password, displayName } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing && existing.id !== userId) {
    return { error: "An account with that email already exists" };
  }

  await db
    .update(users)
    .set({
      email,
      displayName,
      ...(password ? { passwordHash: await hash(password) } : {}),
    })
    .where(eq(users.id, userId));

  revalidatePath("/settings");
  return { success: true };
}

export type DeleteUserState = { error?: string; success?: boolean };

/** Removes a household member's account entirely — admin-only. Their
 * favorites, requests, integration credentials, etc. cascade-delete with
 * them (see the users FK definitions in schema.ts). */
export async function deleteUserAction(
  _prevState: DeleteUserState | undefined,
  formData: FormData,
): Promise<DeleteUserState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };
  if (session.user.role !== "admin") return { error: "Only the admin can remove household members." };

  const userId = String(formData.get("userId") || "");
  if (!userId) return { error: "Invalid request." };
  if (userId === session.user.id) return { error: "You can't remove your own account." };

  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return { error: "Account not found." };
  if (target.role === "admin") return { error: "Can't remove the admin account." };

  await db.delete(users).where(eq(users.id, userId));

  revalidatePath("/settings");
  return { success: true };
}
