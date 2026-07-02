/**
 * PS monthly invoice orchestrator.
 *
 * Loads everything needed to feed `buildPsMonthlyInvoice`, then
 * persists the result into `invoices` + `invoice_lines`. Two callable
 * shapes:
 *
 *   previewPsMonthlyInvoice  — read-only, returns the draft for the
 *                              new-invoice UI to show before commit.
 *   generatePsMonthlyInvoice — writes the invoice to the DB and
 *                              returns the created row.
 *
 * Idempotent: a live monthly_contract invoice already existing for
 * (client, period) blocks generation unless `replace=true`, in which
 * case the existing one is voided first.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clientLocations,
  clients,
  hardware,
  invoiceLines,
  invoices,
  licenses,
  vendors,
} from "@/db/schema";
import {
  buildPsMonthlyInvoice,
  type PsMonthlyInvoiceDraft,
  type PsMonthlyGeneratorInputs,
} from "./ps-monthly";
import { type PsProductKey } from "./ps-product-templates";

/**
 * Sentinel locationId used by the generator for hardware that isn't
 * attributed to a real location (or for clients that have no
 * locations defined). Stable so the operator's per-location override
 * map can target it the same as any real location. Normalized to
 * NULL when persisting invoice_lines.
 */
export const UNASSIGNED_LOCATION_ID = "unassigned";

function slugifyUpper(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "")
    .slice(0, 60);
}

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function lastDayOfMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yyyymm}-${String(last).padStart(2, "0")}`;
}

function plusDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type PsOrchestratorOptions = {
  organizationId: string;
  clientId: string;
  /** "2026-04" — the billing month. */
  yyyymm: string;
  /** Operator-driven per-(location × product) override map. Optional;
   *  defaults to compute-node count for non-compute products when
   *  missing. */
  perLocationOverrides?: Record<
    string,
    Partial<Record<PsProductKey, number>>
  >;
  /** Global Syncro Remote contact count. 0 = skip the line. */
  syncroRemoteContacts?: number;
  /** Membership id of the operator triggering this generation. */
  generatedByMembershipId?: string | null;
  /** When true, voids any existing live invoice for this (client,
   *  period) before creating the new one. */
  replace?: boolean;
};

/* ============================================================================
 * Loader — gathers everything the generator needs from the DB.
 * ========================================================================== */
async function loadInputs(
  opts: PsOrchestratorOptions,
): Promise<PsMonthlyGeneratorInputs> {
  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, opts.clientId),
      eq(clients.organizationId, opts.organizationId),
    ),
  });
  if (!client) throw new Error("Client not found");

  // Per-location active full_compute_node count.
  const allHardware = await db
    .select({
      id: hardware.id,
      locationId: hardware.locationId,
      billingTier: hardware.billingTier,
      status: hardware.status,
    })
    .from(hardware)
    .where(
      and(
        eq(hardware.organizationId, opts.organizationId),
        eq(hardware.clientId, opts.clientId),
      ),
    );

  const locs = await db
    .select({ id: clientLocations.id, label: clientLocations.label })
    .from(clientLocations)
    .where(eq(clientLocations.clientId, opts.clientId))
    .orderBy(asc(clientLocations.label));

  // Bucket compute-node counts. Hardware with location_id matching a
  // defined location goes in that bucket; everything else (and ALL
  // hardware for clients with zero defined locations) goes into a
  // virtual "Unassigned" bucket so the invoice still emits lines.
  // This matches the operator's mental model: "if I haven't taken
  // the time to attribute compute nodes to specific sites yet, just
  // bill them as one group — I can re-split later".
  const validLocIds = new Set(locs.map((l) => l.id));
  const computeByLoc = new Map<string, number>();
  let unassignedComputeCount = 0;
  for (const h of allHardware) {
    if (h.status !== "active") continue;
    if (h.billingTier !== "full_compute_node") continue;
    if (h.locationId && validLocIds.has(h.locationId)) {
      computeByLoc.set(
        h.locationId,
        (computeByLoc.get(h.locationId) ?? 0) + 1,
      );
    } else {
      unassignedComputeCount++;
    }
  }

  const locationCounts: PsMonthlyGeneratorInputs["locationCounts"] = locs.map(
    (l) => ({
      locationId: l.id,
      locationLabel: l.label,
      computeNodes: computeByLoc.get(l.id) ?? 0,
    }),
  );
  // Virtual "Unassigned" bucket. We use a stable sentinel locationId
  // so the per-location override map (operator UI) can target it the
  // same as any real location. Persisted invoice_line.location_id
  // stays NULL for this bucket — see ps-monthly.ts where any non-UUID
  // locationId is normalized to NULL on output.
  if (unassignedComputeCount > 0) {
    locationCounts.push({
      locationId: UNASSIGNED_LOCATION_ID,
      locationLabel:
        locs.length === 0 ? "Main" : "Unassigned (assign in /clients/[id])",
      computeNodes: unassignedComputeCount,
    });
  }

  // Active license rows joined to vendor name for pricing lookup.
  const licenseRows = await db
    .select({
      id: licenses.id,
      productName: licenses.productName,
      rebillRateCents: licenses.rebillRateCents,
      vendorName: vendors.name,
    })
    .from(licenses)
    .leftJoin(vendors, eq(licenses.vendorId, vendors.id))
    .where(
      and(
        eq(licenses.organizationId, opts.organizationId),
        eq(licenses.clientId, opts.clientId),
        eq(licenses.status, "active"),
      ),
    );

  const [y, m] = opts.yyyymm.split("-").map(Number);
  const periodStart = `${opts.yyyymm}-01`;
  const periodEnd = lastDayOfMonth(opts.yyyymm);
  const issueDate = plusDays(periodEnd, 1);
  const dueDate = plusDays(issueDate, 30);
  const invoiceNumber = `USI-${y}${String(m).padStart(2, "0")}-${slugifyUpper(client.slug || client.name)}`;

  return {
    organizationId: opts.organizationId,
    clientId: opts.clientId,
    clientSlug: client.slug,
    clientName: client.name,
    servicePeriodLabel: monthLabel(opts.yyyymm),
    periodStart,
    periodEnd,
    issueDate,
    dueDate,
    locationCounts,
    perLocationOverrides: opts.perLocationOverrides,
    syncroRemoteContacts: opts.syncroRemoteContacts ?? 0,
    clientPricing: {
      licenses: licenseRows,
      clientSupportRateFullComputeCents: client.supportRateFullComputeCents,
      clientRebillRates: {
        bitdefender_secure_plus: client.rebillRateBitdefenderCents,
        liongard: client.rebillRateLiongardCents,
        titanhq_plus: client.rebillRateTitanhqCents,
        syncro_remote: client.rebillRateSyncroRemoteCents,
      },
    },
    invoiceNumber,
  };
}

/* ============================================================================
 * Preview — build the draft, do NOT touch the DB.
 * ========================================================================== */
export async function previewPsMonthlyInvoice(
  opts: PsOrchestratorOptions,
): Promise<PsMonthlyInvoiceDraft & { inputs: PsMonthlyGeneratorInputs }> {
  const inputs = await loadInputs(opts);
  const draft = buildPsMonthlyInvoice(inputs);
  return { ...draft, inputs };
}

/* ============================================================================
 * Generate — persist a new invoice row + lines.
 * ========================================================================== */
export async function generatePsMonthlyInvoice(opts: PsOrchestratorOptions): Promise<
  | { created: true; invoiceId: string; invoiceNumber: string; totalCents: number }
  | { created: false; reason: "no_lines" | "already_exists" }
> {
  const inputs = await loadInputs(opts);
  const draft = buildPsMonthlyInvoice(inputs);
  if (draft.lines.length === 0) {
    return { created: false, reason: "no_lines" };
  }

  // Check for an existing live invoice for (client, period).
  const existing = await db
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, opts.organizationId),
        eq(invoices.clientId, opts.clientId),
        eq(invoices.periodStart, draft.periodStart),
        eq(invoices.kind, "monthly_contract"),
      ),
    )
    .orderBy(desc(invoices.createdAt));
  const live = existing.find((e) => e.status !== "void");
  if (live && !opts.replace) {
    return { created: false, reason: "already_exists" };
  }
  if (live && opts.replace) {
    await db
      .update(invoices)
      .set({
        status: "void",
        voidedAt: new Date(),
        voidReason: "Regenerated via PS preview UI",
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, live.id));
  }

  const [created] = await db
    .insert(invoices)
    .values({
      organizationId: opts.organizationId,
      clientId: opts.clientId,
      invoiceNumber: draft.invoiceNumber,
      kind: "monthly_contract",
      status: "draft",
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      issueDate: draft.issueDate,
      dueDate: draft.dueDate,
      subtotalCents: draft.subtotalCents,
      taxCents: draft.taxCents,
      totalCents: draft.totalCents,
      quantityBasis: draft.quantityBasis,
      flooredUp: false,
      generatedByMembershipId: opts.generatedByMembershipId ?? null,
      poNumber: draft.poNumber,
      servicePeriodLabel: draft.servicePeriodLabel,
      rep: draft.rep,
      via: draft.via,
      termsLabel: draft.termsLabel,
    })
    .returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });

  await db.insert(invoiceLines).values(
    draft.lines.map((l) => ({
      invoiceId: created.id,
      position: l.position,
      category: l.category,
      description: l.description,
      longDescription: l.longDescription,
      sku: l.sku,
      // Normalize the generator sentinel back to NULL — the DB FK
      // on invoice_lines.location_id won't accept a non-UUID value.
      locationId:
        l.locationId === UNASSIGNED_LOCATION_ID ? null : l.locationId,
      quantity: l.quantity,
      unitRateCents: l.unitRateCents,
      amountCents: l.amountCents,
      isSectionHeader: l.isSectionHeader,
      sectionLabel: l.sectionLabel,
      sourceKind:
        l.rateSource === "license_row" ? "license" : l.rateSource ?? null,
      sourceId: l.rateSourceLicenseId ?? null,
    })),
  );

  return {
    created: true,
    invoiceId: created.id,
    invoiceNumber: created.invoiceNumber,
    totalCents: draft.totalCents,
  };
}
