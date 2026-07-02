"use server";

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/db";
import {
  diligenceDialogueMessages,
  diligenceDialogueThreads,
  diligenceParties,
  diligencePartyInvitations,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import { isEmailConfigured, sendEmail } from "@/lib/email/graph";

/* ============================================================================
 * PARTIES
 * ========================================================================== */

export const createParty = authedAction
  .schema(
    z.object({
      engagementId: z.string().uuid(),
      name: z.string().min(1).max(200),
      role: z.enum(["acquirer", "target", "advisor", "lender", "other"]).default("target"),
      emailDomain: z.string().max(200).optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "diligence");
    const [party] = await db.insert(diligenceParties).values({
      organizationId: ctx.organization.id,
      engagementId: parsedInput.engagementId,
      name: parsedInput.name.trim(),
      role: parsedInput.role,
      emailDomain: parsedInput.emailDomain?.trim() || null,
      notes: parsedInput.notes?.trim() || null,
    }).returning();
    return { party };
  });

export const updateParty = authedAction
  .schema(
    z.object({
      partyId: z.string().uuid(),
      engagementId: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      role: z.enum(["acquirer", "target", "advisor", "lender", "other"]).optional(),
      emailDomain: z.string().max(200).optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    const { partyId, engagementId, ...updates } = parsedInput;
    await db
      .update(diligenceParties)
      .set({ ...updates, updatedAt: new Date() })
      .where(
        and(
          eq(diligenceParties.id, partyId),
          eq(diligenceParties.engagementId, engagementId),
          eq(diligenceParties.organizationId, ctx.organization.id),
        ),
      );
    return { ok: true };
  });

export const deleteParty = authedAction
  .schema(z.object({ partyId: z.string().uuid(), engagementId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "diligence");
    await db
      .delete(diligenceParties)
      .where(
        and(
          eq(diligenceParties.id, parsedInput.partyId),
          eq(diligenceParties.engagementId, parsedInput.engagementId),
          eq(diligenceParties.organizationId, ctx.organization.id),
        ),
      );
    return { ok: true };
  });

/* ============================================================================
 * PARTY INVITATIONS
 * ========================================================================== */

export const invitePartyMember = authedAction
  .schema(
    z.object({
      engagementId: z.string().uuid(),
      partyId: z.string().uuid(),
      email: z.string().email(),
      name: z.string().max(200).optional().nullable(),
      role: z.enum(["viewer", "contributor"]).default("viewer"),
      targetCompanyName: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "diligence");
    const token = nanoid(48);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const [invitation] = await db.insert(diligencePartyInvitations).values({
      organizationId: ctx.organization.id,
      engagementId: parsedInput.engagementId,
      partyId: parsedInput.partyId,
      email: parsedInput.email.toLowerCase().trim(),
      name: parsedInput.name?.trim() || null,
      role: parsedInput.role,
      token,
      expiresAt,
      invitedByMembershipId: ctx.membership.id,
    }).returning();

    if (isEmailConfigured()) {
      const baseUrl =
        process.env.AUTH_URL ??
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000");
      const link = `${baseUrl}/deal-room/${token}`;
      const dealName = parsedInput.targetCompanyName ?? "a deal";
      await sendEmail({
        to: parsedInput.email,
        subject: `You've been invited to the ${dealName} deal room`,
        htmlBody: `
          <p>Hi${parsedInput.name ? ` ${parsedInput.name}` : ""},</p>
          <p>You've been invited to access the deal room for <strong>${dealName}</strong> on DealScope.</p>
          <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#000;color:#fff;border-radius:6px;text-decoration:none;">Access deal room</a></p>
          <p>This link expires in 30 days. Do not share it — it is unique to you.</p>
        `,
      }).catch(() => {/* silent */});
    }

    return { invitation };
  });

export const revokeInvitation = authedAction
  .schema(z.object({ invitationId: z.string().uuid(), engagementId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "diligence");
    await db
      .delete(diligencePartyInvitations)
      .where(
        and(
          eq(diligencePartyInvitations.id, parsedInput.invitationId),
          eq(diligencePartyInvitations.engagementId, parsedInput.engagementId),
          eq(diligencePartyInvitations.organizationId, ctx.organization.id),
        ),
      );
    return { ok: true };
  });

/* ============================================================================
 * DIALOGUE THREADS
 * ========================================================================== */

export const createDialogueThread = authedAction
  .schema(
    z.object({
      engagementId: z.string().uuid(),
      track: z.string().nullable().optional(),
      subject: z.string().min(1).max(500),
      isInternal: z.boolean().default(false),
      assignedToMembershipId: z.string().uuid().optional().nullable(),
      initialMessage: z.string().min(1).max(10000),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "diligence");
    const [thread] = await db.insert(diligenceDialogueThreads).values({
      organizationId: ctx.organization.id,
      engagementId: parsedInput.engagementId,
      track: parsedInput.track ?? null,
      subject: parsedInput.subject.trim(),
      isInternal: parsedInput.isInternal,
      submittedByMembershipId: ctx.membership.id,
      assignedToMembershipId: parsedInput.assignedToMembershipId || null,
      status: "open",
    }).returning();

    await db.insert(diligenceDialogueMessages).values({
      threadId: thread.id,
      content: parsedInput.initialMessage.trim(),
      fromMembershipId: ctx.membership.id,
      isInternal: parsedInput.isInternal,
    });

    return { thread };
  });

export const replyToThread = authedAction
  .schema(
    z.object({
      threadId: z.string().uuid(),
      content: z.string().min(1).max(10000),
      isInternal: z.boolean().default(false),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    const thread = await db.query.diligenceDialogueThreads.findFirst({
      where: and(
        eq(diligenceDialogueThreads.id, parsedInput.threadId),
        eq(diligenceDialogueThreads.organizationId, ctx.organization.id),
      ),
    });
    if (!thread) throw new PublicError("Thread not found");

    const [message] = await db.insert(diligenceDialogueMessages).values({
      threadId: parsedInput.threadId,
      content: parsedInput.content.trim(),
      fromMembershipId: ctx.membership.id,
      isInternal: parsedInput.isInternal,
    }).returning();

    // Mark thread as answered if it was open.
    if (thread.status === "open") {
      await db
        .update(diligenceDialogueThreads)
        .set({ status: "answered", updatedAt: new Date() })
        .where(eq(diligenceDialogueThreads.id, parsedInput.threadId));
    }

    return { message };
  });

export const updateThreadStatus = authedAction
  .schema(
    z.object({
      threadId: z.string().uuid(),
      engagementId: z.string().uuid(),
      status: z.enum(["open", "answered", "closed"]),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    await db
      .update(diligenceDialogueThreads)
      .set({ status: parsedInput.status, updatedAt: new Date() })
      .where(
        and(
          eq(diligenceDialogueThreads.id, parsedInput.threadId),
          eq(diligenceDialogueThreads.engagementId, parsedInput.engagementId),
          eq(diligenceDialogueThreads.organizationId, ctx.organization.id),
        ),
      );
    return { ok: true };
  });
