/**
 * Sync orchestrator.
 *
 * Walks a vendor_connections row → builds the connector → calls
 * listSeats() → writes vendor_seat_snapshots → resolves client_id via
 * vendor_client_mappings → updates the connection's status + timestamps.
 *
 * Idempotent — re-running just appends a new snapshot row per
 * (connection, vendor_client, product). The reconciliation report
 * reads only the most-recent snapshot per tuple.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  vendorClientMappings,
  vendorConnections,
  vendorSeatSnapshots,
  type VendorConnection,
} from "@/db/schema";
import {
  ConnectorAuthError,
  ConnectorConfigError,
  type VendorConnector,
} from "./connector";
import { getConnectorFactory } from "./registry";
import { applySnapshotsToLicenses } from "./apply-snapshots-to-licenses";

/**
 * Build a fresh connector for a connection row.
 */
export function buildConnector(connection: VendorConnection): VendorConnector {
  const factory = getConnectorFactory(connection.kind);
  return factory({
    organizationId: connection.organizationId,
    connectionId: connection.id,
    config: (connection.configJson ?? {}) as Record<string, unknown>,
  });
}

/**
 * Run testConnection() and reflect the result on the connection row.
 * Returns the test result for the caller (e.g. so an action can toast).
 */
export async function runTestConnection(connectionId: string) {
  const conn = await db.query.vendorConnections.findFirst({
    where: eq(vendorConnections.id, connectionId),
  });
  if (!conn) throw new Error("Connection not found");

  try {
    const connector = buildConnector(conn);
    const result = await connector.testConnection();
    await db
      .update(vendorConnections)
      .set({
        status: result.ok ? "connected" : "failed",
        lastSyncMessage: result.message,
        updatedAt: new Date(),
      })
      .where(eq(vendorConnections.id, connectionId));
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isConfig = err instanceof ConnectorConfigError;
    await db
      .update(vendorConnections)
      .set({
        status: isConfig ? "not_configured" : "failed",
        lastSyncMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(vendorConnections.id, connectionId));
    return { ok: false as const, message };
  }
}

/**
 * Pull current seat counts from a single connection and persist them.
 * Returns a summary of what landed.
 */
export async function runSeatSync(connectionId: string): Promise<{
  ok: boolean;
  message: string;
  inserted: number;
  unmapped: number;
}> {
  const conn = await db.query.vendorConnections.findFirst({
    where: eq(vendorConnections.id, connectionId),
  });
  if (!conn) throw new Error("Connection not found");
  if (!conn.enabled) {
    return {
      ok: false,
      message: "Connection is disabled",
      inserted: 0,
      unmapped: 0,
    };
  }

  await db
    .update(vendorConnections)
    .set({ lastSyncStartedAt: new Date(), updatedAt: new Date() })
    .where(eq(vendorConnections.id, connectionId));

  try {
    const connector = buildConnector(conn);
    const seats = await connector.listSeats();

    // Pull the client mappings for this connection so we can resolve
    // vendor_client_identifier → TechOS client_id without N round-trips.
    const mappings = await db
      .select({
        identifier: vendorClientMappings.vendorClientIdentifier,
        clientId: vendorClientMappings.clientId,
      })
      .from(vendorClientMappings)
      .where(eq(vendorClientMappings.vendorConnectionId, connectionId));
    const clientByIdentifier = new Map(
      mappings.map((m) => [m.identifier, m.clientId] as const),
    );

    let inserted = 0;
    let unmapped = 0;
    if (seats.length > 0) {
      const rows = seats.map((s) => {
        const clientId = clientByIdentifier.get(s.vendorClientIdentifier) ?? null;
        if (!clientId) unmapped++;
        return {
          organizationId: conn.organizationId,
          vendorConnectionId: conn.id,
          vendorClientIdentifier: s.vendorClientIdentifier,
          vendorClientName: s.vendorClientName,
          clientId,
          productSku: s.productSku,
          productName: s.productName,
          seats: s.seats,
          costPerSeatCents: s.costPerSeatCents ?? null,
          periodStart: s.periodStart ?? null,
          periodEnd: s.periodEnd ?? null,
          rawResponse: s.raw ?? null,
        };
      });
      // Chunk to keep parameter counts under PG limits.
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        await db.insert(vendorSeatSnapshots).values(slice);
        inserted += slice.length;
      }
    }

    // After snapshots land, push them into licenses.seats_total so the
    // rest of the app reflects the vendor's reality. Safe to call even
    // when no snapshots changed — internally only updates rows whose
    // seat count drifted.
    const applyResult = await applySnapshotsToLicenses(
      conn.organizationId,
      conn.id,
    );

    const messageParts = [
      `Synced ${seats.length} seat snapshot${seats.length === 1 ? "" : "s"}`,
    ];
    if (unmapped > 0) {
      messageParts.push(
        `${unmapped} unmapped customer${unmapped === 1 ? "" : "s"}`,
      );
    }
    if (applyResult.updates > 0) {
      messageParts.push(
        `${applyResult.updates} license seat${applyResult.updates === 1 ? "" : "s"} updated`,
      );
    }
    if (applyResult.noMatch > 0) {
      messageParts.push(
        `${applyResult.noMatch} snapshot${applyResult.noMatch === 1 ? "" : "s"} had no matching license`,
      );
    }
    const message = messageParts.join(" · ");

    await db
      .update(vendorConnections)
      .set({
        status: "connected",
        lastSyncAt: new Date(),
        lastSyncMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(vendorConnections.id, connectionId));

    return { ok: true, message, inserted, unmapped };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isConfig = err instanceof ConnectorConfigError;
    const isAuth = err instanceof ConnectorAuthError;
    await db
      .update(vendorConnections)
      .set({
        status: isConfig ? "not_configured" : "failed",
        lastSyncMessage: `${isAuth ? "Auth error: " : ""}${message}`,
        updatedAt: new Date(),
      })
      .where(eq(vendorConnections.id, connectionId));
    return { ok: false, message, inserted: 0, unmapped: 0 };
  }
}

/**
 * Sync every enabled, configured connection for an org. Used by the
 * cron route and the "Sync all" button.
 */
export async function runAllSeatSyncs(organizationId: string) {
  const conns = await db
    .select()
    .from(vendorConnections)
    .where(
      and(
        eq(vendorConnections.organizationId, organizationId),
        eq(vendorConnections.enabled, true),
      ),
    );
  const results: Array<{
    kind: string;
    displayName: string;
    ok: boolean;
    message: string;
    inserted: number;
    unmapped: number;
  }> = [];
  for (const c of conns) {
    if (c.status === "not_configured") {
      results.push({
        kind: c.kind,
        displayName: c.displayName,
        ok: false,
        message: "Skipped — no credentials",
        inserted: 0,
        unmapped: 0,
      });
      continue;
    }
    const r = await runSeatSync(c.id);
    results.push({
      kind: c.kind,
      displayName: c.displayName,
      ok: r.ok,
      message: r.message,
      inserted: r.inserted,
      unmapped: r.unmapped,
    });
  }
  return results;
}
