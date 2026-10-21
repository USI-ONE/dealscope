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
import { guestAction, authorize, PublicError } from "@/server/safe-action";
import { isEmailConfigured, sendEmail } from "@/lib/email/graph";
import { appBaseUrl, emailLayout, escapeHtml } from "@/lib/email/account";
import { assertOwned } from "@/server/ownership";
import { diligenceEngagements, memberships } from "@/db/schema";

/* ============================================================================
 * PARTIES
 * ========================================================================== */

export const createParty = guestAction
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
    await assertOwned(diligenceEngagements, parsedInput.engagementId, ctx.organization.id, "Engagement");
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

export const updateParty = guestAction
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

export const deleteParty = guestAction
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

export const invitePartyMember = guestAction
  .schema(
    z.object({
      engagementId: z.string().uuid(),
      partyId: z.string().uuid(),
      email: z.string().email(),
      name: z.string().max(200).optional().nullable(),
      role: z.enum(["viewer", "contributor"]).default("viewer"),
      /** Ignored — the deal name is read from the engagement on the server. */
      targetCompanyName: z.string().max(300).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "diligence");
    await assertOwned(diligenceEngagements, parsedInput.engagementId, ctx.organization.id, "Engagement");
    const party = await db.query.diligenceParties.findFirst({
      where: and(eq(diligenceParties.id, parsedInput.partyId), eq(diligenceParties.engagementId, parsedInput.engagementId), eq(diligenceParties.organizationId, ctx.organization.id)),
      columns: { id: true },
    });
    if (!party) throw new PublicError("Party not found");
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
      const engagement = await db.query.diligenceEngagements.findFirst({
        where: and(eq(diligenceEngagements.id, parsedInput.engagementId), eq(diligenceEngagements.organizationId, ctx.organization.id)),
        columns: { targetCompanyName: true },
      });
      const link = `${appBaseUrl()}/deal-room/${token}`;
      const dealName = (engagement?.targetCompanyName || "a deal").replace(/[\r\n]+/g, " ").slice(0, 120);
      const name = parsedInput.name?.trim();
      await sendEmail({
        to: parsedInput.email,
        subject: `You've been invited to the ${dealName} deal room`,
        htmlBody: emailLayout(
          "You're invited to a deal room",
          `<p style="margin:0 0 12px 0;">Hi${name ? ` ${escapeHtml(name)}` : ""},</p>
           <p style="margin:0;">You've been invited to access the deal room for <strong>${escapeHtml(dealName)}</strong> on DealScope.</p>`,
          { label: "Access deal room", href: link },
          "This link expires in 30 days. Do not share it — it is unique to you.",
        ),
      }).catch((err) => console.error("[deal-room] invite email failed", err));
    }

    return { invitation };
  });

export const revokeInvitation = guestAction
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

export const createDialogueThread = guestAction
  .schema(
    z.object({
      engagementId: z.string().uuid(),
      track: z.string().max(100).nullable().optional(),
      subject: z.string().min(1).max(500),
      isInternal: z.boolean().default(false),
      assignedToMembershipId: z.string().uuid().optional().nullable(),
      initialMessage: z.string().min(1).max(10000),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "diligence");
    await assertOwned(diligenceEngagements, parsedInput.engagementId, ctx.organization.id, "Engagement");
    await assertOwned(memberships, parsedInput.assignedToMembershipId, ctx.organization.id, "Member");
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

export const replyToThread = guestAction
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

export const updateThreadStatus = guestAction
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
