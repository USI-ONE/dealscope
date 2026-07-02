"use server";

/**
 * Server actions for multi-vendor integrations.
 *
 *   ensureConnection       — idempotent (org, kind) row create
 *   updateConnectionConfig — save credentials / endpoint / tenant id
 *   setConnectionEnabled   — enable / disable scheduled syncs
 *   testConnection         — run testConnection() on the connector
 *   syncConnection         — pull seat counts for a single connection
 *   syncAllConnections     — pull for every enabled connection
 *   linkVendorClient       — map a vendor's customer to a TechOS client
 *   unlinkVendorClient     — remove a mapping
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  vendorClientMappings,
  vendorConnections,
  type VendorConnectionKind,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import { IMPLEMENTED_KINDS } from "@/lib/integrations/registry";
import {
  runAllSeatSyncs,
  runSeatSync,
  runTestConnection,
} from "@/lib/integrations/sync-runner";

const KINDS = [
  "syncro",
  "liongard",
  "bitdefender_gravityzone",
  "acronis_cyber_cloud",
  "titanhq",
  "microsoft_csp",
  "huntress",
  "threatlocker",
  "datto_rmm",
  "ingram_micro",
  "unifi_network",
] as const satisfies readonly VendorConnectionKind[];

/* ============================================================================
 * ensureConnection
 * Creates the (org, kind) row on demand. Used the first time a user opens
 * a per-kind setup page.
 * ========================================================================== */
export const ensureConnection = authedAction
  .schema(
    z.object({
      kind: z.enum(KINDS),
      displayName: z.string().min(1).max(120).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "organization");
    const existing = await db.query.vendorConnections.findFirst({
      where: and(
        eq(vendorConnections.organizationId, ctx.organization.id),
        eq(vendorConnections.kind, parsedInput.kind),
      ),
    });
    if (existing) return { id: existing.id, created: false };

    const [row] = await db
      .insert(vendorConnections)
      .values({
        organizationId: ctx.organization.id,
        kind: parsedInput.kind,
        displayName: parsedInput.displayName ?? defaultDisplayName(parsedInput.kind),
      })
      .returning({ id: vendorConnections.id });
    revalidatePath("/settings/integrations");
    return { id: row.id, created: true };
  });

function defaultDisplayName(kind: VendorConnectionKind): string {
  return (
    {
      syncro: "Syncro MSP",
      liongard: "Liongard",
      bitdefender_gravityzone: "Bitdefender GravityZone",
      acronis_cyber_cloud: "Acronis Cyber Cloud",
      titanhq: "TitanHQ",
      microsoft_csp: "Microsoft CSP",
      huntress: "Huntress",
      threatlocker: "ThreatLocker",
      datto_rmm: "Datto RMM",
      ingram_micro: "Ingram Micro Cloud Marketplace",
      unifi_network: "UniFi Network",
    } satisfies Record<VendorConnectionKind, string>
  )[kind];
}

/* ============================================================================
 * updateConnectionConfig
 * Writes the freeform configJson blob. Each connector validates its own
 * schema when the row is read; the action is intentionally permissive so
 * partial saves are OK.
 * ========================================================================== */
export const updateConnectionConfig = authedAction
  .schema(
    z.object({
      connectionId: z.string().uuid(),
      displayName: z.string().min(1).max(120),
      configJson: z.record(z.string(), z.unknown()),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "organization");
    const target = await db.query.vendorConnections.findFirst({
      where: and(
        eq(vendorConnections.id, parsedInput.connectionId),
        eq(vendorConnections.organizationId, ctx.organization.id),
      ),
    });
    if (!target) throw new PublicError("Connection not found");

    await db
      .update(vendorConnections)
      .set({
        displayName: parsedInput.displayName,
        configJson: parsedInput.configJson,
        // Bump status from "not_configured" → "configured" so the
        // dashboard reflects that creds are saved (still needs a
        // successful test/sync to flip to "connected").
        status:
          target.status === "not_configured" ? "configured" : target.status,
        updatedAt: new Date(),
      })
      .where(eq(vendorConnections.id, parsedInput.connectionId));
    revalidatePath("/settings/integrations");
    return { ok: true };
  });

/* ============================================================================
 * setConnectionEnabled
 * ========================================================================== */
export const setConnectionEnabled = authedAction
  .schema(
    z.object({
      connectionId: z.string().uuid(),
      enabled: z.boolean(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "organization");
    await db
      .update(vendorConnections)
      .set({
        enabled: parsedInput.enabled,
        status: parsedInput.enabled ? "configured" : "disabled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vendorConnections.id, parsedInput.connectionId),
          eq(vendorConnections.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/settings/integrations");
    return { ok: true };
  });

/* ============================================================================
 * testConnection — exercises the connector's testConnection().
 * ========================================================================== */
export const testConnection = authedAction
  .schema(z.object({ connectionId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "organization");
    const target = await db.query.vendorConnections.findFirst({
      where: and(
        eq(vendorConnections.id, parsedInput.connectionId),
        eq(vendorConnections.organizationId, ctx.organization.id),
      ),
    });
    if (!target) throw new PublicError("Connection not found");
    if (!IMPLEMENTED_KINDS.includes(target.kind)) {
      throw new PublicError(
        `${target.displayName} connector is not yet implemented`,
      );
    }
    const result = await runTestConnection(parsedInput.connectionId);
    revalidatePath("/settings/integrations");
    return result;
  });

/* ============================================================================
 * syncConnection — full pull from one connector → vendor_seat_snapshots.
 * ========================================================================== */
export const syncConnection = authedAction
  .schema(z.object({ connectionId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "organization");
    const target = await db.query.vendorConnections.findFirst({
      where: and(
        eq(vendorConnections.id, parsedInput.connectionId),
        eq(vendorConnections.organizationId, ctx.organization.id),
      ),
    });
    if (!target) throw new PublicError("Connection not found");
    if (!IMPLEMENTED_KINDS.includes(target.kind)) {
      throw new PublicError(
        `${target.displayName} connector is not yet implemented`,
      );
    }
    const result = await runSeatSync(parsedInput.connectionId);
    revalidatePath("/settings/integrations");
    revalidatePath("/finance/reconciliation");
    return result;
  });

/* ============================================================================
 * syncAllConnections — every enabled, configured connection for this org.
 * ========================================================================== */
export const syncAllConnections = authedAction
  .schema(z.object({}))
  .action(async ({ ctx }) => {
    await authorize("update", "organization");
    const results = await runAllSeatSyncs(ctx.organization.id);
    revalidatePath("/settings/integrations");
    revalidatePath("/finance/reconciliation");
    return { results };
  });

/* ============================================================================
 * linkVendorClient / unlinkVendorClient
 * ========================================================================== */
export const linkVendorClient = authedAction
  .schema(
    z.object({
      connectionId: z.string().uuid(),
      vendorClientIdentifier: z.string().min(1),
      vendorClientName: z.string().min(1),
      vendorClientUrl: z.string().url().nullable().optional(),
      clientId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "organization");
    // Upsert via the (connection, identifier) unique index.
    await db
      .insert(vendorClientMappings)
      .values({
        organizationId: ctx.organization.id,
        vendorConnectionId: parsedInput.connectionId,
        vendorClientIdentifier: parsedInput.vendorClientIdentifier,
        vendorClientName: parsedInput.vendorClientName,
        vendorClientUrl: parsedInput.vendorClientUrl ?? null,
        clientId: parsedInput.clientId,
      })
      .onConflictDoUpdate({
        target: [
          vendorClientMappings.vendorConnectionId,
          vendorClientMappings.vendorClientIdentifier,
        ],
        set: {
          clientId: parsedInput.clientId,
          vendorClientName: parsedInput.vendorClientName,
          vendorClientUrl: parsedInput.vendorClientUrl ?? null,
          updatedAt: new Date(),
        },
      });
    revalidatePath("/settings/integrations");
    revalidatePath("/finance/reconciliation");
    return { ok: true };
  });

export const unlinkVendorClient = authedAction
  .schema(z.object({ mappingId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "organization");
    await db
      .delete(vendorClientMappings)
      .where(
        and(
          eq(vendorClientMappings.id, parsedInput.mappingId),
          eq(vendorClientMappings.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/settings/integrations");
    revalidatePath("/finance/reconciliation");
    return { ok: true };
  });
