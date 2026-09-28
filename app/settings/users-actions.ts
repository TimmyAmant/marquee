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
import { PERMISSIONS } from "@/lib/users/permissions";
import { getT } from "@/lib/i18n/server";

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
  const t = await getT();
  const admin = await requireAdmin(t("settings.onlyAdminAddsMembers"));
  if (!admin.ok) return { error: admin.error };

  const result = await createHouseholdMember({
    username: formData.get("username"),
    password: formData.get("password"),
    displayName: formData.get("displayName") || undefined,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/settings", "layout");
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
  if (!session?.user) return { error: (await getT())("settings.signInRequired") };

  const isAdmin = session.user.role === "admin";
  const result = await updateHouseholdMember(
    { userId: session.user.id, isAdmin },
    {
      userId: formData.get("userId"),
      username: formData.get("username"),
      password: formData.get("password") || undefined,
      currentPassword: formData.get("currentPassword") || undefined,
      displayName: formData.get("displayName") || undefined,
      ...(isAdmin
        ? {
            // Every switch, on another member's row (the form leaves them
            // out on the admin's own); an unchecked box is simply absent.
            ...(formData.get("permissionsForm") === "1"
              ? {
                  permissions: Object.fromEntries(
                    PERMISSIONS.map((permission) => [permission, formData.get(`perm:${permission}`) === "on"]),
                  ),
                }
              : {}),
            ...(formData.has("movieQuotaLimit")
              ? {
                  movieQuotaLimit: formData.get("movieQuotaLimit"),
                  movieQuotaDays: formData.get("movieQuotaDays"),
                  tvQuotaLimit: formData.get("tvQuotaLimit"),
                  tvQuotaDays: formData.get("tvQuotaDays"),
                }
              : {}),
          }
        : {}),
    },
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/settings", "layout");
  return { success: true };
}

export type DeleteUserState = { error?: string; success?: boolean };

/** Removes a household member's account entirely — admin-only. */
export async function deleteUserAction(
  _prevState: DeleteUserState | undefined,
  formData: FormData,
): Promise<DeleteUserState> {
  const t = await getT();
  const admin = await requireAdmin(t("settings.onlyAdminRemovesMembers"));
  if (!admin.ok) return { error: admin.error };

  const result = await deleteHouseholdMember(admin.userId, String(formData.get("userId") || ""));
  if (!result.ok) return { error: result.error };

  revalidatePath("/settings", "layout");
  return { success: true };
}
