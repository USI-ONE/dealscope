"use server";

/**
 * Compliance / standards / gap-assessment actions.
 *
 * Three groups:
 *   - Standards CRUD + clone-from-starter-pack
 *   - Control CRUD inside a standard (add domain header / leaf control)
 *   - Per-client assessment upserts
 */
import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clientApplicableStandards,
  clientControlAssessments,
  clients,
  diligenceEngagementApplicableStandards,
  diligenceEngagementControlAssessments,
  diligenceEngagements,
  standardControls,
  standards,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import {
  findStarterPack,
  type StarterStandard,
} from "@/lib/compliance/starter-packs";

/* ============================================================================
 * STANDARDS
 * ========================================================================== */
const standardSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(20_000).optional().nullable(),
  version: z.string().max(40).optional().nullable(),
  source: z
    .enum([
      "internal",
      "cis_v8",
      "nist_csf_2",
      "iso_27001",
      "soc2",
      "hipaa",
      "pci_dss",
      "cyber_insurance",
      "industry_specific",
      "custom",
    ])
    .default("internal"),
});

export const createStandard = authedAction
  .schema(standardSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const [created] = await db
      .insert(standards)
      .values({
        organizationId: ctx.organization.id,
        name: parsedInput.name.trim(),
        description: parsedInput.description?.trim() || null,
        version: parsedInput.version?.trim() || null,
        source: parsedInput.source,
      })
      .returning();
    revalidatePath("/standards");
    return { standard: created };
  });

export const updateStandard = authedAction
  .schema(standardSchema.partial().extend({ standardId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const std = await assertStandard(parsedInput.standardId, ctx.organization.id);
    await db
      .update(standards)
      .set({
        name: parsedInput.name?.trim() ?? std.name,
        description:
          parsedInput.description !== undefined
            ? parsedInput.description?.trim() || null
            : std.description,
        version:
          parsedInput.version !== undefined
            ? parsedInput.version?.trim() || null
            : std.version,
        source: parsedInput.source ?? std.source,
        updatedAt: new Date(),
      })
      .where(eq(standards.id, std.id));
    revalidatePath(`/standards/${std.id}`);
    revalidatePath("/standards");
    return { ok: true };
  });

export const deleteStandard = authedAction
  .schema(z.object({ standardId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "client");
    const std = await assertStandard(parsedInput.standardId, ctx.organization.id);
    await db.delete(standards).where(eq(standards.id, std.id));
    revalidatePath("/standards");
    return { ok: true };
  });

/* ============================================================================
 * CLONE FROM STARTER PACK — copy a built-in pack into the org as a
 * writable standard.
 * ========================================================================== */
export const cloneStarterPack = authedAction
  .schema(z.object({ slug: z.string().min(1).max(80) }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const pack = findStarterPack(parsedInput.slug);
    if (!pack) throw new PublicError("Starter pack not found");
    const created = await cloneStarterIntoOrg(pack, ctx.organization.id);
    revalidatePath("/standards");
    return { standard: created };
  });

async function cloneStarterIntoOrg(pack: StarterStandard, organizationId: string) {
  // Insert standard
  const [std] = await db
    .insert(standards)
    .values({
      organizationId,
      name: pack.name,
      description: pack.description,
      version: pack.version,
      source: pack.source,
    })
    .returning();

  // Insert each domain header + its controls.
  let position = 0;
  for (const dom of pack.domains) {
    const [domainRow] = await db
      .insert(standardControls)
      .values({
        standardId: std.id,
        parentId: null,
        code: dom.code ?? null,
        title: dom.title,
        description: dom.description ?? null,
        guidance: null,
        position: position++,
      })
      .returning();

    let leafPos = 0;
    for (const c of dom.controls) {
      await db.insert(standardControls).values({
        standardId: std.id,
        parentId: domainRow.id,
        code: c.code ?? null,
        title: c.title,
        description: c.description ?? null,
        guidance: c.guidance ?? null,
        position: leafPos++,
      });
    }
  }

  return std;
}

/* ============================================================================
 * CONTROLS
 * ========================================================================== */
const controlSchema = z.object({
  standardId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  code: z.string().max(40).optional().nullable(),
  title: z.string().min(1).max(300),
  description: z.string().max(20_000).optional().nullable(),
  guidance: z.string().max(20_000).optional().nullable(),
});

export const createControl = authedAction
  .schema(controlSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertStandard(parsedInput.standardId, ctx.organization.id);
    if (parsedInput.parentId) {
      await assertControl(parsedInput.parentId, parsedInput.standardId);
    }
    // Append at the bottom of its sibling group.
    const siblings = await db
      .select({ position: standardControls.position })
      .from(standardControls)
      .where(
        and(
          eq(standardControls.standardId, parsedInput.standardId),
          parsedInput.parentId
            ? eq(standardControls.parentId, parsedInput.parentId)
            : isNull(standardControls.parentId),
        ),
      );
    const nextPos = siblings.reduce((m, s) => Math.max(m, s.position), -1) + 1;

    const [created] = await db
      .insert(standardControls)
      .values({
        standardId: parsedInput.standardId,
        parentId: parsedInput.parentId ?? null,
        code: parsedInput.code?.trim() || null,
        title: parsedInput.title.trim(),
        description: parsedInput.description?.trim() || null,
        guidance: parsedInput.guidance?.trim() || null,
        position: nextPos,
      })
      .returning();
    revalidatePath(`/standards/${parsedInput.standardId}`);
    return { control: created };
  });

export const updateControl = authedAction
  .schema(
    controlSchema
      .partial()
      .extend({
        controlId: z.string().uuid(),
        standardId: z.string().uuid(),
      }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertStandard(parsedInput.standardId, ctx.organization.id);
    const ctrl = await assertControl(parsedInput.controlId, parsedInput.standardId);
    await db
      .update(standardControls)
      .set({
        code:
          parsedInput.code !== undefined
            ? parsedInput.code?.trim() || null
            : ctrl.code,
        title: parsedInput.title?.trim() ?? ctrl.title,
        description:
          parsedInput.description !== undefined
            ? parsedInput.description?.trim() || null
            : ctrl.description,
        guidance:
          parsedInput.guidance !== undefined
            ? parsedInput.guidance?.trim() || null
            : ctrl.guidance,
        updatedAt: new Date(),
      })
      .where(eq(standardControls.id, ctrl.id));
    revalidatePath(`/standards/${parsedInput.standardId}`);
    return { ok: true };
  });

export const deleteControl = authedAction
  .schema(
    z.object({
      controlId: z.string().uuid(),
      standardId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertStandard(parsedInput.standardId, ctx.organization.id);
    await assertControl(parsedInput.controlId, parsedInput.standardId);
    await db
      .delete(standardControls)
      .where(eq(standardControls.id, parsedInput.controlId));
    revalidatePath(`/standards/${parsedInput.standardId}`);
    return { ok: true };
  });

/* ============================================================================
 * ASSESSMENTS
 * ========================================================================== */
export const upsertAssessment = authedAction
  .schema(
    z.object({
      clientId: z.string().uuid(),
      controlId: z.string().uuid(),
      status: z.enum([
        "compliant",
        "partial",
        "non_compliant",
        "not_applicable",
        "unknown",
      ]),
      score: z.number().int().min(0).max(100).optional().nullable(),
      evidence: z.string().max(50_000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const client = await db.query.clients.findFirst({
      where: and(
        eq(clients.id, parsedInput.clientId),
        eq(clients.organizationId, ctx.organization.id),
      ),
    });
    if (!client) throw new PublicError("Client not found");
    // Verify control belongs to a standard owned by this org.
    const ctrl = await db.query.standardControls.findFirst({
      where: eq(standardControls.id, parsedInput.controlId),
    });
    if (!ctrl) throw new PublicError("Control not found");
    const std = await db.query.standards.findFirst({
      where: and(
        eq(standards.id, ctrl.standardId),
        eq(standards.organizationId, ctx.organization.id),
      ),
    });
    if (!std) throw new PublicError("Standard not in this org");

    const now = new Date();
    await db
      .insert(clientControlAssessments)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        controlId: parsedInput.controlId,
        status: parsedInput.status,
        score: parsedInput.score ?? null,
        evidence: parsedInput.evidence?.trim() || null,
        assessedByMembershipId: ctx.membership.id,
        assessedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          clientControlAssessments.clientId,
          clientControlAssessments.controlId,
        ],
        set: {
          status: parsedInput.status,
          score: parsedInput.score ?? null,
          evidence: parsedInput.evidence?.trim() || null,
          assessedByMembershipId: ctx.membership.id,
          assessedAt: now,
          updatedAt: now,
        },
      });
    revalidatePath(`/clients/${parsedInput.clientId}/compliance`);
    return { ok: true };
  });

/* ============================================================================
 * APPLICABLE STANDARDS — explicit per-client opt-in. The full applicable
 * set is the union of these rows + standards owned by the client's
 * ownership group (handled by loadApplicableStandards).
 * ========================================================================== */
export const applyStandardToClient = authedAction
  .schema(
    z.object({
      clientId: z.string().uuid(),
      standardId: z.string().uuid(),
      isRequired: z.boolean().default(true),
      rationale: z.string().max(2_000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const client = await db.query.clients.findFirst({
      where: and(
        eq(clients.id, parsedInput.clientId),
        eq(clients.organizationId, ctx.organization.id),
      ),
    });
    if (!client) throw new PublicError("Client not found");
    await assertStandard(parsedInput.standardId, ctx.organization.id);

    await db
      .insert(clientApplicableStandards)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        standardId: parsedInput.standardId,
        isRequired: parsedInput.isRequired ? 1 : 0,
        rationale: parsedInput.rationale?.trim() || null,
      })
      .onConflictDoUpdate({
        target: [
          clientApplicableStandards.clientId,
          clientApplicableStandards.standardId,
        ],
        set: {
          isRequired: parsedInput.isRequired ? 1 : 0,
          rationale: parsedInput.rationale?.trim() || null,
          updatedAt: new Date(),
        },
      });
    revalidatePath(`/clients/${client.id}/compliance`);
    revalidatePath(`/clients/${client.id}`);
    return { ok: true };
  });

export const unapplyStandardFromClient = authedAction
  .schema(
    z.object({
      clientId: z.string().uuid(),
      standardId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .delete(clientApplicableStandards)
      .where(
        and(
          eq(clientApplicableStandards.clientId, parsedInput.clientId),
          eq(clientApplicableStandards.standardId, parsedInput.standardId),
          eq(clientApplicableStandards.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}/compliance`);
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

/* ============================================================================
 * ENGAGEMENT-SCOPED COMPLIANCE — measure a diligence target against
 * applicable standards during discovery. Same shape as the client-side
 * actions, but keyed on engagement instead of client.
 * ========================================================================== */
export const applyStandardToEngagement = authedAction
  .schema(
    z.object({
      engagementId: z.string().uuid(),
      standardId: z.string().uuid(),
      isRequired: z.boolean().default(true),
      rationale: z.string().max(2_000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    await assertEngagement(parsedInput.engagementId, ctx.organization.id);
    await assertStandard(parsedInput.standardId, ctx.organization.id);

    await db
      .insert(diligenceEngagementApplicableStandards)
      .values({
        organizationId: ctx.organization.id,
        engagementId: parsedInput.engagementId,
        standardId: parsedInput.standardId,
        isRequired: parsedInput.isRequired ? 1 : 0,
        rationale: parsedInput.rationale?.trim() || null,
      })
      .onConflictDoUpdate({
        target: [
          diligenceEngagementApplicableStandards.engagementId,
          diligenceEngagementApplicableStandards.standardId,
        ],
        set: {
          isRequired: parsedInput.isRequired ? 1 : 0,
          rationale: parsedInput.rationale?.trim() || null,
          updatedAt: new Date(),
        },
      });
    revalidatePath(`/diligence/${parsedInput.engagementId}/compliance`);
    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { ok: true };
  });

export const unapplyStandardFromEngagement = authedAction
  .schema(
    z.object({
      engagementId: z.string().uuid(),
      standardId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    await db
      .delete(diligenceEngagementApplicableStandards)
      .where(
        and(
          eq(
            diligenceEngagementApplicableStandards.engagementId,
            parsedInput.engagementId,
          ),
          eq(
            diligenceEngagementApplicableStandards.standardId,
            parsedInput.standardId,
          ),
          eq(
            diligenceEngagementApplicableStandards.organizationId,
            ctx.organization.id,
          ),
        ),
      );
    revalidatePath(`/diligence/${parsedInput.engagementId}/compliance`);
    revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { ok: true };
  });

export const upsertEngagementAssessment = authedAction
  .schema(
    z.object({
      engagementId: z.string().uuid(),
      controlId: z.string().uuid(),
      status: z.enum([
        "compliant",
        "partial",
        "non_compliant",
        "not_applicable",
        "unknown",
      ]),
      score: z.number().int().min(0).max(100).optional().nullable(),
      evidence: z.string().max(50_000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    await assertEngagement(parsedInput.engagementId, ctx.organization.id);
    const ctrl = await db.query.standardControls.findFirst({
      where: eq(standardControls.id, parsedInput.controlId),
    });
    if (!ctrl) throw new PublicError("Control not found");
    const std = await db.query.standards.findFirst({
      where: and(
        eq(standards.id, ctrl.standardId),
        eq(standards.organizationId, ctx.organization.id),
      ),
    });
    if (!std) throw new PublicError("Standard not in this org");

    const now = new Date();
    await db
      .insert(diligenceEngagementControlAssessments)
      .values({
        organizationId: ctx.organization.id,
        engagementId: parsedInput.engagementId,
        controlId: parsedInput.controlId,
        status: parsedInput.status,
        score: parsedInput.score ?? null,
        evidence: parsedInput.evidence?.trim() || null,
        assessedByMembershipId: ctx.membership.id,
        assessedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          diligenceEngagementControlAssessments.engagementId,
          diligenceEngagementControlAssessments.controlId,
        ],
        set: {
          status: parsedInput.status,
          score: parsedInput.score ?? null,
          evidence: parsedInput.evidence?.trim() || null,
          assessedByMembershipId: ctx.membership.id,
          assessedAt: now,
          updatedAt: now,
        },
      });
    revalidatePath(`/diligence/${parsedInput.engagementId}/compliance`);
    return { ok: true };
  });

/* ============================================================================
 * Read helpers
 * ========================================================================== */
export async function loadStandardWithControls(
  standardId: string,
  organizationId: string,
) {
  const std = await db.query.standards.findFirst({
    where: and(
      eq(standards.id, standardId),
      eq(standards.organizationId, organizationId),
    ),
  });
  if (!std) return null;
  const controls = await db
    .select()
    .from(standardControls)
    .where(eq(standardControls.standardId, standardId))
    .orderBy(asc(standardControls.position));
  return { standard: std, controls };
}

export async function loadAssessmentMap(
  clientId: string,
  organizationId: string,
) {
  const rows = await db
    .select()
    .from(clientControlAssessments)
    .where(
      and(
        eq(clientControlAssessments.clientId, clientId),
        eq(clientControlAssessments.organizationId, organizationId),
      ),
    );
  const map = new Map<string, (typeof rows)[number]>();
  for (const r of rows) map.set(r.controlId, r);
  return map;
}

export async function loadEngagementApplicableStandards(
  engagementId: string,
  organizationId: string,
) {
  const rows = await db
    .select({
      standard: standards,
      isRequired: diligenceEngagementApplicableStandards.isRequired,
      rationale: diligenceEngagementApplicableStandards.rationale,
    })
    .from(diligenceEngagementApplicableStandards)
    .innerJoin(
      standards,
      eq(diligenceEngagementApplicableStandards.standardId, standards.id),
    )
    .where(
      and(
        eq(diligenceEngagementApplicableStandards.engagementId, engagementId),
        eq(
          diligenceEngagementApplicableStandards.organizationId,
          organizationId,
        ),
      ),
    )
    .orderBy(asc(standards.name));
  return rows.map((r) => ({
    standard: r.standard,
    isRequired: !!r.isRequired,
    rationale: r.rationale,
  }));
}

export async function loadEngagementAssessmentMap(
  engagementId: string,
  organizationId: string,
) {
  const rows = await db
    .select()
    .from(diligenceEngagementControlAssessments)
    .where(
      and(
        eq(diligenceEngagementControlAssessments.engagementId, engagementId),
        eq(
          diligenceEngagementControlAssessments.organizationId,
          organizationId,
        ),
      ),
    );
  const map = new Map<string, (typeof rows)[number]>();
  for (const r of rows) map.set(r.controlId, r);
  return map;
}

/* --------------------------------------------------------------------- */
async function assertEngagement(engagementId: string, organizationId: string) {
  const e = await db.query.diligenceEngagements.findFirst({
    where: and(
      eq(diligenceEngagements.id, engagementId),
      eq(diligenceEngagements.organizationId, organizationId),
    ),
  });
  if (!e) throw new PublicError("Engagement not found");
  return e;
}

async function assertStandard(standardId: string, organizationId: string) {
  const std = await db.query.standards.findFirst({
    where: and(
      eq(standards.id, standardId),
      eq(standards.organizationId, organizationId),
    ),
  });
  if (!std) throw new PublicError("Standard not found");
  return std;
}

async function assertControl(controlId: string, standardId: string) {
  const ctrl = await db.query.standardControls.findFirst({
    where: and(
      eq(standardControls.id, controlId),
      eq(standardControls.standardId, standardId),
    ),
  });
  if (!ctrl) throw new PublicError("Control not found");
  return ctrl;
}

