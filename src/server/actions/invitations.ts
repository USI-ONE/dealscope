"use server";

/**
 * Invitation flow:
 *  1. Owner clicks Invite → createInvitation inserts a memberInvitations row
 *     and sends an email via Microsoft Graph. The row's UUID id is the
 *     invitation token (122 bits of entropy — plenty for a single-use,
 *     time-limited admin link).
 *  2. Recipient clicks /invite/[token] → accept page renders.
 *  3. Recipient sets a password → acceptInvitation creates the user (if
 *     they didn't already exist) and the membership, marks the
 *     invitation consumed, and the user can then sign in.
 *
 * resendInvitation re-sends the same email + bumps lastEmailSentAt /
 * emailSendAttemptCount. revokeInvitation hard-deletes a row so the link
 * can no longer be used.
 */
import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  memberInvitations,
  memberships,
  users,
} from "@/db/schema";
import {
  hashPassword,
  validatePasswordStrength,
} from "@/lib/auth-password";
import { sendInvitationEmail } from "@/lib/email/invitations";
import { appBaseUrl } from "@/lib/email/account";
import {
  action,
  authedAction,
  authorize,
  PublicError,
} from "@/server/safe-action";

const roleSchema = z.enum([
  "owner",
  "executive",
  "manager",
  "member",
  "external_diligence",
]);

/** How long an invitation link is valid before it stops working. */
const INVITATION_TTL_DAYS = 14;

/**
 * Resolve the base URL we should put in the invitation email.
 *
 *  - In production on Vercel, prefer AUTH_URL (set by us / Vercel).
 *  - In dev, fall back to http://localhost:3000.
 *
 * Trailing slashes are stripped by sendInvitationEmail.
 */
function inviteBaseUrl(): string {
  return appBaseUrl();
}

/* ============================================================================
 * CREATE
 * ========================================================================== */
const createSchema = z.object({
  email: z.string().email().max(200),
  role: roleSchema.default("member"),
  financeAccess: z.boolean().default(false),
  note: z.string().max(2000).optional().nullable(),
});

export const createInvitation = authedAction
  .schema(createSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "membership");
    if (ctx.membership.role !== "owner") {
      throw new PublicError("Only owners can invite users.");
    }
    const email = parsedInput.email.trim().toLowerCase();

    // If the user already exists AND already has an active membership in
    // this org, point the owner at the existing-member controls instead
    // of creating a duplicate invite.
    const existingUser = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${email}`,
    });
    if (existingUser) {
      const existingMembership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.userId, existingUser.id),
          eq(memberships.organizationId, ctx.organization.id),
          eq(memberships.isActive, true),
        ),
      });
      if (existingMembership) {
        throw new PublicError(
          `${email} is already a member of this organization. Use the existing-member controls instead.`,
        );
      }
    }

    // Soft-revoke any pending invitations for this email in this org —
    // only one live invite per email at a time.
    await db
      .delete(memberInvitations)
      .where(
        and(
          eq(memberInvitations.organizationId, ctx.organization.id),
          sql`lower(${memberInvitations.email}) = ${email}`,
          isNull(memberInvitations.consumedAt),
        ),
      );

    const expiresAt = new Date(
      Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const [created] = await db
      .insert(memberInvitations)
      .values({
        organizationId: ctx.organization.id,
        email,
        role: parsedInput.role,
        financeAccess: parsedInput.financeAccess,
        invitedByMembershipId: ctx.membership.id,
        expiresAt,
        note: parsedInput.note?.trim() || null,
      })
      .returning();

    // Send the email. Record success/failure on the row so the owner
    // can see what's happening + retry.
    try {
      await sendInvitationEmail({
        to: email,
        inviterName: ctx.user.name ?? ctx.user.email,
        role: parsedInput.role,
        note: parsedInput.note?.trim() || null,
        baseUrl: inviteBaseUrl(),
        token: created.id,
        expiresAt,
      });
      await db
        .update(memberInvitations)
        .set({
          lastEmailSentAt: new Date(),
          emailSendAttemptCount: 1,
          lastEmailError: null,
          updatedAt: new Date(),
        })
        .where(eq(memberInvitations.id, created.id));
    } catch (e) {
      await db
        .update(memberInvitations)
        .set({
          emailSendAttemptCount: 1,
          lastEmailError: (e as Error).message.slice(0, 1000),
          updatedAt: new Date(),
        })
        .where(eq(memberInvitations.id, created.id));
      throw new PublicError(
        `Invitation was saved but the email failed to send: ${(e as Error).message}. Use Resend on the row to try again.`,
      );
    }

    revalidatePath("/settings/members");
    return { ok: true, id: created.id, email };
  });

/* ============================================================================
 * RESEND
 * ========================================================================== */
export const resendInvitation = authedAction
  .schema(z.object({ invitationId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "membership");
    if (ctx.membership.role !== "owner") {
      throw new PublicError("Only owners can resend invitations.");
    }
    const inv = await db.query.memberInvitations.findFirst({
      where: and(
        eq(memberInvitations.id, parsedInput.invitationId),
        eq(memberInvitations.organizationId, ctx.organization.id),
      ),
    });
    if (!inv) throw new PublicError("Invitation not found.");
    if (inv.consumedAt) {
      throw new PublicError("That invitation has already been accepted.");
    }
    // Extend the expiry on resend so a stale invitation can be revived.
    const expiresAt = new Date(
      Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    try {
      await sendInvitationEmail({
        to: inv.email,
        inviterName: ctx.user.name ?? ctx.user.email,
        role: inv.role,
        note: inv.note ?? null,
        baseUrl: inviteBaseUrl(),
        token: inv.id,
        expiresAt,
      });
      await db
        .update(memberInvitations)
        .set({
          expiresAt,
          lastEmailSentAt: new Date(),
          emailSendAttemptCount: (inv.emailSendAttemptCount ?? 0) + 1,
          lastEmailError: null,
          updatedAt: new Date(),
        })
        .where(eq(memberInvitations.id, inv.id));
    } catch (e) {
      await db
        .update(memberInvitations)
        .set({
          emailSendAttemptCount: (inv.emailSendAttemptCount ?? 0) + 1,
          lastEmailError: (e as Error).message.slice(0, 1000),
          updatedAt: new Date(),
        })
        .where(eq(memberInvitations.id, inv.id));
      throw new PublicError(
        `Resend failed: ${(e as Error).message}`,
      );
    }

    revalidatePath("/settings/members");
    return { ok: true };
  });

/* ============================================================================
 * REVOKE
 * ========================================================================== */
export const revokeInvitation = authedAction
  .schema(z.object({ invitationId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "membership");
    if (ctx.membership.role !== "owner") {
      throw new PublicError("Only owners can revoke invitations.");
    }
    await db
      .delete(memberInvitations)
      .where(
        and(
          eq(memberInvitations.id, parsedInput.invitationId),
          eq(memberInvitations.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/settings/members");
    return { ok: true };
  });

/* ============================================================================
 * ACCEPT (called from the public /invite/[token] page — unauthed)
 * ========================================================================== */
const acceptSchema = z.object({
  token: z.string().uuid(),
  name: z.string().min(1).max(200),
  password: z.string().min(12).max(200),
});

export const acceptInvitation = action
  .schema(acceptSchema)
  .action(async ({ parsedInput }) => {
    const inv = await db.query.memberInvitations.findFirst({
      where: eq(memberInvitations.id, parsedInput.token),
    });
    if (!inv) {
      throw new PublicError("Invitation not found.");
    }
    if (inv.consumedAt) {
      throw new PublicError("This invitation has already been accepted.");
    }
    if (inv.expiresAt && inv.expiresAt.getTime() < Date.now()) {
      throw new PublicError(
        "This invitation has expired. Ask the owner to send a fresh invite.",
      );
    }

    const policyError = validatePasswordStrength(parsedInput.password);
    if (policyError) throw new PublicError(policyError);

    const email = inv.email.trim().toLowerCase();
    const passwordHash = await hashPassword(parsedInput.password);

    // Find or create the user. Update password + name on the way through.
    let userId: string;
    const existing = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${email}`,
    });
    if (existing) {
      await db
        .update(users)
        .set({
          name: parsedInput.name.trim() || existing.name,
          passwordHash,
          passwordSetAt: new Date(),
          // They just set their own password — don't force another change.
          mustChangePassword: false,
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
          mustChangePassword: false,
        })
        .returning();
      userId = created.id;
    }

    // Idempotent membership upsert: if a membership already exists for
    // this (org, user) — re-activate it with the invited role + finance
    // access. Otherwise create one.
    const existingMembership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, inv.organizationId),
      ),
    });
    if (existingMembership) {
      await db
        .update(memberships)
        .set({
          role: inv.role,
          financeAccess: inv.financeAccess,
          isActive: true,
          joinedAt: existingMembership.joinedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(memberships.id, existingMembership.id));
    } else {
      await db.insert(memberships).values({
        organizationId: inv.organizationId,
        userId,
        role: inv.role,
        financeAccess: inv.financeAccess,
        isActive: true,
        joinedAt: new Date(),
      });
    }

    // Mark invitation consumed.
    await db
      .update(memberInvitations)
      .set({
        consumedAt: new Date(),
        consumedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(eq(memberInvitations.id, inv.id));

    return { ok: true, email };
  });
