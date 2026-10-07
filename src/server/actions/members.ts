"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import {
  generatePassword,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth-password";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import { isEmailConfigured } from "@/lib/email/graph";
import {
  issuePasswordToken,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from "@/lib/email/account";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  executive: "Executive",
  manager: "Manager",
  member: "Member",
  external_diligence: "External — Diligence only",
};

type EmailResult = { emailed: boolean; emailError: string | null };

/** Run an email send, reporting the outcome instead of throwing. */
async function trySend(send: () => Promise<void>): Promise<EmailResult> {
  if (!isEmailConfigured()) {
    return { emailed: false, emailError: "Email isn't configured (RESEND_API_KEY / INVITE_FROM_EMAIL)." };
  }
  try {
    await send();
    return { emailed: true, emailError: null };
  } catch (e) {
    console.error("[account-email]", e);
    return { emailed: false, emailError: e instanceof Error ? e.message : "Email failed to send" };
  }
}

const roleSchema = z.enum([
  "owner",
  "executive",
  "manager",
  "member",
  "external_diligence",
]);

/* ============================================================================
 * EXISTING MEMBER ADMIN — role / finance / activate / deactivate
 * ========================================================================== */
export const updateMembershipRole = authedAction
  .schema(
    z.object({
      membershipId: z.string().uuid(),
      role: roleSchema,
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "membership");
    if (ctx.membership.role !== "owner") {
      throw new PublicError("Only owners can change member roles");
    }
    if (parsedInput.membershipId === ctx.membership.id) {
      throw new PublicError("You cannot change your own role");
    }
    await db
      .update(memberships)
      .set({ role: parsedInput.role, updatedAt: new Date() })
      .where(
        and(
          eq(memberships.id, parsedInput.membershipId),
          eq(memberships.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/settings/members");
    return { ok: true };
  });

export const updateMembershipFinanceAccess = authedAction
  .schema(
    z.object({
      membershipId: z.string().uuid(),
      financeAccess: z.boolean(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "membership");
    if (ctx.membership.role !== "owner") {
      throw new PublicError("Only owners can change finance access");
    }
    await db
      .update(memberships)
      .set({ financeAccess: parsedInput.financeAccess, updatedAt: new Date() })
      .where(
        and(
          eq(memberships.id, parsedInput.membershipId),
          eq(memberships.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/settings/members");
    return { ok: true };
  });

export const setMembershipActive = authedAction
  .schema(
    z.object({
      membershipId: z.string().uuid(),
      isActive: z.boolean(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "membership");
    if (ctx.membership.role !== "owner") {
      throw new PublicError("Only owners can deactivate members");
    }
    if (parsedInput.membershipId === ctx.membership.id && !parsedInput.isActive) {
      throw new PublicError("You cannot deactivate yourself");
    }
    await db
      .update(memberships)
      .set({ isActive: parsedInput.isActive, updatedAt: new Date() })
      .where(
        and(
          eq(memberships.id, parsedInput.membershipId),
          eq(memberships.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/settings/members");
    return { ok: true };
  });

/* ============================================================================
 * USER CREATION — owner manually creates an email + password account.
 *
 * Creates the `users` row + a `memberships` row in the active org in
 * one go. Returns the plaintext password so the owner can share it
 * out-of-band; the password is never stored in plaintext server-side.
 * ========================================================================== */
const createUserSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(200),
  role: roleSchema,
  financeAccess: z.boolean().default(false),
  /** Owner-supplied password. If omitted, the server generates one. */
  password: z.string().max(200).optional().nullable(),
  /** Force the user to change the password on first sign-in. */
  mustChangePassword: z.boolean().default(true),
  /** Email the user a welcome message with a set-your-password link. */
  sendWelcome: z.boolean().default(true),
});

export const createUserWithPassword = authedAction
  .schema(createUserSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "membership");
    if (ctx.membership.role !== "owner") {
      throw new PublicError("Only owners can create user accounts");
    }
    const email = parsedInput.email.trim().toLowerCase();

    // Owner-supplied password (if any) must meet the policy.
    let plainPassword = parsedInput.password ?? null;
    if (plainPassword) {
      const policyError = validatePasswordStrength(plainPassword);
      if (policyError) throw new PublicError(policyError);
    } else {
      plainPassword = generatePassword();
    }
    const passwordHash = await hashPassword(plainPassword);

    // Find or create the user, then ensure they have a membership in
    // the active org. If they already have one, refuse — owner should
    // use the existing-member controls instead.
    const existing = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${email}`,
    });

    let userId: string;
    if (existing) {
      const existingMembership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.userId, existing.id),
          eq(memberships.organizationId, ctx.organization.id),
        ),
      });
      if (existingMembership) {
        throw new PublicError(
          `${email} is already a member. Use the controls in the table to change role / finance / activation, or use Reset Password to set a new password.`,
        );
      }
      // User exists but has no membership in this org — adopt them and
      // (re)set their password.
      await db
        .update(users)
        .set({
          name: parsedInput.name.trim() || existing.name,
          passwordHash,
          passwordSetAt: new Date(),
          mustChangePassword: parsedInput.mustChangePassword,
        })
        .where(eq(users.id, existing.id));
      userId = existing.id;
    } else {
      const [created] = await db
        .insert(users)
        .values({
          email,
          name: parsedInput.name.trim(),
          passwordHash,
          passwordSetAt: new Date(),
          mustChangePassword: parsedInput.mustChangePassword,
        })
        .returning();
      userId = created.id;
    }

    await db.insert(memberships).values({
      organizationId: ctx.organization.id,
      userId,
      role: parsedInput.role,
      financeAccess: parsedInput.financeAccess,
      joinedAt: new Date(),
    });

    const mail: EmailResult = parsedInput.sendWelcome
      ? await trySend(async () => {
          const { link, expires } = await issuePasswordToken(email, 7 * 24 * 60 * 60 * 1000);
          await sendWelcomeEmail({
            to: email,
            name: parsedInput.name.trim(),
            inviterName: ctx.user.name ?? ctx.user.email,
            orgName: ctx.organization.name,
            roleLabel: ROLE_LABEL[parsedInput.role] ?? parsedInput.role,
            link,
            expires,
          });
        })
      : { emailed: false, emailError: null };

    revalidatePath("/settings/members");
    // Return the plaintext so the UI can show it once for the owner to
    // copy. It's never stored in plaintext anywhere.
    return {
      ok: true,
      email,
      generatedPassword: plainPassword,
      mustChangePassword: parsedInput.mustChangePassword,
      ...mail,
    };
  });

/* ============================================================================
 * PASSWORD RESET — owner resets a member's password.
 * ========================================================================== */
const resetPasswordSchema = z.object({
  membershipId: z.string().uuid(),
  /** If omitted, the server generates a new password. */
  password: z.string().max(200).optional().nullable(),
  mustChangePassword: z.boolean().default(true),
  /** Also email the user a link to choose their own new password. */
  emailUser: z.boolean().default(true),
});

export const resetUserPassword = authedAction
  .schema(resetPasswordSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "membership");
    if (ctx.membership.role !== "owner") {
      throw new PublicError("Only owners can reset passwords");
    }
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.id, parsedInput.membershipId),
        eq(memberships.organizationId, ctx.organization.id),
      ),
    });
    if (!membership) throw new PublicError("Member not found");

    let plain = parsedInput.password ?? null;
    if (plain) {
      const err = validatePasswordStrength(plain);
      if (err) throw new PublicError(err);
    } else {
      plain = generatePassword();
    }
    const hash = await hashPassword(plain);

    await db
      .update(users)
      .set({
        passwordHash: hash,
        passwordSetAt: new Date(),
        mustChangePassword: parsedInput.mustChangePassword,
      })
      .where(eq(users.id, membership.userId));

    let mail: EmailResult = { emailed: false, emailError: null };
    if (parsedInput.emailUser) {
      const target = await db.query.users.findFirst({ where: eq(users.id, membership.userId) });
      if (target) {
        mail = await trySend(async () => {
          const { link, expires } = await issuePasswordToken(target.email, 24 * 60 * 60 * 1000);
          await sendPasswordResetEmail({ to: target.email, link, expires, byAdmin: ctx.user.name ?? ctx.user.email });
        });
      }
    }

    revalidatePath("/settings/members");
    return {
      ok: true,
      generatedPassword: plain,
      mustChangePassword: parsedInput.mustChangePassword,
      ...mail,
    };
  });

/* ============================================================================
 * SELF-SERVICE PASSWORD CHANGE
 * ========================================================================== */
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(1).max(200),
    confirmPassword: z.string().min(1).max(200),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New password and confirmation do not match.",
    path: ["confirmPassword"],
  });

export const changeMyPassword = authedAction
  .schema(changePasswordSchema)
  .action(async ({ parsedInput, ctx }) => {
    const policyError = validatePasswordStrength(parsedInput.newPassword);
    if (policyError) throw new PublicError(policyError);

    const me = await db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
    });
    if (!me || !me.passwordHash) {
      throw new PublicError("Account is not configured for password sign-in");
    }
    const ok = await verifyPassword(parsedInput.currentPassword, me.passwordHash);
    if (!ok) {
      throw new PublicError("Current password is incorrect");
    }
    const hash = await hashPassword(parsedInput.newPassword);
    await db
      .update(users)
      .set({
        passwordHash: hash,
        passwordSetAt: new Date(),
        mustChangePassword: false,
      })
      .where(eq(users.id, me.id));
    return { ok: true };
  });

/* ============================================================================
 * Touch organizations import to satisfy bundlers — table is consulted
 * indirectly via memberships joins elsewhere; explicit reference avoids
 * tree-shake oddness during dev.
 * ========================================================================== */
void organizations;
