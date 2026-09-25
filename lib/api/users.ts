import type { User } from "@/lib/api/types";
import type { UserRole } from "@/lib/db/schema";
import { avatarPath } from "@/lib/users/avatar-path";

export function userDto(
  user: { id: string; username: string; displayName: string | null; role: UserRole; avatarUpdatedAt: Date | null },
  libraryOwnerId: string,
): User {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    libraryOwnerId,
    avatarUrl: avatarPath(user, "/api/v1"),
  };
}
