import type { DefaultSession, DefaultUser } from "next-auth";
import type { UserRole } from "@/lib/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    username?: string;
    rememberMe?: boolean;
    role?: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    username?: string;
    rememberMe?: boolean;
    role?: UserRole;
  }
}
