"use server";

/**
 * Invitation flow:
 *  1. Owner clicks Invite → createInvitation inserts a memberInvitations row
 *     and sends an email via Resend. The row's UUID id is the
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
  organizations,
  users,
} from "@/db/schema";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from "@/lib/auth-password";
import { sendInvitationAcceptedEmail, sendInvitationEmail } from "@/lib/email/invitations";
import { isEmailConfigured } from "@/lib/email/graph";
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


type InviteOutcome = { email: string; status: "sent" | "email_failed" | "skipped"; detail?: string };

/** Does this address already have a DealScope login (any organization)? */
async function hasLogin(email: string) {
  const u = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${email}`,
    columns: { id: true, passwordHash: true },
  });
  return { user: u ?? null, existingAccount: !!u?.passwordHash };
}

/** Send (or re-send) one invitation and record the outcome on its row. */
async function deliver(
  inv: { id: string; email: string; role: string; note: string | null; emailSendAttemptCount: number | null },
  expiresAt: Date,
  ctx: { user: { name: string | null; email: string }; organization: { name: string } },
  reminder: boolean,
): Promise<string | null> {
  const attempts = (inv.emailSendAttemptCount ?? 0) + 1;
  try {
    const { existingAccount } = await hasLogin(inv.email);
    await sendInvitationEmail({
      to: inv.email,
      inviterName: ctx.user.name ?? ctx.user.email,
      inviterEmail: ctx.user.email,
      orgName: ctx.organization.name,
      role: inv.role,
      note: inv.note,
      token: inv.id,
      expiresAt,
      existingAccount,
      reminder,
    });
    await db
      .update(memberInvitations)
      .set({ expiresAt, lastEmailSentAt: new Date(), emailSendAttemptCount: attempts, lastEmailError: null, updatedAt: new Date() })
      .where(eq(memberInvitations.id, inv.id));
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Email failed to send";
    console.error("[invite-email]", e);
    await db
      .update(memberInvitations)
      .set({ emailSendAttemptCount: attempts, lastEmailError: msg.slice(0, 1000), updatedAt: new Date() })
      .where(eq(memberInvitations.id, inv.id));
    return msg;
  }
}

/* ============================================================================
 * CREATE — one or more addresses at once
 * ========================================================================== */
const createSchema = z.object({
  emails: z.array(z.string().trim().email().max(200)).min(1).max(50),
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
    const note = parsedInput.note?.trim() || null;
    const emails = [...new Set(parsedInput.emails.map((e) => e.trim().toLowerCase()))];
    const results: InviteOutcome[] = [];

    for (const email of emails) {
      // Already an active member here -> nothing to invite.
      const { user } = await hasLogin(email);
      if (user) {
        const m = await db.query.memberships.findFirst({
          where: and(eq(memberships.userId, user.id), eq(memberships.organizationId, ctx.organization.id)),
          columns: { isActive: true },
        });
        if (m?.isActive) {
          results.push({ email, status: "skipped", detail: "already a member" });
          continue;
        }
      }

      // One live invitation per address: replace any pending one.
      await db
        .delete(memberInvitations)
        .where(
          and(
            eq(memberInvitations.organizationId, ctx.organization.id),
            sql`lower(${memberInvitations.email}) = ${email}`,
            isNull(memberInvitations.consumedAt),
          ),
        );

      const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
      const [created] = await db
        .insert(memberInvitations)
        .values({
          organizationId: ctx.organization.id,
          email,
          role: parsedInput.role,
          financeAccess: parsedInput.financeAccess,
          invitedByMembershipId: ctx.membership.id,
          expiresAt,
          note,
        })
        .returning();

      const err = await deliver(created, expiresAt, ctx, false);
      results.push(err ? { email, status: "email_failed", detail: err } : { email, status: "sent" });
    }

    revalidatePath("/settings/members");
    return { ok: true, results };
  });

/* ============================================================================
 * RESEND — also renews the expiry, so an expired invite can be revived
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
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const err = await deliver(inv, expiresAt, ctx, !!inv.lastEmailSentAt);
    revalidatePath("/settings/members");
    if (err) throw new PublicError(`Email failed to send: ${err}. Use “Copy link” to share it another way.`);
    return { ok: true, expiresAt };
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
  /** Required for new accounts; ignored when the person already has one. */
  name: z.string().max(200).optional().default(""),
  password: z.string().min(1).max(200),
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

    const email = inv.email.trim().toLowerCase();
    const existing = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${email}`,
    });

    // New logins must meet the password policy and give a name; existing
    // logins only prove who they are with their current password.
    if (!existing?.passwordHash) {
      if (!parsedInput.name.trim()) throw new PublicError("Please enter your name.");
      const policyError = validatePasswordStrength(parsedInput.password);
      if (policyError) throw new PublicError(policyError);
    }
    const passwordHash = existing?.passwordHash ? "" : await hashPassword(parsedInput.password);

    let userId: string;
    if (existing?.passwordHash) {
      // Already has an account: the invite link alone must not be able to
      // replace their password. They prove it's them with the current one.
      if (!(await verifyPassword(parsedInput.password, existing.passwordHash))) {
        throw new PublicError(
          "That isn't the password for this DealScope account. Try again, or use “Forgot password” on the sign-in page.",
        );
      }
      userId = existing.id;
    } else if (existing) {
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

    // Tell the inviter (best effort — never blocks the acceptance).
    if (isEmailConfigured() && inv.invitedByMembershipId) {
      try {
        const [inviter] = await db
          .select({ email: users.email, name: users.name })
          .from(memberships)
          .innerJoin(users, eq(memberships.userId, users.id))
          .where(eq(memberships.id, inv.invitedByMembershipId));
        const org = await db.query.organizations.findFirst({
          where: eq(organizations.id, inv.organizationId),
          columns: { name: true },
        });
        const me = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true } });
        if (inviter && inviter.email.toLowerCase() !== email) {
          await sendInvitationAcceptedEmail({
            to: inviter.email,
            inviterName: inviter.name,
            memberName: me?.name ?? "",
            memberEmail: email,
            orgName: org?.name ?? "DealScope",
            role: inv.role,
          });
        }
      } catch (e) {
        console.error("[invite-accepted-email]", e);
      }
    }

    return { ok: true, email, existingAccount: !!existing?.passwordHash };
  });
