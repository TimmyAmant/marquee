"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  createHouseholdMember,
  deleteHouseholdMember,
  listHouseholdMembersFor,
  updateHouseholdMember,
  type HouseholdMember as HouseholdMemberRow,
} from "@/lib/users/household";

// A type alias, not `export type { … }` — a re-export from a "use server"
// file is treated as a server action export and fails the build.
export type HouseholdMember = HouseholdMemberRow;

/** Admins see every account; members only ever see their own row (see
 * listHouseholdMembersFor, shared with GET /api/v1/users). */
export async function listHouseholdMembers(): Promise<HouseholdMember[]> {
  const session = await auth();
  if (!session?.user) return [];
  return listHouseholdMembersFor({ userId: session.user.id, isAdmin: session.user.role === "admin" });
}

export type CreateUserState = { error?: string; success?: boolean };

/** Adding another household member's account — the only way to create an
 * account once initial setup is done, since there's no public signup page. */
export async function createUserAction(
  _prevState: CreateUserState | undefined,
  formData: FormData,
): Promise<CreateUserState> {
  const admin = await requireAdmin("Only the admin can add household members.");
  if (!admin.ok) return { error: admin.error };

  const result = await createHouseholdMember({
    username: formData.get("username"),
    password: formData.get("password"),
    displayName: formData.get("displayName") || undefined,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/settings");
  return { success: true };
}

export type UpdateMemberState = { error?: string; success?: boolean };

/** Edits a household member's username/name, and resets their password if a
 * new one is given. Members may only edit their own account; only the admin
 * may edit anyone else's (see updateHouseholdMember). */
export async function updateHouseholdMemberAction(
  _prevState: UpdateMemberState | undefined,
  formData: FormData,
): Promise<UpdateMemberState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };

  const isAdmin = session.user.role === "admin";
  const result = await updateHouseholdMember(
    { userId: session.user.id, isAdmin },
    {
      userId: formData.get("userId"),
      username: formData.get("username"),
      password: formData.get("password") || undefined,
      displayName: formData.get("displayName") || undefined,
      // The edit form always submits both checkboxes for the admin (an
      // unchecked box is simply absent from the form data).
      ...(isAdmin
        ? {
            autoApproveMovies: formData.get("autoApproveMovies") === "on",
            autoApproveTv: formData.get("autoApproveTv") === "on",
          }
        : {}),
    },
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/settings");
  return { success: true };
}

export type DeleteUserState = { error?: string; success?: boolean };

/** Removes a household member's account entirely — admin-only. */
export async function deleteUserAction(
  _prevState: DeleteUserState | undefined,
  formData: FormData,
): Promise<DeleteUserState> {
  const admin = await requireAdmin("Only the admin can remove household members.");
  if (!admin.ok) return { error: admin.error };

  const result = await deleteHouseholdMember(admin.userId, String(formData.get("userId") || ""));
  if (!result.ok) return { error: result.error };

  revalidatePath("/settings");
  return { success: true };
}
