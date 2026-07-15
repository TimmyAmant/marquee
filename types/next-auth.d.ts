import type { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    rememberMe?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    rememberMe?: boolean;
  }
}
