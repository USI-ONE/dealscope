/**
 * TitanHQ Platform CSV ingest.
 *
 * TitanHQ Platform MSP portal doesn't expose API access self-serve —
 * we've requested it but it's gated behind a support workflow. Until
 * that lands, the operator pulls the "License Usage by Customer"
 * report as a CSV from platform.titanhq.com/msp → License Usage and
 * drops it into TechOS. We parse it into vendor_seat_snapshots so it
 * flows into the PS invoice composer like every other vendor.
 *
 * Expected CSV columns (verified against the email-security report
 * dated 02-06-2026):
 *
 *   "Name","Licenses Issued","Active Users","Total Usage","Created At"
 *
 * The "Name" column has free-form text — sometimes prefixed ("AHP -
 * Animal Health Partners"), sometimes typo'd ("Collison Leaders").
 * Fuzzy matcher handles both via a small alias table + substring
 * fallback. Same pattern as the Liongard env → TechOS client match.
 *
 * Per row we emit two snapshots:
 *   titanhq_email_security_issued — Licenses Issued (what we PAID Titan
 *                                   for this customer this month)
 *   titanhq_email_security_active — Active Users (actual mailbox count
 *                                   in use, drives the rebill quantity)
 *
 * Phishing Simulation / Security Awareness Training CSVs will follow
 * the same shape — when the operator drops those reports we add
 * matching SKUs (titanhq_phishing_simulation_*, titanhq_sat_*) without
 * touching this code.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  vendorClientMappings,
  vendorConnections,
  vendorSeatSnapshots,
} from "@/db/schema";
import { and } from "drizzle-orm";

/* ============================================================================
 * Public types
 * ========================================================================== */

export type TitanHqCsvProduct =
  | "email_security"
  | "phishing_simulation"
  | "security_awareness_training";

export type ParsedRow = {
  customerName: string;
  licensesIssued: number;
  activeUsers: number;
};

export type IngestResult = {
  rowsParsed: number;
  customersMapped: number;
  customersUnmapped: number;
  snapshotsWritten: number;
  unmappedNames: string[];
};

/* ============================================================================
 * Parser — strict CSV reader for the TitanHQ report shape.
 * ========================================================================== */

/**
 * Parse a TitanHQ Platform license-usage CSV. Tolerates:
 *   • Quoted strings ("AHP - Animal Health Partners")
 *   • Decimal floats in Total Usage column (we ignore that column)
 *   • Trailing whitespace
 *   • Either CRLF or LF line endings
 *
 * Throws if the header doesn't include Name + a count column.
 */
export function parseTitanHqCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((c) => c.toLowerCase().trim());
  const nameIdx = header.findIndex((c) => /^name$/i.test(c));
  const issuedIdx = header.findIndex((c) =>
    /licen[sc]es?\s*issued/i.test(c),
  );
  const activeIdx = header.findIndex((c) => /active\s*users/i.test(c));
  if (nameIdx < 0) {
    throw new Error(
      `TitanHQ CSV header missing 'Name' column — got: ${header.join(", ")}`,
    );
  }
  if (issuedIdx < 0 && activeIdx < 0) {
    throw new Error(
      `TitanHQ CSV header missing 'Licenses Issued' and 'Active Users' columns — got: ${header.join(", ")}`,
    );
  }

  const out: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const name = cells[nameIdx]?.trim();
    if (!name) continue;
    const issued = issuedIdx >= 0 ? parseInt(cells[issuedIdx], 10) : 0;
    const active = activeIdx >= 0 ? parseInt(cells[activeIdx], 10) : 0;
    if (Number.isNaN(issued) && Number.isNaN(active)) continue;
    out.push({
      customerName: name,
      licensesIssued: Number.isFinite(issued) ? issued : 0,
      activeUsers: Number.isFinite(active) ? active : 0,
    });
  }
  return out;
}

/** Minimal CSV line splitter — handles quoted fields with embedded commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          buf += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        buf += ch;
      }
    } else if (ch === ",") {
      out.push(buf);
      buf = "";
    } else if (ch === '"' && buf.length === 0) {
      inQuote = true;
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out;
}

/* ============================================================================
 * Fuzzy name → TechOS client matcher.
 *
 * TitanHQ tenant names drift from TechOS client names — prefixes
 * ("AHP - Animal Health Partners"), typos ("Collison" vs "Collision"),
 * abbreviations ("USI" vs "Universal Systems Inc."). We handle these
 * with a small alias table + substring fallback.
 * ========================================================================== */
const ALIASES: Record<string, string> = {
  ahpanimalhealthpartners: "ahp",
  collisonleaders: "collisionleaders", // common TitanHQ typo
  usi: "universalsystemsinc",
  fillerupemployment: "fillerup",
  rockymountainvehicle: "rockymountainemergencyvehicle",
};

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export function matchCustomerName(
  vendorName: string,
  techosClients: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  const n = norm(vendorName);
  const alias = ALIASES[n] ?? n;
  // Exact normalized match first
  for (const cl of techosClients) {
    const cn = norm(cl.name);
    if (cn === n || cn === alias) return cl;
  }
  // Substring either direction (catches both "AHP - Animal..." and
  // "Universal" vs "Universal Systems Inc.")
  for (const cl of techosClients) {
    const cn = norm(cl.name);
    if (cn.includes(alias) || alias.includes(cn)) return cl;
  }
  return null;
}

/* ============================================================================
 * Ingestor — full apply: connection → mappings → snapshots.
 * ========================================================================== */

export async function ingestTitanHqCsv(input: {
  organizationId: string;
  csvText: string;
  product: TitanHqCsvProduct;
}): Promise<IngestResult> {
  const rows = parseTitanHqCsv(input.csvText);

  // Find/create the TitanHQ connection row.
  let conn = await db.query.vendorConnections.findFirst({
    where: and(
      eq(vendorConnections.organizationId, input.organizationId),
      eq(vendorConnections.kind, "titanhq"),
    ),
  });
  if (!conn) {
    const [created] = await db
      .insert(vendorConnections)
      .values({
        organizationId: input.organizationId,
        kind: "titanhq",
        displayName: "TitanHQ Platform (CSV ingest)",
        status: "configured",
        configJson: { mode: "csv_ingest" },
      })
      .returning();
    conn = created;
  }
  const connectionId = conn.id;

  // Pull TechOS clients for the fuzzy match.
  const techosClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.organizationId, input.organizationId));

  // SKU prefix differs per product.
  const skuPrefix = `titanhq_${input.product}`;
  const productLabel =
    input.product === "email_security"
      ? "Email Security"
      : input.product === "phishing_simulation"
        ? "Phishing Simulation"
        : "Security Awareness Training";

  // Wipe prior snapshots for this connection + product so we have a
  // clean monthly baseline (matches how the API connectors behave).
  // We leave OTHER products' snapshots alone — only the SKUs we're
  // about to rewrite.
  // Drizzle doesn't have a like-prefix delete helper out of the box,
  // so use a raw SQL where clause.
  const { sql } = await import("drizzle-orm");
  await db
    .delete(vendorSeatSnapshots)
    .where(
      and(
        eq(vendorSeatSnapshots.vendorConnectionId, connectionId),
        sql`product_sku LIKE ${skuPrefix + "%"}`,
      ),
    );

  let mapped = 0;
  let unmapped = 0;
  const unmappedNames: string[] = [];
  const snapshotInserts: typeof vendorSeatSnapshots.$inferInsert[] = [];

  for (const row of rows) {
    const match = matchCustomerName(row.customerName, techosClients);
    const clientId = match?.id ?? null;
    if (match) {
      mapped++;
      // Upsert the mapping for future ingests (idempotent).
      await db
        .insert(vendorClientMappings)
        .values({
          organizationId: input.organizationId,
          vendorConnectionId: connectionId,
          vendorClientIdentifier: row.customerName,
          vendorClientName: row.customerName,
          clientId: match.id,
        })
        .onConflictDoUpdate({
          target: [
            vendorClientMappings.vendorConnectionId,
            vendorClientMappings.vendorClientIdentifier,
          ],
          set: {
            vendorClientName: row.customerName,
            clientId: match.id,
            updatedAt: new Date(),
          },
        });
    } else {
      unmapped++;
      unmappedNames.push(row.customerName);
    }

    // Two SKUs per row.
    snapshotInserts.push(
      {
        organizationId: input.organizationId,
        vendorConnectionId: connectionId,
        vendorClientIdentifier: row.customerName,
        vendorClientName: row.customerName,
        clientId,
        productSku: `${skuPrefix}_issued`,
        productName: `TitanHQ ${productLabel} — Licenses Issued`,
        seats: row.licensesIssued,
      },
      {
        organizationId: input.organizationId,
        vendorConnectionId: connectionId,
        vendorClientIdentifier: row.customerName,
        vendorClientName: row.customerName,
        clientId,
        productSku: `${skuPrefix}_active`,
        productName: `TitanHQ ${productLabel} — Active Users`,
        seats: row.activeUsers,
      },
    );
  }

  if (snapshotInserts.length > 0) {
    await db.insert(vendorSeatSnapshots).values(snapshotInserts);
  }

  // Update the connection's last-sync state. We use status='configured'
  // (not 'connected') because there's no live API — data only refreshes
  // when the operator drops a new CSV. 'connected' is reserved for
  // integrations the daily cron actually polls.
  await db
    .update(vendorConnections)
    .set({
      status: "configured",
      lastSyncAt: new Date(),
      lastSyncMessage: `CSV ingest (${productLabel}): ${rows.length} rows, ${mapped} mapped, ${unmapped} unmapped`,
      updatedAt: new Date(),
    })
    .where(eq(vendorConnections.id, connectionId));

  return {
    rowsParsed: rows.length,
    customersMapped: mapped,
    customersUnmapped: unmapped,
    snapshotsWritten: snapshotInserts.length,
    unmappedNames,
  };
}
