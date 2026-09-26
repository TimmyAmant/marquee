import type { DefaultSession, DefaultUser } from "next-auth";
import type { UserRole } from "@/lib/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: UserRole;
      /** The switches that are on (lib/users/permissions.ts) — ask can(). */
      permissions: string[];
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    username?: string;
    rememberMe?: boolean;
    role?: UserRole;
    /** Epoch ms of the password sign-in this token came from. */
    signedInAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    username?: string;
    rememberMe?: boolean;
    role?: UserRole;
    /** Read fresh from the database on every request, like role. */
    permissions?: string[];
    /** Epoch ms of the password sign-in this token came from. */
    signedInAt?: number;
  }
}
