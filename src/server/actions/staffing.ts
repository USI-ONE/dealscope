"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clientAppRegistrations,
  clientLocations,
  clientStaffingProfiles,
  clients,
  hardware,
  staffAssignments,
  staffMembers,
  strategicInitiatives,
} from "@/db/schema";
import { calcFte } from "@/lib/staffing/calc";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

const AUTOMATION = z.enum(["manual", "partial", "high"]);
const STRATEGIC = z.enum(["none", "low", "medium", "high"]);
const SUPPORT = z.enum(["low", "standard", "high"]);
const INITIATIVE_STATUS = z.enum([
  "planned",
  "in_progress",
  "completed",
  "cancelled",
]);

/* ============================================================================
 * RECOMPUTE TIER 3 FROM INITIATIVES
 * Keeps clientStaffingProfiles.tier3Fte in sync with the sum of
 * tier3FteRequired across active initiatives for that client.
 * ========================================================================== */
async function recomputeClientTier3(clientId: string, organizationId: string) {
  const [{ total = "0" } = { total: "0" }] = await db
    .select({
      total: sql<string>`coalesce(sum(${strategicInitiatives.tier3FteRequired}), 0)::text`,
    })
    .from(strategicInitiatives)
    .where(
      and(
        eq(strategicInitiatives.organizationId, organizationId),
        eq(strategicInitiatives.clientId, clientId),
        sql`${strategicInitiatives.status} IN ('planned','in_progress')`,
      ),
    );
  await db
    .update(clientStaffingProfiles)
    .set({ tier3Fte: total, updatedAt: new Date() })
    .where(
      and(
        eq(clientStaffingProfiles.organizationId, organizationId),
        eq(clientStaffingProfiles.clientId, clientId),
      ),
    );
}

/* ============================================================================
 * STAFFING PROFILES
 * ========================================================================== */
const profileSchema = z.object({
  clientId: z.string().uuid(),
  userCount: z.number().int().nonnegative().max(100_000),
  sites: z.number().int().min(1).max(10_000),
  servers: z.number().int().nonnegative().max(10_000),
  apps: z.number().int().nonnegative().max(10_000),
  automationMaturity: AUTOMATION,
  strategicIntensity: STRATEGIC,
  supportIntensity: SUPPORT,
  notes: z.string().max(4000).optional().nullable(),
});

export const upsertStaffingProfile = authedAction
  .schema(profileSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");

    // Confirm client belongs to this org.
    const c = await db.query.clients.findFirst({
      where: and(
        eq(clients.id, parsedInput.clientId),
        eq(clients.organizationId, ctx.organization.id),
      ),
    });
    if (!c) throw new PublicError("Client not found in this organization.");

    // Compute the canonical FTE numbers server-side so a hand-crafted
    // request can't desync the calc from the stored output.
    const fte = calcFte({
      userCount: parsedInput.userCount,
      sites: parsedInput.sites,
      servers: parsedInput.servers,
      apps: parsedInput.apps,
      automationMaturity: parsedInput.automationMaturity,
      strategicIntensity: parsedInput.strategicIntensity,
      supportIntensity: parsedInput.supportIntensity,
    });

    const values = {
      organizationId: ctx.organization.id,
      clientId: parsedInput.clientId,
      userCount: parsedInput.userCount,
      sites: parsedInput.sites,
      servers: parsedInput.servers,
      apps: parsedInput.apps,
      automationMaturity: parsedInput.automationMaturity,
      strategicIntensity: parsedInput.strategicIntensity,
      supportIntensity: parsedInput.supportIntensity,
      tier1Fte: fte.tier1Fte.toFixed(2),
      tier2Fte: fte.tier2Fte.toFixed(2),
      notes: parsedInput.notes?.trim() || null,
    };

    await db
      .insert(clientStaffingProfiles)
      .values(values)
      .onConflictDoUpdate({
        target: clientStaffingProfiles.clientId,
        set: {
          ...values,
          updatedAt: new Date(),
        },
      });

    // Initiatives are the source of truth for tier 3 — re-aggregate
    // every save (cheap, and keeps the value fresh after import).
    await recomputeClientTier3(parsedInput.clientId, ctx.organization.id);

    revalidatePath("/staffing");
    revalidatePath("/staffing/clients");
    return { ok: true, fte };
  });

/**
 * Seed staffing profiles in bulk for every active client that doesn't
 * have one yet. Pre-fills sites/servers/apps from existing TechOS data
 * (locations / active server hardware / app registrations). Manual
 * matrix fields default to safe baselines.
 */
export const seedStaffingProfiles = authedAction
  .schema(z.object({}))
  .action(async ({ ctx }) => {
    await authorize("update", "client");

    // Pull active clients without a profile.
    const orphanRows = await db
      .select({ id: clients.id })
      .from(clients)
      .leftJoin(
        clientStaffingProfiles,
        eq(clientStaffingProfiles.clientId, clients.id),
      )
      .where(
        and(
          eq(clients.organizationId, ctx.organization.id),
          isNull(clients.archivedAt),
          isNull(clientStaffingProfiles.id),
        ),
      );
    if (orphanRows.length === 0) {
      return { ok: true, created: 0 };
    }

    // Batched suggestion lookups — same shape as state.ts.
    const orphanIds = new Set(orphanRows.map((r) => r.id));
    const [siteCounts, serverCounts, appCounts] = await Promise.all([
      db
        .select({
          clientId: clientLocations.clientId,
          n: sql<number>`count(*)::int`.as("n"),
        })
        .from(clientLocations)
        .where(eq(clientLocations.organizationId, ctx.organization.id))
        .groupBy(clientLocations.clientId),
      db
        .select({
          clientId: hardware.clientId,
          n: sql<number>`count(*)::int`.as("n"),
        })
        .from(hardware)
        .where(
          and(
            eq(hardware.organizationId, ctx.organization.id),
            eq(hardware.kind, "server"),
            eq(hardware.status, "active"),
          ),
        )
        .groupBy(hardware.clientId),
      db
        .select({
          clientId: clientAppRegistrations.clientId,
          n: sql<number>`count(*)::int`.as("n"),
        })
        .from(clientAppRegistrations)
        .where(
          eq(clientAppRegistrations.organizationId, ctx.organization.id),
        )
        .groupBy(clientAppRegistrations.clientId),
    ]);
    const sites = new Map(siteCounts.map((r) => [r.clientId, r.n]));
    const servers = new Map(serverCounts.map((r) => [r.clientId, r.n]));
    const apps = new Map(appCounts.map((r) => [r.clientId, r.n]));

    let created = 0;
    for (const id of orphanIds) {
      const sitesN = Math.max(1, sites.get(id) ?? 1);
      const serversN = servers.get(id) ?? 0;
      const appsN = apps.get(id) ?? 0;
      const fte = calcFte({
        userCount: 0,
        sites: sitesN,
        servers: serversN,
        apps: appsN,
        automationMaturity: "manual",
        strategicIntensity: "none",
        supportIntensity: "standard",
      });
      await db.insert(clientStaffingProfiles).values({
        organizationId: ctx.organization.id,
        clientId: id,
        userCount: 0,
        sites: sitesN,
        servers: serversN,
        apps: appsN,
        automationMaturity: "manual",
        strategicIntensity: "none",
        supportIntensity: "standard",
        tier1Fte: fte.tier1Fte.toFixed(2),
        tier2Fte: fte.tier2Fte.toFixed(2),
      });
      created++;
    }
    revalidatePath("/staffing");
    revalidatePath("/staffing/clients");
    return { ok: true, created };
  });

/* ============================================================================
 * STAFF MEMBERS
 * ========================================================================== */
const staffSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200).optional().nullable().or(z.literal("")),
  tier: z.number().int().min(1).max(3),
  capacityFte: z.number().nonnegative().max(2),
  annualCostCents: z.number().int().nonnegative().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

export const createStaffMember = authedAction
  .schema(staffSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "membership");
    const [created] = await db
      .insert(staffMembers)
      .values({
        organizationId: ctx.organization.id,
        name: parsedInput.name.trim(),
        email: parsedInput.email?.trim() || null,
        tier: parsedInput.tier,
        capacityFte: parsedInput.capacityFte.toFixed(2),
        annualCostCents: parsedInput.annualCostCents ?? null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    revalidatePath("/staffing");
    return { ok: true, staff: created };
  });

export const updateStaffMember = authedAction
  .schema(staffSchema.extend({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "membership");
    await db
      .update(staffMembers)
      .set({
        name: parsedInput.name.trim(),
        email: parsedInput.email?.trim() || null,
        tier: parsedInput.tier,
        capacityFte: parsedInput.capacityFte.toFixed(2),
        annualCostCents: parsedInput.annualCostCents ?? null,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(staffMembers.id, parsedInput.id),
          eq(staffMembers.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/staffing");
    return { ok: true };
  });

export const deleteStaffMember = authedAction
  .schema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "membership");
    await db
      .delete(staffMembers)
      .where(
        and(
          eq(staffMembers.id, parsedInput.id),
          eq(staffMembers.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/staffing");
    return { ok: true };
  });

/* ============================================================================
 * ASSIGNMENTS
 * ========================================================================== */
const assignmentSchema = z.object({
  staffMemberId: z.string().uuid(),
  clientId: z.string().uuid(),
  allocatedFte: z.number().nonnegative().max(2),
  notes: z.string().max(2000).optional().nullable(),
});

export const upsertStaffAssignment = authedAction
  .schema(assignmentSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "membership");
    await db
      .insert(staffAssignments)
      .values({
        organizationId: ctx.organization.id,
        staffMemberId: parsedInput.staffMemberId,
        clientId: parsedInput.clientId,
        allocatedFte: parsedInput.allocatedFte.toFixed(2),
        notes: parsedInput.notes?.trim() || null,
      })
      .onConflictDoUpdate({
        target: [staffAssignments.staffMemberId, staffAssignments.clientId],
        set: {
          allocatedFte: parsedInput.allocatedFte.toFixed(2),
          notes: parsedInput.notes?.trim() || null,
          updatedAt: new Date(),
        },
      });
    revalidatePath("/staffing");
    return { ok: true };
  });

export const deleteStaffAssignment = authedAction
  .schema(
    z.object({
      staffMemberId: z.string().uuid(),
      clientId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "membership");
    await db
      .delete(staffAssignments)
      .where(
        and(
          eq(staffAssignments.organizationId, ctx.organization.id),
          eq(staffAssignments.staffMemberId, parsedInput.staffMemberId),
          eq(staffAssignments.clientId, parsedInput.clientId),
        ),
      );
    revalidatePath("/staffing");
    return { ok: true };
  });

/* ============================================================================
 * STRATEGIC INITIATIVES (Tier 3 drivers)
 * ========================================================================== */
const initiativeSchema = z.object({
  name: z.string().min(1).max(200),
  clientId: z.string().uuid().nullable(),
  tier3FteRequired: z.number().nonnegative().max(10),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: INITIATIVE_STATUS,
  notes: z.string().max(4000).optional().nullable(),
});

export const createInitiative = authedAction
  .schema(initiativeSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const [created] = await db
      .insert(strategicInitiatives)
      .values({
        organizationId: ctx.organization.id,
        name: parsedInput.name.trim(),
        clientId: parsedInput.clientId,
        tier3FteRequired: parsedInput.tier3FteRequired.toFixed(2),
        startDate: parsedInput.startDate ?? null,
        endDate: parsedInput.endDate ?? null,
        status: parsedInput.status,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    if (parsedInput.clientId)
      await recomputeClientTier3(parsedInput.clientId, ctx.organization.id);
    revalidatePath("/staffing");
    revalidatePath("/staffing/forecast");
    return { ok: true, initiative: created };
  });

export const updateInitiative = authedAction
  .schema(initiativeSchema.extend({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");

    // Capture the previous clientId so we can recompute its tier3 too
    // if the initiative is being moved.
    const prev = await db.query.strategicInitiatives.findFirst({
      where: and(
        eq(strategicInitiatives.id, parsedInput.id),
        eq(strategicInitiatives.organizationId, ctx.organization.id),
      ),
    });

    await db
      .update(strategicInitiatives)
      .set({
        name: parsedInput.name.trim(),
        clientId: parsedInput.clientId,
        tier3FteRequired: parsedInput.tier3FteRequired.toFixed(2),
        startDate: parsedInput.startDate ?? null,
        endDate: parsedInput.endDate ?? null,
        status: parsedInput.status,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(strategicInitiatives.id, parsedInput.id));

    if (prev?.clientId && prev.clientId !== parsedInput.clientId) {
      await recomputeClientTier3(prev.clientId, ctx.organization.id);
    }
    if (parsedInput.clientId) {
      await recomputeClientTier3(parsedInput.clientId, ctx.organization.id);
    }
    revalidatePath("/staffing");
    revalidatePath("/staffing/forecast");
    return { ok: true };
  });

export const deleteInitiative = authedAction
  .schema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const prev = await db.query.strategicInitiatives.findFirst({
      where: and(
        eq(strategicInitiatives.id, parsedInput.id),
        eq(strategicInitiatives.organizationId, ctx.organization.id),
      ),
    });
    await db
      .delete(strategicInitiatives)
      .where(eq(strategicInitiatives.id, parsedInput.id));
    if (prev?.clientId)
      await recomputeClientTier3(prev.clientId, ctx.organization.id);
    revalidatePath("/staffing");
    revalidatePath("/staffing/forecast");
    return { ok: true };
  });
