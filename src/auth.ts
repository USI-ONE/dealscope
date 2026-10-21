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
import { ipFromRequest, rateLimit } from "@/lib/security/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

// Compared against when the email has no account, so a miss costs the
// same time as a wrong password (no account enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
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
      async authorize(rawCredentials, request) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const email = parsed.data.email.trim().toLowerCase();
        const password = parsed.data.password;

        // Brute-force protection: per account and per network.
        const ip = ipFromRequest(request);
        const [byEmail, byIp] = await Promise.all([
          rateLimit(`signin:email:${email}`, 10, 15 * 60),
          rateLimit(`signin:ip:${ip}`, 50, 15 * 60),
        ]);
        if (!byEmail.ok || !byIp.ok) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });
        const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !user.passwordHash || !ok) return null;

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
          pwdAt: user.passwordSetAt?.getTime() ?? 0,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        // When the password was set at sign-in; a later change revokes this session.
        token.pwdAt = (user as { pwdAt?: number }).pwdAt ?? 0;
      }
      // After the user changes their own password the server refreshes the
      // stamp from the database (never from client-supplied data).
      if (trigger === "update" && token.id) {
        const fresh = await db.query.users.findFirst({
          where: eq(users.id, token.id as string),
          columns: { passwordSetAt: true },
        });
        token.pwdAt = fresh?.passwordSetAt?.getTime() ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      (session as { pwdAt?: number }).pwdAt = typeof token.pwdAt === "number" ? token.pwdAt : undefined;
      return session;
    },
  },
});
