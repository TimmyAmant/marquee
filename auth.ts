import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { encode as defaultEncode } from "next-auth/jwt";
import { verify } from "argon2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { isRateLimited, recordFailedAttempt, getClientIp } from "@/lib/rate-limit";

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
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: { label: "Remember me", type: "text" },
      },
      authorize: async (credentials, request) => {
        const email = typeof credentials?.email === "string" ? credentials.email : undefined;
        const password =
          typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!email || !password) return null;

        const ip = getClientIp(request);
        const emailKey = `login:email:${email.toLowerCase()}`;
        const ipKey = `login:ip:${ip}`;
        const windowMs = 15 * 60 * 1000;

        if (isRateLimited(emailKey, 5) || isRateLimited(ipKey, 20)) {
          throw new RateLimitedSignin();
        }

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user || !user.passwordHash) {
          recordFailedAttempt(emailKey, windowMs);
          recordFailedAttempt(ipKey, windowMs);
          return null;
        }

        const valid = await verify(user.passwordHash, password);
        if (!valid) {
          recordFailedAttempt(emailKey, windowMs);
          recordFailedAttempt(ipKey, windowMs);
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.displayName ?? undefined,
          rememberMe: credentials?.remember === "on",
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.rememberMe = user.rememberMe ?? false;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
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
