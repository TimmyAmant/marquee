import type { User } from "@/lib/api/types";
import type { UserRole } from "@/lib/db/schema";
import { avatarPath } from "@/lib/users/avatar-path";
import { permissionMap } from "@/lib/users/permissions";

export function userDto(
  user: {
    id: string;
    username: string;
    displayName: string | null;
    role: UserRole;
    permissions: string[];
    avatarUpdatedAt: Date | null;
  },
  libraryOwnerId: string,
): User {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    permissions: permissionMap(user),
    libraryOwnerId,
    avatarUrl: avatarPath(user, "/api/v1"),
  };
}
