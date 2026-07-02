"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clientBackupStrategy,
  clientBackupSystems,
  clientNetworkCircuits,
  clientNetworkSegments,
  clients,
} from "@/db/schema";
import { can } from "@/lib/rbac";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

async function assertClient(clientId: string, organizationId: string) {
  const c = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, clientId),
      eq(clients.organizationId, organizationId),
    ),
  });
  if (!c) throw new PublicError("Client not found");
  return c;
}

const onePasswordUrl = z
  .string()
  .url()
  .max(500)
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));

/* ============================================================================
 * NETWORK CIRCUITS
 * ========================================================================== */
const circuitSchema = z.object({
  clientId: z.string().uuid(),
  locationId: z.string().uuid().optional().nullable(),
  role: z
    .enum(["primary", "failover", "out_of_band", "dedicated_line", "other"])
    .default("primary"),
  carrier: z.string().min(1).max(120),
  productLabel: z.string().max(200).optional().nullable(),
  speedDownMbps: z.number().int().nonnegative().max(1_000_000).optional().nullable(),
  speedUpMbps: z.number().int().nonnegative().max(1_000_000).optional().nullable(),
  staticIpRange: z.string().max(120).optional().nullable(),
  accountNumber: z.string().max(120).optional().nullable(),
  supportPhone: z.string().max(60).optional().nullable(),
  supportPortalUrl: z
    .string()
    .url()
    .max(500)
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  termEndsAt: z.string().optional().nullable(),
  monthlyCostCents: z.number().int().nonnegative().optional().nullable(),
  vendorId: z.string().uuid().optional().nullable(),
  serviceId: z.string().uuid().optional().nullable(),
  onePasswordItemUrl: onePasswordUrl,
  notes: z.string().max(20_000).optional().nullable(),
});

export const createNetworkCircuit = authedAction
  .schema(circuitSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertClient(parsedInput.clientId, ctx.organization.id);
    const canFinance = can("update", "finance", {
      role: ctx.membership.role,
      financeAccess: ctx.membership.financeAccess,
    });
    const [created] = await db
      .insert(clientNetworkCircuits)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        locationId: parsedInput.locationId || null,
        role: parsedInput.role,
        carrier: parsedInput.carrier.trim(),
        productLabel: parsedInput.productLabel?.trim() || null,
        speedDownMbps: parsedInput.speedDownMbps ?? null,
        speedUpMbps: parsedInput.speedUpMbps ?? null,
        staticIpRange: parsedInput.staticIpRange?.trim() || null,
        accountNumber: parsedInput.accountNumber?.trim() || null,
        supportPhone: parsedInput.supportPhone?.trim() || null,
        supportPortalUrl: parsedInput.supportPortalUrl?.trim() || null,
        termEndsAt: parsedInput.termEndsAt || null,
        monthlyCostCents: canFinance ? parsedInput.monthlyCostCents ?? null : null,
        vendorId: parsedInput.vendorId || null,
        serviceId: parsedInput.serviceId || null,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    revalidatePath(`/clients/${parsedInput.clientId}`, "layout");
    return { circuit: created };
  });

export const updateNetworkCircuit = authedAction
  .schema(circuitSchema.extend({ circuitId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const canFinance = can("update", "finance", {
      role: ctx.membership.role,
      financeAccess: ctx.membership.financeAccess,
    });
    const existing = await db.query.clientNetworkCircuits.findFirst({
      where: and(
        eq(clientNetworkCircuits.id, parsedInput.circuitId),
        eq(clientNetworkCircuits.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Circuit not found");
    await db
      .update(clientNetworkCircuits)
      .set({
        locationId: parsedInput.locationId || null,
        role: parsedInput.role,
        carrier: parsedInput.carrier.trim(),
        productLabel: parsedInput.productLabel?.trim() || null,
        speedDownMbps: parsedInput.speedDownMbps ?? null,
        speedUpMbps: parsedInput.speedUpMbps ?? null,
        staticIpRange: parsedInput.staticIpRange?.trim() || null,
        accountNumber: parsedInput.accountNumber?.trim() || null,
        supportPhone: parsedInput.supportPhone?.trim() || null,
        supportPortalUrl: parsedInput.supportPortalUrl?.trim() || null,
        termEndsAt: parsedInput.termEndsAt || null,
        monthlyCostCents: canFinance
          ? parsedInput.monthlyCostCents ?? null
          : existing.monthlyCostCents,
        vendorId: parsedInput.vendorId || null,
        serviceId: parsedInput.serviceId || null,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(clientNetworkCircuits.id, parsedInput.circuitId));
    revalidatePath(`/clients/${parsedInput.clientId}`, "layout");
    return { ok: true };
  });

export const deleteNetworkCircuit = authedAction
  .schema(
    z.object({
      circuitId: z.string().uuid(),
      clientId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .delete(clientNetworkCircuits)
      .where(
        and(
          eq(clientNetworkCircuits.id, parsedInput.circuitId),
          eq(clientNetworkCircuits.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`, "layout");
    return { ok: true };
  });

/* ============================================================================
 * NETWORK SEGMENTS / VLANs
 * ========================================================================== */
const segmentSchema = z.object({
  clientId: z.string().uuid(),
  locationId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(120),
  vlanId: z.number().int().min(0).max(4096).optional().nullable(),
  subnet: z.string().max(60).optional().nullable(),
  gateway: z.string().max(60).optional().nullable(),
  dhcpScope: z.string().max(120).optional().nullable(),
  isolatedFromCorp: z.boolean().default(false),
  purpose: z.string().max(2_000).optional().nullable(),
  notes: z.string().max(20_000).optional().nullable(),
});

export const createNetworkSegment = authedAction
  .schema(segmentSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertClient(parsedInput.clientId, ctx.organization.id);
    const [created] = await db
      .insert(clientNetworkSegments)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        locationId: parsedInput.locationId || null,
        name: parsedInput.name.trim(),
        vlanId: parsedInput.vlanId ?? null,
        subnet: parsedInput.subnet?.trim() || null,
        gateway: parsedInput.gateway?.trim() || null,
        dhcpScope: parsedInput.dhcpScope?.trim() || null,
        isolatedFromCorp: parsedInput.isolatedFromCorp,
        purpose: parsedInput.purpose?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    revalidatePath(`/clients/${parsedInput.clientId}`, "layout");
    return { segment: created };
  });

export const updateNetworkSegment = authedAction
  .schema(segmentSchema.extend({ segmentId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .update(clientNetworkSegments)
      .set({
        locationId: parsedInput.locationId || null,
        name: parsedInput.name.trim(),
        vlanId: parsedInput.vlanId ?? null,
        subnet: parsedInput.subnet?.trim() || null,
        gateway: parsedInput.gateway?.trim() || null,
        dhcpScope: parsedInput.dhcpScope?.trim() || null,
        isolatedFromCorp: parsedInput.isolatedFromCorp,
        purpose: parsedInput.purpose?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientNetworkSegments.id, parsedInput.segmentId),
          eq(clientNetworkSegments.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`, "layout");
    return { ok: true };
  });

export const deleteNetworkSegment = authedAction
  .schema(
    z.object({
      segmentId: z.string().uuid(),
      clientId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .delete(clientNetworkSegments)
      .where(
        and(
          eq(clientNetworkSegments.id, parsedInput.segmentId),
          eq(clientNetworkSegments.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`, "layout");
    return { ok: true };
  });

/* ============================================================================
 * BACKUP STRATEGY (1:1 with client — upsert)
 * ========================================================================== */
const strategySchema = z.object({
  clientId: z.string().uuid(),
  rpoMinutes: z.number().int().nonnegative().max(525_600).optional().nullable(),
  rtoMinutes: z.number().int().nonnegative().max(525_600).optional().nullable(),
  offsiteCopy: z.boolean().default(false),
  offsiteLocation: z.string().max(200).optional().nullable(),
  immutableCopy: z.boolean().default(false),
  encryptionAtRest: z.boolean().default(false),
  drRunbookUrl: z
    .string()
    .url()
    .max(500)
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  lastRestoreTestAt: z.string().optional().nullable(),
  restoreTestCadence: z
    .enum(["monthly", "quarterly", "semi_annual", "annual", "ad_hoc", "never"])
    .optional()
    .nullable(),
  notes: z.string().max(20_000).optional().nullable(),
});

export const upsertBackupStrategy = authedAction
  .schema(strategySchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertClient(parsedInput.clientId, ctx.organization.id);
    await db
      .insert(clientBackupStrategy)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        rpoMinutes: parsedInput.rpoMinutes ?? null,
        rtoMinutes: parsedInput.rtoMinutes ?? null,
        offsiteCopy: parsedInput.offsiteCopy,
        offsiteLocation: parsedInput.offsiteLocation?.trim() || null,
        immutableCopy: parsedInput.immutableCopy,
        encryptionAtRest: parsedInput.encryptionAtRest,
        drRunbookUrl: parsedInput.drRunbookUrl?.trim() || null,
        lastRestoreTestAt: parsedInput.lastRestoreTestAt || null,
        restoreTestCadence: parsedInput.restoreTestCadence ?? null,
        notes: parsedInput.notes?.trim() || null,
      })
      .onConflictDoUpdate({
        target: clientBackupStrategy.clientId,
        set: {
          rpoMinutes: parsedInput.rpoMinutes ?? null,
          rtoMinutes: parsedInput.rtoMinutes ?? null,
          offsiteCopy: parsedInput.offsiteCopy,
          offsiteLocation: parsedInput.offsiteLocation?.trim() || null,
          immutableCopy: parsedInput.immutableCopy,
          encryptionAtRest: parsedInput.encryptionAtRest,
          drRunbookUrl: parsedInput.drRunbookUrl?.trim() || null,
          lastRestoreTestAt: parsedInput.lastRestoreTestAt || null,
          restoreTestCadence: parsedInput.restoreTestCadence ?? null,
          notes: parsedInput.notes?.trim() || null,
          updatedAt: new Date(),
        },
      });
    revalidatePath(`/clients/${parsedInput.clientId}`, "layout");
    return { ok: true };
  });

/* ============================================================================
 * BACKUP SYSTEMS (many per client)
 * ========================================================================== */
const systemSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(200),
  vendorId: z.string().uuid().optional().nullable(),
  serviceId: z.string().uuid().optional().nullable(),
  scopeKinds: z.array(z.string().max(60)).default([]),
  scopeNotes: z.string().max(2_000).optional().nullable(),
  frequency: z.string().max(120).optional().nullable(),
  retention: z.string().max(200).optional().nullable(),
  destinationKind: z
    .enum(["cloud", "onprem", "hybrid", "tape", "other"])
    .optional()
    .nullable(),
  destinationLocation: z.string().max(200).optional().nullable(),
  monitoringNotes: z.string().max(2_000).optional().nullable(),
  onePasswordItemUrl: onePasswordUrl,
  notes: z.string().max(20_000).optional().nullable(),
});

export const createBackupSystem = authedAction
  .schema(systemSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertClient(parsedInput.clientId, ctx.organization.id);
    const [created] = await db
      .insert(clientBackupSystems)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        name: parsedInput.name.trim(),
        vendorId: parsedInput.vendorId || null,
        serviceId: parsedInput.serviceId || null,
        scopeKinds: parsedInput.scopeKinds,
        scopeNotes: parsedInput.scopeNotes?.trim() || null,
        frequency: parsedInput.frequency?.trim() || null,
        retention: parsedInput.retention?.trim() || null,
        destinationKind: parsedInput.destinationKind ?? null,
        destinationLocation: parsedInput.destinationLocation?.trim() || null,
        monitoringNotes: parsedInput.monitoringNotes?.trim() || null,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    revalidatePath(`/clients/${parsedInput.clientId}`, "layout");
    return { system: created };
  });

export const updateBackupSystem = authedAction
  .schema(systemSchema.extend({ systemId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .update(clientBackupSystems)
      .set({
        name: parsedInput.name.trim(),
        vendorId: parsedInput.vendorId || null,
        serviceId: parsedInput.serviceId || null,
        scopeKinds: parsedInput.scopeKinds,
        scopeNotes: parsedInput.scopeNotes?.trim() || null,
        frequency: parsedInput.frequency?.trim() || null,
        retention: parsedInput.retention?.trim() || null,
        destinationKind: parsedInput.destinationKind ?? null,
        destinationLocation: parsedInput.destinationLocation?.trim() || null,
        monitoringNotes: parsedInput.monitoringNotes?.trim() || null,
        onePasswordItemUrl: parsedInput.onePasswordItemUrl?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientBackupSystems.id, parsedInput.systemId),
          eq(clientBackupSystems.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`, "layout");
    return { ok: true };
  });

export const deleteBackupSystem = authedAction
  .schema(
    z.object({
      systemId: z.string().uuid(),
      clientId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .delete(clientBackupSystems)
      .where(
        and(
          eq(clientBackupSystems.id, parsedInput.systemId),
          eq(clientBackupSystems.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`, "layout");
    return { ok: true };
  });
