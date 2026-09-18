import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { encode as defaultEncode } from "next-auth/jwt";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getClientIp } from "@/lib/rate-limit";
import { authenticateWithPassword } from "@/lib/auth/password-login";

const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_MAX_AGE = 60 * 60 * 24; // 1 day when "keep me signed in" is unchecked

export class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt", maxAge: REMEMBER_MAX_AGE },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        remember: { label: "Remember me", type: "text" },
      },
      authorize: async (credentials, request) => {
        const username = typeof credentials?.username === "string" ? credentials.username : undefined;
        const password =
          typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!username || !password) return null;

        // Shared with POST /api/v1/auth/login — same rate-limit buckets.
        const result = await authenticateWithPassword(username, password, getClientIp(request));
        if (!result.ok) {
          if (result.reason === "rate_limited") throw new RateLimitedSignin();
          return null;
        }
        const { user } = result;

        return {
          id: user.id,
          username: user.username,
          name: user.displayName ?? undefined,
          rememberMe: credentials?.remember === "on",
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.username = user.username;
        token.rememberMe = user.rememberMe ?? false;
        token.role = user.role;
        token.signedInAt = Date.now();
        return token;
      }
      if (!token.userId) return token;

      // Checked on every request rather than trusted from the 30-day JWT:
      // a removed member, or anyone signed in before their password was
      // changed, loses their browser session right away (returning null
      // clears the cookie) — the same moment their API tokens are revoked.
      // Role is read fresh here too, since it can change after sign-in
      // (promotion, demotion, the admin-pinning migration).
      const [row] = await db
        .select({ role: users.role, passwordChangedAt: users.passwordChangedAt })
        .from(users)
        .where(eq(users.id, token.userId as string))
        .limit(1);
      if (!row) return null;
      // Tokens from before this field existed have no signedInAt; fall back
      // to when the JWT was issued.
      const signedInAt =
        typeof token.signedInAt === "number" ? token.signedInAt : (token.iat ?? 0) * 1000;
      if (row.passwordChangedAt && row.passwordChangedAt.getTime() > signedInAt) return null;
      token.role = row.role;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
        session.user.username = token.username as string;
        session.user.role = (token.role as typeof session.user.role) ?? "member";
      }
      return session;
    },
  },
  jwt: {
    encode: async (params) => {
      if (!params.token) return defaultEncode(params);
      const maxAge = params.token.rememberMe === false ? DEFAULT_MAX_AGE : REMEMBER_MAX_AGE;
      return defaultEncode({ ...params, maxAge });
    },
  },
});
