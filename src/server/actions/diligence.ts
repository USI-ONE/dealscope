"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clients,
  diligenceArtifacts,
  diligenceAttendees,
  diligenceCostLines,
  diligenceEngagementResponses,
  diligenceEngagements,
  diligenceFindings,
  diligenceSessions,
} from "@/db/schema";
import { INDUSTRY_ENUM_VALUES } from "@/lib/diligence/industries";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

const engagementStatus = z.enum(["planning", "in_progress", "drafting", "delivered"]);
const industrySchema = z.enum(INDUSTRY_ENUM_VALUES);

const createEngagementSchema = z.object({
  targetCompanyName: z.string().min(2).max(200),
  codename: z.string().max(120).optional().nullable(),
  status: engagementStatus.default("planning"),
  industry: industrySchema.optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  leadInterviewerMembershipId: z.string().uuid().optional().nullable(),
  partners: z.string().max(400).optional().nullable(),
  summary: z.string().max(20000).optional().nullable(),
  kickoffDate: z.string().optional().nullable(),
  deliveryDate: z.string().optional().nullable(),
});

export const createEngagement = authedAction
  .schema(createEngagementSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "diligence");
    const [created] = await db
      .insert(diligenceEngagements)
      .values({
        organizationId: ctx.organization.id,
        targetCompanyName: parsedInput.targetCompanyName.trim(),
        codename: parsedInput.codename?.trim() || null,
        status: parsedInput.status,
        industry: parsedInput.industry ?? null,
        clientId: parsedInput.clientId || null,
        leadInterviewerMembershipId: parsedInput.leadInterviewerMembershipId || null,
        partners: parsedInput.partners?.trim() || null,
        summary: parsedInput.summary?.trim() || null,
        kickoffDate: parsedInput.kickoffDate || null,
        deliveryDate: parsedInput.deliveryDate || null,
      })
      .returning();
    revalidatePath("/");
    revalidatePath("/diligence");
    return { engagement: created };
  });

export const updateEngagement = authedAction
  .schema(createEngagementSchema.partial().extend({ engagementId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    const existing = await db.query.diligenceEngagements.findFirst({
      where: and(
        eq(diligenceEngagements.id, parsedInput.engagementId),
        eq(diligenceEngagements.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Engagement not found");

    await db
      .update(diligenceEngagements)
      .set({
        targetCompanyName:
          parsedInput.targetCompanyName?.trim() ?? existing.targetCompanyName,
        codename:
          parsedInput.codename !== undefined
            ? parsedInput.codename?.trim() || null
            : existing.codename,
        status: parsedInput.status ?? existing.status,
        industry:
          parsedInput.industry !== undefined
            ? parsedInput.industry ?? null
            : existing.industry,
        clientId:
          parsedInput.clientId !== undefined
            ? parsedInput.clientId || null
            : existing.clientId,
        leadInterviewerMembershipId:
          parsedInput.leadInterviewerMembershipId !== undefined
            ? parsedInput.leadInterviewerMembershipId || null
            : existing.leadInterviewerMembershipId,
        partners:
          parsedInput.partners !== undefined
            ? parsedInput.partners?.trim() || null
            : existing.partners,
        summary:
          parsedInput.summary !== undefined
            ? parsedInput.summary?.trim() || null
            : existing.summary,
        kickoffDate:
          parsedInput.kickoffDate !== undefined
            ? parsedInput.kickoffDate || null
            : existing.kickoffDate,
        deliveryDate:
          parsedInput.deliveryDate !== undefined
            ? parsedInput.deliveryDate || null
            : existing.deliveryDate,
        updatedAt: new Date(),
      })
      .where(eq(diligenceEngagements.id, parsedInput.engagementId));

    revalidatePath("/diligence");
    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { ok: true };
  });

export const archiveEngagement = authedAction
  .schema(z.object({ engagementId: z.string().uuid(), restore: z.boolean().default(false) }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    await db
      .update(diligenceEngagements)
      .set({
        archivedAt: parsedInput.restore ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(diligenceEngagements.id, parsedInput.engagementId),
          eq(diligenceEngagements.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/diligence");
    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { ok: true };
  });

export const deleteEngagement = authedAction
  .schema(z.object({ engagementId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "diligence");
    await db
      .delete(diligenceEngagements)
      .where(
        and(
          eq(diligenceEngagements.id, parsedInput.engagementId),
          eq(diligenceEngagements.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/diligence");
    return { ok: true };
  });

/* ----------------------------------------------------------------------- */
/**
 * Convert a diligence engagement to a TechOS client.
 *
 * The intent: once a deal closes (or the engagement otherwise transitions
 * from "target we're evaluating" → "company we manage"), the operator wants
 * a one-click way to spin up a real `clients` row pre-populated from what
 * we already know — without re-typing the company name, industry, etc.
 *
 * Behavior:
 *   - Idempotent. If the engagement already has a `client_id`, we return
 *     the existing client (slug + id). Operator just gets navigated to it.
 *   - Slug collisions auto-resolved with -2, -3 suffixes (clients.slug is
 *     unique per org).
 *   - Industry copied straight across (clients.industry is text; the
 *     engagement enum value is a valid text value).
 *   - Status defaults to "active". Operator can flip on the client page
 *     if they're treating it as a prospect.
 *   - We DO NOT touch engagement.status here — leaving "delivered" vs
 *     "in_progress" as a separate operator decision. Some firms keep the
 *     engagement open while onboarding starts in parallel.
 *
 * Requires: create on clients + update on diligence (since we mutate
 * the engagement to link it).
 */
export const convertEngagementToClient = authedAction
  .schema(
    z.object({
      engagementId: z.string().uuid(),
      /** Optional overrides if the operator wants a different name/slug. */
      nameOverride: z.string().min(2).max(200).optional().nullable(),
      slugOverride: z.string().max(80).optional().nullable(),
      primaryDomain: z.string().max(200).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "client");
    await authorize("update", "diligence");

    const engagement = await db.query.diligenceEngagements.findFirst({
      where: and(
        eq(diligenceEngagements.id, parsedInput.engagementId),
        eq(diligenceEngagements.organizationId, ctx.organization.id),
      ),
    });
    if (!engagement) throw new PublicError("Engagement not found");

    // Idempotent path — already linked, just return that client.
    if (engagement.clientId) {
      const existing = await db.query.clients.findFirst({
        where: and(
          eq(clients.id, engagement.clientId),
          eq(clients.organizationId, ctx.organization.id),
        ),
        columns: { id: true, slug: true, name: true },
      });
      if (existing) {
        return {
          clientId: existing.id,
          slug: existing.slug,
          name: existing.name,
          alreadyLinked: true as const,
        };
      }
      // Stale FK (client got deleted) — fall through and create fresh.
    }

    const name = (parsedInput.nameOverride?.trim() || engagement.targetCompanyName).trim();
    const baseSlug =
      (parsedInput.slugOverride?.trim() || slugifyName(name)) || "client";

    // Resolve slug collisions: base, base-2, base-3, ...
    let slug = baseSlug;
    for (let attempt = 2; attempt <= 50; attempt++) {
      const collision = await db.query.clients.findFirst({
        where: and(
          eq(clients.organizationId, ctx.organization.id),
          eq(clients.slug, slug),
        ),
        columns: { id: true },
      });
      if (!collision) break;
      slug = `${baseSlug}-${attempt}`;
      if (attempt === 50) throw new PublicError("Couldn't find a unique slug — pass slugOverride");
    }

    const [created] = await db
      .insert(clients)
      .values({
        organizationId: ctx.organization.id,
        name,
        slug,
        status: "active",
        // engagement.industry is an enum; clients.industry is plain text —
        // the enum's wire value is a valid text value, so the cast is safe.
        industry: (engagement.industry as string | null) ?? null,
        primaryDomain: parsedInput.primaryDomain?.trim() || null,
        notes: engagement.summary?.trim() || null,
      })
      .returning({ id: clients.id, slug: clients.slug, name: clients.name });

    await db
      .update(diligenceEngagements)
      .set({ clientId: created.id, updatedAt: new Date() })
      .where(eq(diligenceEngagements.id, engagement.id));

    revalidatePath("/clients");
    revalidatePath(`/clients/${created.slug}`);
    revalidatePath("/diligence");
    revalidatePath(`/diligence/${engagement.id}`);

    return {
      clientId: created.id,
      slug: created.slug,
      name: created.name,
      alreadyLinked: false as const,
    };
  });

function slugifyName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/* ============================================================================
 * Engagement-level question responses (canonical questionnaire answers).
 * Question catalog lives in code (`src/lib/diligence/question-library.ts`)
 * — we don't validate that questionKey exists in the library here so the
 * library can evolve without locking us out of historical engagements.
 * ========================================================================== */
const setResponseSchema = z.object({
  engagementId: z.string().uuid(),
  questionKey: z.string().min(1).max(200),
  /** value is JSON: string | number | boolean | string[] | null */
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.string()),
      z.null(),
    ])
    .optional(),
  satisfactory: z.boolean().default(false),
  notes: z.string().max(20000).optional().nullable(),
});

export const setEngagementResponse = authedAction
  .schema(setResponseSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    await assertEngagementInOrg(parsedInput.engagementId, ctx.organization.id);

    await db
      .insert(diligenceEngagementResponses)
      .values({
        organizationId: ctx.organization.id,
        engagementId: parsedInput.engagementId,
        questionKey: parsedInput.questionKey,
        value: parsedInput.value ?? null,
        satisfactory: parsedInput.satisfactory,
        notes: parsedInput.notes?.trim() || null,
        answeredByMembershipId: ctx.membership.id,
        answeredAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          diligenceEngagementResponses.engagementId,
          diligenceEngagementResponses.questionKey,
        ],
        set: {
          value: parsedInput.value ?? null,
          satisfactory: parsedInput.satisfactory,
          notes: parsedInput.notes?.trim() || null,
          answeredByMembershipId: ctx.membership.id,
          answeredAt: new Date(),
          updatedAt: new Date(),
        },
      });

    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { ok: true };
  });

export const clearEngagementResponse = authedAction
  .schema(z.object({ engagementId: z.string().uuid(), questionKey: z.string().min(1).max(200) }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    await db
      .delete(diligenceEngagementResponses)
      .where(
        and(
          eq(diligenceEngagementResponses.engagementId, parsedInput.engagementId),
          eq(diligenceEngagementResponses.questionKey, parsedInput.questionKey),
          eq(diligenceEngagementResponses.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { ok: true };
  });

async function assertEngagementInOrg(engagementId: string, organizationId: string) {
  const e = await db.query.diligenceEngagements.findFirst({
    where: and(
      eq(diligenceEngagements.id, engagementId),
      eq(diligenceEngagements.organizationId, organizationId),
    ),
  });
  if (!e) throw new PublicError("Engagement not found");
  return e;
}

const sessionSchema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(1).max(200),
  scheduledAt: z.string().optional().nullable(),
  durationMinutes: z.number().int().positive().max(1440).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  mode: z.enum(["onsite", "remote", "hybrid"]).default("onsite"),
});

export const createSession = authedAction
  .schema(sessionSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "diligence");
    await assertEngagementInOrg(parsedInput.engagementId, ctx.organization.id);

    const [created] = await db
      .insert(diligenceSessions)
      .values({
        organizationId: ctx.organization.id,
        engagementId: parsedInput.engagementId,
        title: parsedInput.title.trim(),
        scheduledAt: parsedInput.scheduledAt ? new Date(parsedInput.scheduledAt) : null,
        durationMinutes: parsedInput.durationMinutes ?? null,
        location: parsedInput.location?.trim() || null,
        mode: parsedInput.mode,
      })
      .returning();

    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { session: created };
  });

export const updateSession = authedAction
  .schema(
    sessionSchema.partial().extend({
      sessionId: z.string().uuid(),
      engagementId: z.string().uuid(),
      notes: z.string().max(200000).optional().nullable(),
      summary: z.string().max(20000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    const existing = await db.query.diligenceSessions.findFirst({
      where: and(
        eq(diligenceSessions.id, parsedInput.sessionId),
        eq(diligenceSessions.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Session not found");

    await db
      .update(diligenceSessions)
      .set({
        title: parsedInput.title?.trim() ?? existing.title,
        scheduledAt:
          parsedInput.scheduledAt !== undefined
            ? parsedInput.scheduledAt
              ? new Date(parsedInput.scheduledAt)
              : null
            : existing.scheduledAt,
        durationMinutes:
          parsedInput.durationMinutes !== undefined
            ? parsedInput.durationMinutes ?? null
            : existing.durationMinutes,
        location:
          parsedInput.location !== undefined
            ? parsedInput.location?.trim() || null
            : existing.location,
        mode: parsedInput.mode ?? existing.mode,
        notes:
          parsedInput.notes !== undefined ? parsedInput.notes ?? null : existing.notes,
        summary:
          parsedInput.summary !== undefined
            ? parsedInput.summary?.trim() || null
            : existing.summary,
        updatedAt: new Date(),
      })
      .where(eq(diligenceSessions.id, parsedInput.sessionId));

    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    revalidatePath(
      `/diligence/${parsedInput.engagementId}/sessions/${parsedInput.sessionId}`,
    );
    return { ok: true };
  });

export const deleteSession = authedAction
  .schema(z.object({ sessionId: z.string().uuid(), engagementId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "diligence");
    await db
      .delete(diligenceSessions)
      .where(
        and(
          eq(diligenceSessions.id, parsedInput.sessionId),
          eq(diligenceSessions.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { ok: true };
  });

const attendeeSchema = z.object({
  sessionId: z.string().uuid(),
  engagementId: z.string().uuid(),
  side: z.enum(["target", "interviewer"]),
  fullName: z.string().min(1).max(200),
  title: z.string().max(120).optional().nullable(),
  email: z.string().email().max(200).optional().nullable().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable(),
});

export const createAttendee = authedAction
  .schema(attendeeSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "diligence");
    const [created] = await db
      .insert(diligenceAttendees)
      .values({
        organizationId: ctx.organization.id,
        sessionId: parsedInput.sessionId,
        side: parsedInput.side,
        fullName: parsedInput.fullName.trim(),
        title: parsedInput.title?.trim() || null,
        email: parsedInput.email ? parsedInput.email.trim() : null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    revalidatePath(
      `/diligence/${parsedInput.engagementId}/sessions/${parsedInput.sessionId}`,
    );
    return { attendee: created };
  });

export const deleteAttendee = authedAction
  .schema(
    z.object({
      attendeeId: z.string().uuid(),
      sessionId: z.string().uuid(),
      engagementId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "diligence");
    await db
      .delete(diligenceAttendees)
      .where(
        and(
          eq(diligenceAttendees.id, parsedInput.attendeeId),
          eq(diligenceAttendees.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(
      `/diligence/${parsedInput.engagementId}/sessions/${parsedInput.sessionId}`,
    );
    return { ok: true };
  });

const artifactKindSchema = z.enum([
  "application",
  "server",
  "network_site",
  "identity",
  "vendor",
  "license",
  "ai_tool",
  "intercompany_dependency",
  "key_person",
  "contract",
  "dataset",
  "integration",
  "process_gap",
  "other",
]);

const riskSchema = z.enum(["info", "low", "medium", "high", "critical"]);

const artifactSchema = z.object({
  engagementId: z.string().uuid(),
  sessionId: z.string().uuid().optional().nullable(),
  kind: artifactKindSchema,
  title: z.string().min(1).max(200),
  summary: z.string().max(4000).optional().nullable(),
  data: z.record(z.string(), z.string()).default({}),
  riskLevel: riskSchema.default("info"),
  needsAttention: z.boolean().default(false),
  notes: z.string().max(20000).optional().nullable(),
});

export const createArtifact = authedAction
  .schema(artifactSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "diligence");
    await assertEngagementInOrg(parsedInput.engagementId, ctx.organization.id);

    const [created] = await db
      .insert(diligenceArtifacts)
      .values({
        organizationId: ctx.organization.id,
        engagementId: parsedInput.engagementId,
        sessionId: parsedInput.sessionId || null,
        kind: parsedInput.kind,
        title: parsedInput.title.trim(),
        summary: parsedInput.summary?.trim() || null,
        data: parsedInput.data,
        riskLevel: parsedInput.riskLevel,
        needsAttention: parsedInput.needsAttention,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { artifact: created };
  });

export const updateArtifact = authedAction
  .schema(artifactSchema.extend({ artifactId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    await db
      .update(diligenceArtifacts)
      .set({
        kind: parsedInput.kind,
        title: parsedInput.title.trim(),
        summary: parsedInput.summary?.trim() || null,
        data: parsedInput.data,
        riskLevel: parsedInput.riskLevel,
        needsAttention: parsedInput.needsAttention,
        notes: parsedInput.notes?.trim() || null,
        sessionId: parsedInput.sessionId || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(diligenceArtifacts.id, parsedInput.artifactId),
          eq(diligenceArtifacts.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { ok: true };
  });

export const deleteArtifact = authedAction
  .schema(z.object({ artifactId: z.string().uuid(), engagementId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "diligence");
    await db
      .delete(diligenceArtifacts)
      .where(
        and(
          eq(diligenceArtifacts.id, parsedInput.artifactId),
          eq(diligenceArtifacts.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { ok: true };
  });

const findingSeveritySchema = z.enum(["critical", "high", "medium", "low", "info"]);
const findingStatusSchema = z.enum(["open", "mitigated", "accepted", "closed"]);

const findingSchema = z.object({
  engagementId: z.string().uuid(),
  severity: findingSeveritySchema,
  title: z.string().min(2).max(300),
  narrative: z.string().max(20000).optional().nullable(),
  relatedArtifactIds: z.array(z.string().uuid()).default([]),
  status: findingStatusSchema.default("open"),
  immediate: z.boolean().default(false),
});

const SEVERITY_PREFIX: Record<z.infer<typeof findingSeveritySchema>, string> = {
  critical: "CF",
  high: "HF",
  medium: "MF",
  low: "LF",
  info: "IF",
};

async function nextFindingRefCode(
  engagementId: string,
  severity: z.infer<typeof findingSeveritySchema>,
): Promise<string> {
  const prefix = SEVERITY_PREFIX[severity];
  const rows = await db
    .select({ refCode: diligenceFindings.refCode })
    .from(diligenceFindings)
    .where(
      and(
        eq(diligenceFindings.engagementId, engagementId),
        eq(diligenceFindings.severity, severity),
      ),
    );
  let max = 0;
  for (const r of rows) {
    const m = r.refCode.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}-${String(max + 1).padStart(2, "0")}`;
}

export const createFinding = authedAction
  .schema(findingSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "diligence");
    await assertEngagementInOrg(parsedInput.engagementId, ctx.organization.id);

    const refCode = await nextFindingRefCode(parsedInput.engagementId, parsedInput.severity);

    const [created] = await db
      .insert(diligenceFindings)
      .values({
        organizationId: ctx.organization.id,
        engagementId: parsedInput.engagementId,
        refCode,
        severity: parsedInput.severity,
        title: parsedInput.title.trim(),
        narrative: parsedInput.narrative?.trim() || null,
        relatedArtifactIds: parsedInput.relatedArtifactIds,
        status: parsedInput.status,
        immediate: parsedInput.immediate,
      })
      .returning();
    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { finding: created };
  });

export const updateFinding = authedAction
  .schema(findingSchema.extend({ findingId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    const existing = await db.query.diligenceFindings.findFirst({
      where: and(
        eq(diligenceFindings.id, parsedInput.findingId),
        eq(diligenceFindings.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Finding not found");

    let refCode = existing.refCode;
    if (existing.severity !== parsedInput.severity) {
      refCode = await nextFindingRefCode(parsedInput.engagementId, parsedInput.severity);
    }

    await db
      .update(diligenceFindings)
      .set({
        refCode,
        severity: parsedInput.severity,
        title: parsedInput.title.trim(),
        narrative: parsedInput.narrative?.trim() || null,
        relatedArtifactIds: parsedInput.relatedArtifactIds,
        status: parsedInput.status,
        immediate: parsedInput.immediate,
        updatedAt: new Date(),
      })
      .where(eq(diligenceFindings.id, parsedInput.findingId));

    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { ok: true };
  });

export const deleteFinding = authedAction
  .schema(z.object({ findingId: z.string().uuid(), engagementId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "diligence");
    await db
      .delete(diligenceFindings)
      .where(
        and(
          eq(diligenceFindings.id, parsedInput.findingId),
          eq(diligenceFindings.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { ok: true };
  });

const costTimingSchema = z.enum([
  "pre_close",
  "first_30",
  "thirty_to_90",
  "ninety_to_180",
  "ongoing",
]);

const costLineSchema = z.object({
  engagementId: z.string().uuid(),
  workItem: z.string().min(2).max(300),
  lowCents: z.number().int().nonnegative().default(0),
  highCents: z.number().int().nonnegative().default(0),
  recurring: z.boolean().default(false),
  timing: costTimingSchema.default("first_30"),
  category: z.string().max(120).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  findingId: z.string().uuid().optional().nullable(),
  costType: z.string().max(60).optional().nullable(),
});

export const createCostLine = authedAction
  .schema(costLineSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "diligence");
    await assertEngagementInOrg(parsedInput.engagementId, ctx.organization.id);

    const [{ maxPos }] = await db
      .select({ maxPos: sql<number>`coalesce(max(${diligenceCostLines.position}), -1)` })
      .from(diligenceCostLines)
      .where(eq(diligenceCostLines.engagementId, parsedInput.engagementId));

    const [created] = await db
      .insert(diligenceCostLines)
      .values({
        organizationId: ctx.organization.id,
        engagementId: parsedInput.engagementId,
        workItem: parsedInput.workItem.trim(),
        lowCents: parsedInput.lowCents,
        highCents: parsedInput.highCents,
        recurring: parsedInput.recurring,
        timing: parsedInput.timing,
        category: parsedInput.category?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
        position: (maxPos ?? -1) + 1,
        findingId: parsedInput.findingId ?? null,
        costType: parsedInput.costType?.trim() || null,
      })
      .returning();
    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { costLine: created };
  });

export const updateCostLine = authedAction
  .schema(costLineSchema.extend({ costLineId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    await db
      .update(diligenceCostLines)
      .set({
        workItem: parsedInput.workItem.trim(),
        lowCents: parsedInput.lowCents,
        highCents: parsedInput.highCents,
        recurring: parsedInput.recurring,
        timing: parsedInput.timing,
        category: parsedInput.category?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
        findingId: parsedInput.findingId ?? null,
        costType: parsedInput.costType?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(diligenceCostLines.id, parsedInput.costLineId),
          eq(diligenceCostLines.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { ok: true };
  });

export const deleteCostLine = authedAction
  .schema(z.object({ costLineId: z.string().uuid(), engagementId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "diligence");
    await db
      .delete(diligenceCostLines)
      .where(
        and(
          eq(diligenceCostLines.id, parsedInput.costLineId),
          eq(diligenceCostLines.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { ok: true };
  });
