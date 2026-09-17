import type { User } from "@/lib/api/types";
import type { UserRole } from "@/lib/db/schema";

export function userDto(user: { id: string; username: string; displayName: string | null; role: UserRole }, libraryOwnerId: string): User {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    libraryOwnerId,
  };
}
