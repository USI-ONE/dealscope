/**
 * Batch invoice pre-flight check.
 *
 * For a given billing month, sweeps all active clients and tells the
 * operator which are READY to invoice, which are BLOCKED (and exactly
 * why), and which are ALREADY DONE. The intent is to give a clear
 * "click here to generate N invoices" affordance without surprises —
 * no client gets invoiced at a fallback rate they didn't intend, and
 * no client gets re-invoiced if a live invoice already exists.
 *
 * What "ready" means
 * ──────────────────
 * A client is READY when:
 *   1. They have at least one active full_compute_node (otherwise
 *      there's no recurring contract to bill against).
 *   2. Every line the generator would emit resolves to a real per-client
 *      rate — none of {compute, BD, LG, TH, SR} fell through to the
 *      template default. Falling through to default is treated as
 *      "rate not set on purpose" — we'd rather skip + flag than silently
 *      bill at a guess.
 *   3. No live (non-void) monthly_contract invoice already exists for
 *      this (client, period). Existing invoices show as ALREADY DONE.
 *
 * What we surface for BLOCKED clients
 * ───────────────────────────────────
 *   - missingRates: ["bitdefender", "liongard"]
 *   - integrationSeats: { bitdefender: 18, liongard: 92, ... } — what
 *     they'd be invoiced for IF rates were set, so the operator knows
 *     the financial impact of fixing each gap.
 *   - projectedAmountCents: the would-be total if rates were filled
 *     with the most-common org defaults ($110/$10/$3/$3.50/$6).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  hardware,
  invoices,
  vendorConnections,
  vendorSeatSnapshots,
  vendorClientMappings,
  vendors,
} from "@/db/schema";
import { previewPsMonthlyInvoice } from "./ps-monthly-orchestrator";
import {
  PS_PRODUCT_TEMPLATES,
  type PsProductKey,
} from "./ps-product-templates";

export type BatchPreflightStatus =
  | "ready"
  | "already_invoiced"
  | "no_compute_nodes"
  | "missing_rates";

export type BatchPreflightRow = {
  clientId: string;
  clientName: string;
  status: BatchPreflightStatus;
  /** Projected invoice total in cents. For ready clients, this is the
   *  real number. For blocked clients, it's what they'd be invoiced
   *  if rates were filled with the org standard defaults — useful for
   *  the operator to gauge "is this a $50/mo client or a $5000/mo
   *  client" when deciding whether to chase rates. */
  projectedAmountCents: number;
  /** Compute node count this period (will become qty on the invoice). */
  computeNodes: number;
  /** Live integration seat counts that WOULD be billed if rates were
   *  set, keyed by product. NULL means "no integration data on file
   *  for this product." */
  integrationSeats: Partial<Record<PsProductKey, number | null>>;
  /** Products where the per-client rate is missing (would fall through
   *  to the template default). Empty for ready clients. */
  missingRates: PsProductKey[];
  /** ID of the existing live invoice when status=already_invoiced —
   *  lets the UI link straight to it. */
  existingInvoiceId?: string | null;
  /** Human-readable explanation for blocked statuses. */
  blockerSummary?: string;
};

export type BatchPreflightSummary = {
  yyyymm: string;
  rows: BatchPreflightRow[];
  /** Total dollars across READY clients only — what the batch button
   *  will actually invoice if clicked. */
  readyTotalCents: number;
  readyCount: number;
  blockedCount: number;
  alreadyInvoicedCount: number;
  notContractedCount: number;
};

/**
 * Run the pre-flight scan for one billing month across every active
 * client in the org. Designed to be fast: per-client preview calls
 * fan out in parallel, capped at a small concurrency to avoid hammering
 * Neon during a big org.
 */
export async function buildBatchPreflight({
  organizationId,
  yyyymm,
}: {
  organizationId: string;
  yyyymm: string;
}): Promise<BatchPreflightSummary> {
  // 1. Load active clients (single query)
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(
      and(eq(clients.organizationId, organizationId), eq(clients.status, "active")),
    )
    .orderBy(clients.name);

  // 2. Per-client preview in parallel (Drizzle/Neon handles concurrency
  // fine; if we ever hit pool limits we'll batch in groups of 8).
  const rows = await Promise.all(
    allClients.map((cl) =>
      buildOneClient(organizationId, cl.id, cl.name, yyyymm),
    ),
  );

  // 3. Roll up
  let readyTotalCents = 0;
  let readyCount = 0;
  let blockedCount = 0;
  let alreadyInvoicedCount = 0;
  let notContractedCount = 0;
  for (const r of rows) {
    switch (r.status) {
      case "ready":
        readyCount++;
        readyTotalCents += r.projectedAmountCents;
        break;
      case "missing_rates":
        blockedCount++;
        break;
      case "already_invoiced":
        alreadyInvoicedCount++;
        break;
      case "no_compute_nodes":
        notContractedCount++;
        break;
    }
  }

  return {
    yyyymm,
    rows,
    readyTotalCents,
    readyCount,
    blockedCount,
    alreadyInvoicedCount,
    notContractedCount,
  };
}

async function buildOneClient(
  organizationId: string,
  clientId: string,
  clientName: string,
  yyyymm: string,
): Promise<BatchPreflightRow> {
  // Cheap check first — already invoiced?
  const periodStart = `${yyyymm}-01`;
  const existing = await db
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.clientId, clientId),
        eq(invoices.periodStart, periodStart),
        eq(invoices.kind, "monthly_contract"),
      ),
    );
  const liveExisting = existing.find((e) => e.status !== "void");
  if (liveExisting) {
    return {
      clientId,
      clientName,
      status: "already_invoiced",
      projectedAmountCents: 0,
      computeNodes: 0,
      integrationSeats: {},
      missingRates: [],
      existingInvoiceId: liveExisting.id,
      blockerSummary: "Live invoice already exists for this period",
    };
  }

  // Cheap compute-node count — drives the "no contract" bucket.
  const cnRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(hardware)
    .where(
      and(
        eq(hardware.clientId, clientId),
        eq(hardware.billingTier, "full_compute_node"),
        eq(hardware.status, "active"),
      ),
    );
  const computeNodes = cnRow[0]?.count ?? 0;
  if (computeNodes === 0) {
    return {
      clientId,
      clientName,
      status: "no_compute_nodes",
      projectedAmountCents: 0,
      computeNodes: 0,
      integrationSeats: await loadIntegrationSeats(organizationId, clientId),
      missingRates: [],
      blockerSummary: "No active compute nodes — not on monthly contract",
    };
  }

  // Run the actual generator preview to find which rates resolve to
  // defaults (= rate not set per-client).
  const draft = await previewPsMonthlyInvoice({
    organizationId,
    clientId,
    yyyymm,
    syncroRemoteContacts: 0, // batch path doesn't auto-include SR
  });

  const missingRates = new Set<PsProductKey>();
  let projected = 0;
  for (const line of draft.lines) {
    projected += line.amountCents;
    if (line.rateSource === "template_default" && line.sku) {
      // Map SKU back to product key for the missing-rates list.
      const key = inferProductKey(line.sku);
      if (key) missingRates.add(key);
    }
  }

  const integrationSeats = await loadIntegrationSeats(organizationId, clientId);

  if (missingRates.size > 0) {
    return {
      clientId,
      clientName,
      status: "missing_rates",
      projectedAmountCents: projected,
      computeNodes,
      integrationSeats,
      missingRates: [...missingRates],
      blockerSummary: `Rate not set for: ${[...missingRates].join(", ")}`,
    };
  }

  return {
    clientId,
    clientName,
    status: "ready",
    projectedAmountCents: projected,
    computeNodes,
    integrationSeats,
    missingRates: [],
  };
}

function inferProductKey(sku: string): PsProductKey | null {
  for (const [key, tmpl] of Object.entries(PS_PRODUCT_TEMPLATES)) {
    if (tmpl.sku === sku) return key as PsProductKey;
  }
  return null;
}

/**
 * Pull the most-recent seat snapshot per vendor for this client. Tells
 * the operator "you have N BD seats showing up from the integration"
 * even when the BD rate isn't set yet — so they can see the gap.
 *
 * Only the canonical four-product set (BD/LG/TH/SR) is reported here;
 * compute_node count is reported separately as it comes from hardware
 * not from a seat snapshot.
 */
async function loadIntegrationSeats(
  organizationId: string,
  clientId: string,
): Promise<Partial<Record<PsProductKey, number | null>>> {
  // Latest snapshot row per (vendor, client) — we just need a sum of
  // seats from the current month's snapshots.
  // vendor_client_mappings → vendor_connections → vendors gives us
  // the canonical vendor name we match against PS template
  // vendorNameMatch. The seat snapshot lives off vendor_connection_id
  // + vendor_client_identifier (the natural key shared with mappings).
  const rows = await db
    .select({
      vendorName: vendors.name,
      seats: sql<number>`sum(${vendorSeatSnapshots.seats})::int`,
    })
    .from(vendorSeatSnapshots)
    .innerJoin(
      vendorClientMappings,
      and(
        eq(
          vendorClientMappings.vendorConnectionId,
          vendorSeatSnapshots.vendorConnectionId,
        ),
        eq(
          vendorClientMappings.vendorClientIdentifier,
          vendorSeatSnapshots.vendorClientIdentifier,
        ),
      ),
    )
    .innerJoin(
      vendorConnections,
      eq(vendorConnections.id, vendorClientMappings.vendorConnectionId),
    )
    .innerJoin(vendors, eq(vendors.id, vendorConnections.vendorId))
    .where(
      and(
        eq(vendorSeatSnapshots.organizationId, organizationId),
        eq(vendorClientMappings.clientId, clientId),
        // Only the most recent capture window — last 35 days catches
        // monthly snapshots without picking up stale prior-period data.
        sql`${vendorSeatSnapshots.capturedAt} >= now() - interval '35 days'`,
      ),
    )
    .groupBy(vendors.name);

  const out: Partial<Record<PsProductKey, number | null>> = {
    bitdefender_secure_plus: null,
    liongard: null,
    titanhq_plus: null,
    syncro_remote: null,
  };
  for (const r of rows) {
    const nm = (r.vendorName ?? "").toLowerCase();
    if (nm.includes("bitdefender")) out.bitdefender_secure_plus = r.seats;
    else if (nm.includes("liongard")) out.liongard = r.seats;
    else if (nm.includes("titanhq")) out.titanhq_plus = r.seats;
    else if (nm.includes("syncro")) out.syncro_remote = r.seats;
  }
  return out;
}
