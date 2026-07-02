"use server";

/**
 * Change-control workflow actions.
 *
 * Status machine (allowed forward transitions):
 *   draft → submitted → in_review → approved → scheduled → in_progress → implemented → reviewed
 *   * → cancelled (any time before implemented)
 *   in_review → rejected
 *   in_progress / implemented → rolled_back
 *
 * On close (status -> reviewed) we auto-write a `client_events` ledger
 * row so the historical change log is the union of formal CRs + ad-hoc
 * events. The CR keeps a pointer to that event via linked_event_id.
 */
import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
  changeRequestEvidence,
  changeRequests,
  clientEvents,
  clients,
  standardChangeCatalog,
  type ChangeApprover,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import {
  deriveRiskRating,
  requiresCab,
} from "@/lib/change-control/risk";

async function assertClient(clientId: string, organizationId: string) {
  const c = await db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.organizationId, organizationId)),
  });
  if (!c) throw new PublicError("Client not found");
  return c;
}

async function loadCR(id: string, organizationId: string) {
  const cr = await db.query.changeRequests.findFirst({
    where: and(
      eq(changeRequests.id, id),
      eq(changeRequests.organizationId, organizationId),
    ),
  });
  if (!cr) throw new PublicError("Change request not found");
  return cr;
}

/**
 * Generate the next ref code per org. Format: CR-YYYY-NNN where NNN
 * resets per calendar year. Cheap to compute — no need for a sequence
 * since we only generate one per click.
 */
async function nextRefCode(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CR-${year}-`;
  const [{ count } = { count: 0 }] = await db
    .select({
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.organizationId, organizationId),
        sql`${changeRequests.refCode} LIKE ${prefix + "%"}`,
      ),
    );
  return `${prefix}${String((count ?? 0) + 1).padStart(3, "0")}`;
}

/* ============================================================================
 * CREATE / UPDATE
 * ========================================================================== */
const baseSchema = z.object({
  title: z.string().min(2).max(200),
  summary: z.string().max(20_000).optional().nullable(),
  businessJustification: z.string().max(20_000).optional().nullable(),
  // ---- Policy-aligned classification --------------------------------
  changeType: z.enum(["standard", "normal", "emergency"]).default("normal"),
  environment: z.enum(["internal", "client"]).default("client"),
  riskImpact: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  riskLikelihood: z.enum(["low", "medium", "high"]).default("medium"),
  cabRequired: z.boolean().optional(),
  pirRequired: z.boolean().optional(),
  standardChangeCatalogId: z.string().uuid().optional().nullable(),
  // ---- Plans + impact ------------------------------------------------
  implementationPlan: z.string().max(50_000).optional().nullable(),
  rollbackPlan: z.string().max(20_000).optional().nullable(),
  testPlan: z.string().max(20_000).optional().nullable(),
  validationPlan: z.string().max(20_000).optional().nullable(),
  communicationPlan: z.string().max(20_000).optional().nullable(),
  affectedSystems: z.array(z.string().max(200)).max(100).default([]),
  expectedDowntimeMinutes: z.number().int().min(0).max(43_200).optional().nullable(),
  impactStatement: z.string().max(10_000).optional().nullable(),
  // ---- Roles ---------------------------------------------------------
  implementerMembershipId: z.string().uuid().optional().nullable(),
  changeManagerMembershipId: z.string().uuid().optional().nullable(),
  systemOwnerName: z.string().max(200).optional().nullable(),
  systemOwnerEmail: z.string().email().max(320).optional().nullable(),
  // ---- Schedule ------------------------------------------------------
  scheduledStart: z.string().optional().nullable(),
  scheduledEnd: z.string().optional().nullable(),
});

export const createChangeRequest = authedAction
  .schema(baseSchema.extend({ clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertClient(parsedInput.clientId, ctx.organization.id);

    // Standard changes must reference a catalog entry per policy §5.
    if (
      parsedInput.changeType === "standard" &&
      !parsedInput.standardChangeCatalogId
    ) {
      throw new PublicError(
        "Standard changes must reference a Standard Change Catalog entry. Pick one in the form.",
      );
    }
    if (parsedInput.standardChangeCatalogId) {
      const catalog = await db.query.standardChangeCatalog.findFirst({
        where: and(
          eq(standardChangeCatalog.id, parsedInput.standardChangeCatalogId),
          eq(standardChangeCatalog.organizationId, ctx.organization.id),
        ),
      });
      if (!catalog) throw new PublicError("Standard change catalog entry not found");
    }

    const riskRating = deriveRiskRating(
      parsedInput.riskImpact,
      parsedInput.riskLikelihood,
    );
    const cabRequired = parsedInput.cabRequired ?? requiresCab(riskRating);
    const pirRequired =
      parsedInput.pirRequired ??
      (parsedInput.changeType === "emergency" ||
        riskRating === "high" ||
        riskRating === "critical");

    const refCode = await nextRefCode(ctx.organization.id);
    const [created] = await db
      .insert(changeRequests)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        refCode,
        title: parsedInput.title.trim(),
        summary: parsedInput.summary?.trim() || null,
        businessJustification: parsedInput.businessJustification?.trim() || null,
        changeType: parsedInput.changeType,
        environment: parsedInput.environment,
        riskImpact: parsedInput.riskImpact,
        riskLikelihood: parsedInput.riskLikelihood,
        riskRating,
        cabRequired,
        pirRequired,
        standardChangeCatalogId: parsedInput.standardChangeCatalogId ?? null,
        implementationPlan: parsedInput.implementationPlan?.trim() || null,
        rollbackPlan: parsedInput.rollbackPlan?.trim() || null,
        testPlan: parsedInput.testPlan?.trim() || null,
        validationPlan: parsedInput.validationPlan?.trim() || null,
        communicationPlan: parsedInput.communicationPlan?.trim() || null,
        affectedSystems: parsedInput.affectedSystems,
        expectedDowntimeMinutes: parsedInput.expectedDowntimeMinutes ?? null,
        impactStatement: parsedInput.impactStatement?.trim() || null,
        implementerMembershipId: parsedInput.implementerMembershipId ?? null,
        changeManagerMembershipId:
          parsedInput.changeManagerMembershipId ?? null,
        systemOwnerName: parsedInput.systemOwnerName?.trim() || null,
        systemOwnerEmail: parsedInput.systemOwnerEmail?.trim() || null,
        scheduledStart: parsedInput.scheduledStart
          ? new Date(parsedInput.scheduledStart)
          : null,
        scheduledEnd: parsedInput.scheduledEnd
          ? new Date(parsedInput.scheduledEnd)
          : null,
        requestedByMembershipId: ctx.membership.id,
        status: "draft",
      })
      .returning();
    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath(`/clients/${parsedInput.clientId}/changes`);
    return { changeRequest: created };
  });

export const updateChangeRequest = authedAction
  .schema(
    baseSchema.partial().extend({
      changeRequestId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const cr = await loadCR(parsedInput.changeRequestId, ctx.organization.id);
    if (cr.status === "reviewed" || cr.status === "cancelled") {
      throw new PublicError(
        `Cannot edit a ${cr.status} change request. Open a new CR instead.`,
      );
    }
    // Recompute risk rating + CAB requirement when impact/likelihood
    // change. CAB can also be force-set explicitly.
    const newImpact = parsedInput.riskImpact ?? cr.riskImpact;
    const newLikelihood = parsedInput.riskLikelihood ?? cr.riskLikelihood;
    const newRating = deriveRiskRating(newImpact, newLikelihood);
    const newCabRequired =
      parsedInput.cabRequired !== undefined
        ? parsedInput.cabRequired
        : cr.cabRequired || requiresCab(newRating);
    const newPirRequired =
      parsedInput.pirRequired !== undefined
        ? parsedInput.pirRequired
        : cr.pirRequired;

    await db
      .update(changeRequests)
      .set({
        title: parsedInput.title?.trim() ?? cr.title,
        summary:
          parsedInput.summary !== undefined
            ? parsedInput.summary?.trim() || null
            : cr.summary,
        businessJustification:
          parsedInput.businessJustification !== undefined
            ? parsedInput.businessJustification?.trim() || null
            : cr.businessJustification,
        changeType: parsedInput.changeType ?? cr.changeType,
        environment: parsedInput.environment ?? cr.environment,
        riskImpact: newImpact,
        riskLikelihood: newLikelihood,
        riskRating: newRating,
        cabRequired: newCabRequired,
        pirRequired: newPirRequired,
        standardChangeCatalogId:
          parsedInput.standardChangeCatalogId !== undefined
            ? parsedInput.standardChangeCatalogId
            : cr.standardChangeCatalogId,
        implementationPlan:
          parsedInput.implementationPlan !== undefined
            ? parsedInput.implementationPlan?.trim() || null
            : cr.implementationPlan,
        rollbackPlan:
          parsedInput.rollbackPlan !== undefined
            ? parsedInput.rollbackPlan?.trim() || null
            : cr.rollbackPlan,
        testPlan:
          parsedInput.testPlan !== undefined
            ? parsedInput.testPlan?.trim() || null
            : cr.testPlan,
        validationPlan:
          parsedInput.validationPlan !== undefined
            ? parsedInput.validationPlan?.trim() || null
            : cr.validationPlan,
        communicationPlan:
          parsedInput.communicationPlan !== undefined
            ? parsedInput.communicationPlan?.trim() || null
            : cr.communicationPlan,
        affectedSystems: parsedInput.affectedSystems ?? cr.affectedSystems,
        expectedDowntimeMinutes:
          parsedInput.expectedDowntimeMinutes !== undefined
            ? parsedInput.expectedDowntimeMinutes
            : cr.expectedDowntimeMinutes,
        impactStatement:
          parsedInput.impactStatement !== undefined
            ? parsedInput.impactStatement?.trim() || null
            : cr.impactStatement,
        implementerMembershipId:
          parsedInput.implementerMembershipId !== undefined
            ? parsedInput.implementerMembershipId
            : cr.implementerMembershipId,
        changeManagerMembershipId:
          parsedInput.changeManagerMembershipId !== undefined
            ? parsedInput.changeManagerMembershipId
            : cr.changeManagerMembershipId,
        systemOwnerName:
          parsedInput.systemOwnerName !== undefined
            ? parsedInput.systemOwnerName?.trim() || null
            : cr.systemOwnerName,
        systemOwnerEmail:
          parsedInput.systemOwnerEmail !== undefined
            ? parsedInput.systemOwnerEmail?.trim() || null
            : cr.systemOwnerEmail,
        scheduledStart:
          parsedInput.scheduledStart !== undefined
            ? parsedInput.scheduledStart
              ? new Date(parsedInput.scheduledStart)
              : null
            : cr.scheduledStart,
        scheduledEnd:
          parsedInput.scheduledEnd !== undefined
            ? parsedInput.scheduledEnd
              ? new Date(parsedInput.scheduledEnd)
              : null
            : cr.scheduledEnd,
        updatedAt: new Date(),
      })
      .where(eq(changeRequests.id, cr.id));
    revalidatePath(`/clients/${cr.clientId}/changes/${cr.id}`);
    revalidatePath(`/clients/${cr.clientId}/changes`);
    return { ok: true };
  });

/* ============================================================================
 * APPROVERS — add / update individual approver entries on the CR
 * ========================================================================== */
const approverInputSchema = z.object({
  changeRequestId: z.string().uuid(),
  name: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  organization: z.string().max(200).optional().nullable(),
  email: z.string().email().max(320).optional().nullable(),
});

export const addApprover = authedAction
  .schema(approverInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const cr = await loadCR(parsedInput.changeRequestId, ctx.organization.id);
    const next: ChangeApprover[] = [
      ...cr.approvers,
      {
        id: nanoid(8),
        name: parsedInput.name.trim(),
        role: parsedInput.role.trim(),
        organization: parsedInput.organization?.trim() || null,
        email: parsedInput.email?.trim() || null,
        decision: "pending",
        decidedAt: null,
        comments: null,
        approvalMethod: null,
        approvalEvidence: null,
        recordedByMembershipId: null,
        recordedAt: null,
      },
    ];
    await db
      .update(changeRequests)
      .set({ approvers: next, updatedAt: new Date() })
      .where(eq(changeRequests.id, cr.id));
    revalidatePath(`/clients/${cr.clientId}/changes/${cr.id}`);
    return { ok: true };
  });

export const recordApproverDecision = authedAction
  .schema(
    z.object({
      changeRequestId: z.string().uuid(),
      approverId: z.string().min(1).max(40),
      decision: z.enum(["pending", "approved", "rejected", "abstained"]),
      comments: z.string().max(10_000).optional().nullable(),
      /** How the decision was captured. Required when not "pending". */
      approvalMethod: z
        .enum(["in_app", "phone", "teams", "email", "in_person", "other"])
        .optional()
        .nullable(),
      /** Free-form evidence — link to the email thread, Teams message
       *  permalink, summary of phone call, etc. Strongly recommended
       *  when the decision was captured out of band. */
      approvalEvidence: z.string().max(10_000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const cr = await loadCR(parsedInput.changeRequestId, ctx.organization.id);

    // Out-of-band decisions (phone / teams / email / in_person) MUST
    // capture an evidence note so the audit trail is intact.
    if (
      parsedInput.decision !== "pending" &&
      parsedInput.approvalMethod &&
      parsedInput.approvalMethod !== "in_app" &&
      !parsedInput.approvalEvidence?.trim()
    ) {
      throw new PublicError(
        "Out-of-band approvals must include an evidence note (link to the email, Teams message, or summary of the phone call).",
      );
    }

    const now = new Date();
    const next: ChangeApprover[] = cr.approvers.map((a) =>
      a.id === parsedInput.approverId
        ? {
            ...a,
            decision: parsedInput.decision,
            decidedAt:
              parsedInput.decision === "pending" ? null : now.toISOString(),
            comments: parsedInput.comments?.trim() || null,
            approvalMethod:
              parsedInput.decision === "pending"
                ? null
                : parsedInput.approvalMethod ?? "in_app",
            approvalEvidence:
              parsedInput.decision === "pending"
                ? null
                : parsedInput.approvalEvidence?.trim() || null,
            recordedByMembershipId:
              parsedInput.decision === "pending" ? null : ctx.membership.id,
            recordedAt:
              parsedInput.decision === "pending" ? null : now.toISOString(),
          }
        : a,
    );
    await db
      .update(changeRequests)
      .set({ approvers: next, updatedAt: now })
      .where(eq(changeRequests.id, cr.id));
    revalidatePath(`/clients/${cr.clientId}/changes/${cr.id}`);
    return { ok: true };
  });

export const removeApprover = authedAction
  .schema(
    z.object({
      changeRequestId: z.string().uuid(),
      approverId: z.string().min(1).max(40),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const cr = await loadCR(parsedInput.changeRequestId, ctx.organization.id);
    const next = cr.approvers.filter((a) => a.id !== parsedInput.approverId);
    await db
      .update(changeRequests)
      .set({ approvers: next, updatedAt: new Date() })
      .where(eq(changeRequests.id, cr.id));
    revalidatePath(`/clients/${cr.clientId}/changes/${cr.id}`);
    return { ok: true };
  });

/* ============================================================================
 * STATUS TRANSITIONS
 * ========================================================================== */
type AllowedTransitions = Record<string, string[]>;
const ALLOWED: AllowedTransitions = {
  draft: ["submitted", "cancelled"],
  submitted: ["in_review", "cancelled"],
  in_review: ["approved", "rejected", "cancelled"],
  approved: ["scheduled", "in_progress", "cancelled"],
  rejected: ["draft", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["implemented", "rolled_back", "cancelled"],
  implemented: ["reviewed", "rolled_back"],
  reviewed: [],
  rolled_back: ["reviewed"],
  cancelled: [],
};

function assertTransition(from: string, to: string) {
  const allowed = ALLOWED[from] ?? [];
  if (!allowed.includes(to)) {
    throw new PublicError(
      `Can't move from "${from}" to "${to}". Allowed: ${allowed.join(", ") || "(none)"}`,
    );
  }
}

export const transitionStatus = authedAction
  .schema(
    z.object({
      changeRequestId: z.string().uuid(),
      to: z.enum([
        "draft",
        "submitted",
        "in_review",
        "approved",
        "rejected",
        "scheduled",
        "in_progress",
        "implemented",
        "reviewed",
        "rolled_back",
        "cancelled",
      ]),
      // Optional fields for certain transitions
      actualStartAt: z.string().optional().nullable(),
      actualEndAt: z.string().optional().nullable(),
      postReviewOutcome: z
        .enum(["successful", "successful_with_issues", "rolled_back", "failed"])
        .optional(),
      pirPlannedVsActual: z.string().max(20_000).optional().nullable(),
      pirRootCause: z.string().max(20_000).optional().nullable(),
      pirPreventiveActions: z.string().max(20_000).optional().nullable(),
      postReviewIssues: z.string().max(20_000).optional().nullable(),
      postReviewLessons: z.string().max(20_000).optional().nullable(),
      documentationUpdated: z.boolean().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const cr = await loadCR(parsedInput.changeRequestId, ctx.organization.id);
    assertTransition(cr.status, parsedInput.to);

    const now = new Date();
    const updates: Record<string, unknown> = {
      status: parsedInput.to,
      updatedAt: now,
    };
    if (parsedInput.to === "submitted") updates.submittedAt = now;
    if (parsedInput.to === "in_progress") {
      updates.actualStart = parsedInput.actualStartAt
        ? new Date(parsedInput.actualStartAt)
        : now;
    }
    if (parsedInput.to === "implemented" || parsedInput.to === "rolled_back") {
      updates.actualEnd = parsedInput.actualEndAt
        ? new Date(parsedInput.actualEndAt)
        : now;
    }
    if (parsedInput.to === "reviewed") {
      updates.reviewedAt = now;
      updates.reviewedByMembershipId = ctx.membership.id;
      if (parsedInput.postReviewOutcome)
        updates.postReviewOutcome = parsedInput.postReviewOutcome;
      if (parsedInput.pirPlannedVsActual !== undefined)
        updates.pirPlannedVsActual =
          parsedInput.pirPlannedVsActual?.trim() || null;
      if (parsedInput.pirRootCause !== undefined)
        updates.pirRootCause = parsedInput.pirRootCause?.trim() || null;
      if (parsedInput.pirPreventiveActions !== undefined)
        updates.pirPreventiveActions =
          parsedInput.pirPreventiveActions?.trim() || null;
      if (parsedInput.postReviewIssues !== undefined)
        updates.postReviewIssues = parsedInput.postReviewIssues?.trim() || null;
      if (parsedInput.postReviewLessons !== undefined)
        updates.postReviewLessons =
          parsedInput.postReviewLessons?.trim() || null;
      if (parsedInput.documentationUpdated !== undefined)
        updates.documentationUpdated = parsedInput.documentationUpdated;
    }

    await db
      .update(changeRequests)
      .set(updates)
      .where(eq(changeRequests.id, cr.id));

    // On reviewed → write a client_events ledger row.
    if (parsedInput.to === "reviewed" && !cr.linkedEventId) {
      const outcome = parsedInput.postReviewOutcome ?? "successful";
      const severity =
        outcome === "failed"
          ? "high"
          : outcome === "rolled_back"
            ? "medium"
            : outcome === "successful_with_issues"
              ? "low"
              : "info";
      const durationMinutes =
        cr.actualStart && cr.actualEnd
          ? Math.round((cr.actualEnd.getTime() - cr.actualStart.getTime()) / 60_000)
          : null;
      const [event] = await db
        .insert(clientEvents)
        .values({
          organizationId: ctx.organization.id,
          clientId: cr.clientId,
          occurredAt: cr.actualStart ?? now,
          kind: "change",
          severity,
          title: `${cr.refCode} — ${cr.title}`,
          narrative: cr.summary,
          rootCause: parsedInput.pirRootCause ?? null,
          resolution:
            parsedInput.pirPreventiveActions ??
            parsedInput.postReviewLessons ??
            null,
          durationMinutes,
          affectedSystems: cr.affectedSystems,
          recordedByMembershipId: ctx.membership.id,
          resolvedAt: cr.actualEnd ?? now,
        })
        .returning();
      await db
        .update(changeRequests)
        .set({ linkedEventId: event.id })
        .where(eq(changeRequests.id, cr.id));
    }

    revalidatePath(`/clients/${cr.clientId}/changes/${cr.id}`);
    revalidatePath(`/clients/${cr.clientId}/changes`);
    revalidatePath(`/clients/${cr.clientId}`);
    return { ok: true };
  });

/* ============================================================================
 * DELETE — only allowed on drafts (otherwise you'd lose audit history).
 * ========================================================================== */
export const deleteChangeRequest = authedAction
  .schema(z.object({ changeRequestId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "client");
    const cr = await loadCR(parsedInput.changeRequestId, ctx.organization.id);
    if (cr.status !== "draft") {
      throw new PublicError(
        "Only drafts can be deleted. Cancel instead to preserve the audit trail.",
      );
    }
    await db.delete(changeRequests).where(eq(changeRequests.id, cr.id));
    revalidatePath(`/clients/${cr.clientId}/changes`);
    return { ok: true };
  });

/* ============================================================================
 * Read helper (used by pages, not exposed as an action)
 * ========================================================================== */
export async function listChangeRequestsForClient(
  clientId: string,
  organizationId: string,
) {
  return db
    .select()
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.clientId, clientId),
        eq(changeRequests.organizationId, organizationId),
      ),
    )
    .orderBy(desc(changeRequests.createdAt));
}

export async function listEvidenceForChangeRequest(
  changeRequestId: string,
  organizationId: string,
) {
  return db
    .select()
    .from(changeRequestEvidence)
    .where(
      and(
        eq(changeRequestEvidence.changeRequestId, changeRequestId),
        eq(changeRequestEvidence.organizationId, organizationId),
      ),
    )
    .orderBy(desc(changeRequestEvidence.capturedAt));
}

/* ============================================================================
 * EVIDENCE — attachments / linked artifacts on a CR. Per policy §1.8.
 * ========================================================================== */
const evidenceSchema = z.object({
  changeRequestId: z.string().uuid(),
  kind: z
    .enum([
      "approval_record",
      "pre_change_snapshot",
      "post_change_snapshot",
      "log",
      "screenshot",
      "validation_result",
      "rollback_evidence",
      "communication",
      "other",
    ])
    .default("other"),
  label: z.string().min(1).max(300),
  url: z.string().max(2_000).optional().nullable(),
  notes: z.string().max(50_000).optional().nullable(),
});

export const addEvidence = authedAction
  .schema(evidenceSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const cr = await loadCR(parsedInput.changeRequestId, ctx.organization.id);
    const [created] = await db
      .insert(changeRequestEvidence)
      .values({
        organizationId: ctx.organization.id,
        changeRequestId: cr.id,
        kind: parsedInput.kind,
        label: parsedInput.label.trim(),
        url: parsedInput.url?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
        capturedByMembershipId: ctx.membership.id,
        capturedAt: new Date(),
      })
      .returning();
    revalidatePath(`/clients/${cr.clientId}/changes/${cr.id}`);
    return { evidence: created };
  });

export const removeEvidence = authedAction
  .schema(z.object({ evidenceId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const ev = await db.query.changeRequestEvidence.findFirst({
      where: and(
        eq(changeRequestEvidence.id, parsedInput.evidenceId),
        eq(changeRequestEvidence.organizationId, ctx.organization.id),
      ),
    });
    if (!ev) throw new PublicError("Evidence not found");
    await db
      .delete(changeRequestEvidence)
      .where(eq(changeRequestEvidence.id, ev.id));
    const cr = await db.query.changeRequests.findFirst({
      where: eq(changeRequests.id, ev.changeRequestId),
    });
    if (cr) {
      revalidatePath(`/clients/${cr.clientId}/changes/${cr.id}`);
    }
    return { ok: true };
  });

/* ============================================================================
 * STANDARD CHANGE CATALOG — pre-approved low-risk changes per policy §5.
 * ========================================================================== */
const catalogSchema = z.object({
  code: z.string().min(1).max(40),
  title: z.string().min(2).max(200),
  description: z.string().max(20_000).optional().nullable(),
  runbookSteps: z.string().max(50_000).optional().nullable(),
  validationSteps: z.string().max(20_000).optional().nullable(),
  rollbackSteps: z.string().max(20_000).optional().nullable(),
  defaultRiskRating: z
    .enum(["low", "medium", "high", "critical"])
    .default("low"),
});

export const createStandardChangeCatalogEntry = authedAction
  .schema(catalogSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const [created] = await db
      .insert(standardChangeCatalog)
      .values({
        organizationId: ctx.organization.id,
        code: parsedInput.code.trim(),
        title: parsedInput.title.trim(),
        description: parsedInput.description?.trim() || null,
        runbookSteps: parsedInput.runbookSteps?.trim() || null,
        validationSteps: parsedInput.validationSteps?.trim() || null,
        rollbackSteps: parsedInput.rollbackSteps?.trim() || null,
        defaultRiskRating: parsedInput.defaultRiskRating,
      })
      .returning();
    revalidatePath("/standard-changes");
    return { entry: created };
  });

export const updateStandardChangeCatalogEntry = authedAction
  .schema(
    catalogSchema
      .partial()
      .extend({ entryId: z.string().uuid() }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const existing = await db.query.standardChangeCatalog.findFirst({
      where: and(
        eq(standardChangeCatalog.id, parsedInput.entryId),
        eq(standardChangeCatalog.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Entry not found");
    await db
      .update(standardChangeCatalog)
      .set({
        code: parsedInput.code?.trim() ?? existing.code,
        title: parsedInput.title?.trim() ?? existing.title,
        description:
          parsedInput.description !== undefined
            ? parsedInput.description?.trim() || null
            : existing.description,
        runbookSteps:
          parsedInput.runbookSteps !== undefined
            ? parsedInput.runbookSteps?.trim() || null
            : existing.runbookSteps,
        validationSteps:
          parsedInput.validationSteps !== undefined
            ? parsedInput.validationSteps?.trim() || null
            : existing.validationSteps,
        rollbackSteps:
          parsedInput.rollbackSteps !== undefined
            ? parsedInput.rollbackSteps?.trim() || null
            : existing.rollbackSteps,
        defaultRiskRating:
          parsedInput.defaultRiskRating ?? existing.defaultRiskRating,
        updatedAt: new Date(),
      })
      .where(eq(standardChangeCatalog.id, existing.id));
    revalidatePath("/standard-changes");
    revalidatePath(`/standard-changes/${existing.id}`);
    return { ok: true };
  });

export const deleteStandardChangeCatalogEntry = authedAction
  .schema(z.object({ entryId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "client");
    const existing = await db.query.standardChangeCatalog.findFirst({
      where: and(
        eq(standardChangeCatalog.id, parsedInput.entryId),
        eq(standardChangeCatalog.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Entry not found");
    await db
      .delete(standardChangeCatalog)
      .where(eq(standardChangeCatalog.id, existing.id));
    revalidatePath("/standard-changes");
    return { ok: true };
  });
