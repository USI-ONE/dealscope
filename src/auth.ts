/**
 * Auth.js v5 — standalone email + password authentication.
 *
 * No third-party identity provider. Users are created from
 * /settings/members by an owner; the owner sets the initial password
 * (or the system generates one) and shares it with the user. Users
 * can change their own password from /settings/account.
 *
 * Session strategy: JWT (signed with AUTH_SECRET). The DB-backed
 * `sessions` / `accounts` / `verification_tokens` tables are no
 * longer used by the auth flow but stay in the schema as inert
 * artifacts of the previous SSO setup.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  debug: process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "1",
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  logger: {
    error(error) {
      console.error("[auth.error]", error);
    },
    warn(code) {
      console.warn("[auth.warn]", code);
    },
  },
  providers: [
    Credentials({
      name: "Email + password",
      credentials: {
        email: { label: "Email or Username", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const email = parsed.data.email.trim().toLowerCase();
        const password = parsed.data.password;

        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });
        if (!user || !user.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        const membership = await db.query.memberships.findFirst({
          where: and(
            eq(memberships.userId, user.id),
            eq(memberships.isActive, true),
          ),
        });
        if (!membership) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
