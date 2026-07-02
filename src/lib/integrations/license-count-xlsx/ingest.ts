/**
 * License Count xlsx ingest.
 *
 * USI maintains a monthly hand-curated workbook at:
 *   SharePoint/sites/IXE/Shared Documents/General/Reports/License Count/
 *     License Count report - <Month>.xlsx
 *
 * This is the ground truth for per-client license counts across every
 * SaaS USI bills clients for — covers vendors whose APIs either don't
 * exist, are gated (TitanHQ, Ingram), are single-tenant (Bitdefender),
 * or just need a sanity check (Liongard).
 *
 * Columns observed (Sep 2025 sample, columns may evolve — we match by
 * normalized header text, not column position):
 *
 *   Client                              — required, used to fuzzy-match
 *   Compute                             — total compute nodes (cross-check
 *                                         vs Syncro hardware)
 *   checked in since X/X                — recently-active compute nodes
 *   Syncro                              — Syncro Managed Endpoint count
 *   Syncro Remote users                 — Syncro Remote per-contact billable
 *   Bitdefender Endpoint Security Tools — *** the big one — per-client BD ***
 *   Liongard Agent                      — per-client Liongard agent count
 *   TitanHQ                             — TitanHQ Plus mailbox count
 *   Asana / 1 Password / VEEAM /        — tracked but not currently rebilled
 *     Backup (Acronis...)
 *
 * Each column we recognize routes to a specific vendor_connection's
 * snapshots under its own SKU. Unrecognized columns are skipped (but
 * logged in the result so the operator can extend the map).
 *
 * Behavior:
 *   - Find/create connections for each recognized vendor
 *   - For each (client × column) pair, write ONE snapshot row
 *   - Use the standard vendor_client_mappings to attribute to TechOS clients
 *   - Idempotent per upload: clears prior xlsx-sourced snapshots before
 *     writing new ones (so re-uploading the same month doesn't double up)
 */
import { and, eq, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db } from "@/db";
import {
  clients,
  vendorClientMappings,
  vendorConnections,
  vendorSeatSnapshots,
  type VendorConnectionKind,
} from "@/db/schema";
import { sql } from "drizzle-orm";

/* ============================================================================
 * Column → vendor mapping table.
 *
 * Each entry says: "if the xlsx has a column whose normalized header
 * MATCHES this pattern, route the integer value in each row to a
 * snapshot under this connection + SKU."
 *
 * Patterns are matched against the normalized header (lowercase, spaces
 * + punctuation stripped) via includes(). Add a row to extend support
 * for new columns without touching the parser.
 * ========================================================================== */
type ColumnMapping = {
  /** Normalized substring(s) — match if any contained in column header. */
  match: string[];
  kind: VendorConnectionKind;
  productSku: string;
  productName: string;
  /** Default display name when no connection exists yet for this kind. */
  defaultDisplayName: string;
};

const COLUMN_MAPPINGS: ColumnMapping[] = [
  {
    match: ["bitdefender"],
    kind: "bitdefender_gravityzone",
    productSku: "bd_per_client_endpoint",
    productName: "Bitdefender Endpoint (per-client, from xlsx)",
    defaultDisplayName: "Bitdefender GravityZone",
  },
  {
    match: ["liongardagent", "liongard"],
    kind: "liongard",
    productSku: "liongard_xlsx_agent",
    productName: "Liongard Agent (xlsx)",
    defaultDisplayName: "Liongard",
  },
  {
    match: ["titanhq"],
    kind: "titanhq",
    productSku: "titanhq_xlsx_mailbox",
    productName: "TitanHQ Mailbox (xlsx)",
    defaultDisplayName: "TitanHQ Platform",
  },
  {
    match: ["syncroremoteusers", "syncroremote"],
    kind: "syncro",
    productSku: "syncro_remote_xlsx",
    productName: "Syncro Remote Contact (xlsx)",
    defaultDisplayName: "Syncro MSP",
  },
  {
    match: ["acronis", "backupacronis"],
    kind: "acronis_cyber_cloud",
    productSku: "acronis_xlsx_workload",
    productName: "Acronis Backup Workload (xlsx)",
    defaultDisplayName: "Acronis Cyber Cloud",
  },
];

/* ============================================================================
 * Parser
 * ========================================================================== */

/** Normalize a header for matching: lowercase, alphanumerics only. */
function normHeader(s: string): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Normalize a client name for fuzzy-matching. */
function normName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const CLIENT_ALIASES: Record<string, string> = {
  ahpanimalhealthpartners: "ahp",
  collisonleaders: "collisionleaders",
  usi: "universalsystemsinc",
  fillerupemployment: "fillerup",
  rockymountainvehicle: "rockymountainemergencyvehicle",
  medimorph: "medify",
};

function matchClient(
  vendorName: string,
  techosClients: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  const n = normName(vendorName);
  const alias = CLIENT_ALIASES[n] ?? n;
  for (const cl of techosClients) {
    const cn = normName(cl.name);
    if (cn === n || cn === alias) return cl;
  }
  for (const cl of techosClients) {
    const cn = normName(cl.name);
    if (cn.includes(alias) || alias.includes(cn)) return cl;
  }
  return null;
}

/* ============================================================================
 * Result types
 * ========================================================================== */

export type ParsedRow = {
  clientName: string;
  values: Record<string, number>; // header (verbatim) → value
};

export type IngestResultPerVendor = {
  kind: VendorConnectionKind;
  productSku: string;
  matchedColumn: string; // verbatim column header that triggered
  rowsWritten: number;
  totalSeats: number;
};

export type IngestResult = {
  rowsParsed: number;
  clientsMapped: number;
  clientsUnmapped: number;
  unmappedClientNames: string[];
  byVendor: IngestResultPerVendor[];
  unrecognizedColumns: string[];
};

/* ============================================================================
 * Parse — read the xlsx buffer into ParsedRow[].
 * ========================================================================== */
export async function parseLicenseCountXlsx(
  buffer: Buffer | ArrayBuffer,
): Promise<{ rows: ParsedRow[]; columnHeaders: string[] }> {
  const workbook = new ExcelJS.Workbook();
  // exceljs.xlsx.load() expects an ArrayBuffer — convert from Node
  // Buffer if needed (the API caller hands us Buffer; the parser
  // would otherwise accept ArrayBuffer directly).
  const ab =
    buffer instanceof Buffer
      ? buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        )
      : (buffer as ArrayBuffer);
  await workbook.xlsx.load(ab as ArrayBuffer);
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error("xlsx has no worksheets");

  // Find the header row + Client column.
  let headerRowIdx = -1;
  let clientColIdx = -1;
  let headers: string[] = [];
  for (let r = 1; r <= Math.min(ws.actualRowCount ?? ws.rowCount, 20); r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    let foundClient = -1;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const v =
        cell.value === null || cell.value === undefined
          ? ""
          : String(cell.value).trim();
      cells[colNumber - 1] = v;
      if (foundClient < 0 && /^client$/i.test(v)) foundClient = colNumber;
    });
    if (foundClient > 0) {
      headerRowIdx = r;
      clientColIdx = foundClient;
      headers = cells;
      break;
    }
  }
  if (headerRowIdx < 0) {
    throw new Error(
      "Could not find a header row containing a 'Client' column in the first 20 rows.",
    );
  }

  const rows: ParsedRow[] = [];
  const lastRow = ws.actualRowCount ?? ws.rowCount;
  for (let r = headerRowIdx + 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const clientCell = row.getCell(clientColIdx).value;
    const clientName =
      clientCell === null || clientCell === undefined
        ? ""
        : String(clientCell).trim();
    if (!clientName) continue;
    // Skip totals / blank dividers / footer rows
    if (/^total/i.test(clientName)) continue;

    const values: Record<string, number> = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (colNumber === clientColIdx) return;
      const header = headers[colNumber - 1];
      if (!header) return;
      const raw = cell.value;
      let num: number | null = null;
      if (typeof raw === "number") num = raw;
      else if (typeof raw === "string") {
        const cleaned = raw.replace(/[, ]/g, "");
        if (/^\d+(\.\d+)?$/.test(cleaned)) num = parseFloat(cleaned);
      } else if (raw && typeof raw === "object" && "result" in raw) {
        // Formula cell — use the cached result.
        const r = (raw as { result?: unknown }).result;
        if (typeof r === "number") num = r;
      }
      if (num !== null && Number.isFinite(num)) {
        values[header] = Math.round(num);
      }
    });

    rows.push({ clientName, values });
  }

  return { rows, columnHeaders: headers };
}

/* ============================================================================
 * Ingest — parse buffer + route to vendor_seat_snapshots.
 * ========================================================================== */
export async function ingestLicenseCountXlsx(input: {
  organizationId: string;
  buffer: Buffer | ArrayBuffer;
  /** Optional label written into config_json + last_sync_message for
   *  audit ("Nov 2025", "01-12-2026", etc.). */
  periodLabel?: string;
}): Promise<IngestResult> {
  const { rows, columnHeaders } = await parseLicenseCountXlsx(input.buffer);

  // Decide which columns we recognize → map to vendor.
  type ColumnRoute = ColumnMapping & { matchedColumn: string };
  const routes: ColumnRoute[] = [];
  const unrecognized: string[] = [];
  for (const header of columnHeaders) {
    if (!header) continue;
    if (/^client$/i.test(header)) continue;
    const nh = normHeader(header);
    const route = COLUMN_MAPPINGS.find((m) => m.match.some((p) => nh.includes(p)));
    if (route) {
      routes.push({ ...route, matchedColumn: header });
    } else {
      unrecognized.push(header);
    }
  }

  // Ensure a vendor_connections row exists for each recognized kind.
  const connByKind = new Map<VendorConnectionKind, string>();
  for (const r of routes) {
    if (connByKind.has(r.kind)) continue;
    let conn = await db.query.vendorConnections.findFirst({
      where: and(
        eq(vendorConnections.organizationId, input.organizationId),
        eq(vendorConnections.kind, r.kind),
      ),
    });
    if (!conn) {
      const [created] = await db
        .insert(vendorConnections)
        .values({
          organizationId: input.organizationId,
          kind: r.kind,
          displayName: r.defaultDisplayName,
          status: "configured",
          configJson: { mode: "csv_ingest" },
        })
        .returning();
      conn = created;
    }
    connByKind.set(r.kind, conn.id);
  }

  // Wipe prior xlsx-sourced snapshots so re-runs replace cleanly.
  for (const r of routes) {
    const connId = connByKind.get(r.kind)!;
    await db
      .delete(vendorSeatSnapshots)
      .where(
        and(
          eq(vendorSeatSnapshots.vendorConnectionId, connId),
          eq(vendorSeatSnapshots.productSku, r.productSku),
        ),
      );
  }

  // Match clients.
  const techosClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.organizationId, input.organizationId));

  let mappedCount = 0;
  let unmappedCount = 0;
  const unmappedNames: string[] = [];

  // Per-vendor tallies for the final report.
  const perVendor = new Map<string, IngestResultPerVendor>();
  for (const r of routes) {
    perVendor.set(`${r.kind}::${r.productSku}`, {
      kind: r.kind,
      productSku: r.productSku,
      matchedColumn: r.matchedColumn,
      rowsWritten: 0,
      totalSeats: 0,
    });
  }

  // Walk rows, write snapshots + upsert mappings.
  const inserts: typeof vendorSeatSnapshots.$inferInsert[] = [];
  for (const row of rows) {
    const match = matchClient(row.clientName, techosClients);
    const clientId = match?.id ?? null;
    if (match) {
      mappedCount++;
    } else {
      unmappedCount++;
      unmappedNames.push(row.clientName);
    }

    for (const r of routes) {
      const seats = row.values[r.matchedColumn];
      if (typeof seats !== "number" || seats <= 0) continue;
      const connId = connByKind.get(r.kind)!;
      inserts.push({
        organizationId: input.organizationId,
        vendorConnectionId: connId,
        vendorClientIdentifier: row.clientName,
        vendorClientName: row.clientName,
        clientId,
        productSku: r.productSku,
        productName: r.productName,
        seats,
      });
      const tally = perVendor.get(`${r.kind}::${r.productSku}`)!;
      tally.rowsWritten++;
      tally.totalSeats += seats;

      // Upsert the mapping when matched.
      if (match) {
        await db
          .insert(vendorClientMappings)
          .values({
            organizationId: input.organizationId,
            vendorConnectionId: connId,
            vendorClientIdentifier: row.clientName,
            vendorClientName: row.clientName,
            clientId: match.id,
          })
          .onConflictDoUpdate({
            target: [
              vendorClientMappings.vendorConnectionId,
              vendorClientMappings.vendorClientIdentifier,
            ],
            set: {
              vendorClientName: row.clientName,
              clientId: match.id,
              updatedAt: new Date(),
            },
          });
      }
    }
  }

  if (inserts.length > 0) {
    // Insert in chunks to keep PG param counts sane.
    const CHUNK = 200;
    for (let i = 0; i < inserts.length; i += CHUNK) {
      await db.insert(vendorSeatSnapshots).values(inserts.slice(i, i + CHUNK));
    }
  }

  // Bump each affected connection's last_sync metadata.
  const label = input.periodLabel ?? new Date().toISOString().slice(0, 10);
  for (const r of routes) {
    const connId = connByKind.get(r.kind)!;
    const tally = perVendor.get(`${r.kind}::${r.productSku}`)!;
    await db
      .update(vendorConnections)
      .set({
        status: "configured",
        lastSyncAt: new Date(),
        lastSyncMessage: `License Count xlsx (${label}): ${tally.rowsWritten} clients, ${tally.totalSeats} seats — column "${r.matchedColumn}"`,
        updatedAt: new Date(),
      })
      .where(eq(vendorConnections.id, connId));
  }

  return {
    rowsParsed: rows.length,
    clientsMapped: mappedCount,
    clientsUnmapped: unmappedCount,
    unmappedClientNames: unmappedNames,
    byVendor: Array.from(perVendor.values()),
    unrecognizedColumns: unrecognized,
  };
}
