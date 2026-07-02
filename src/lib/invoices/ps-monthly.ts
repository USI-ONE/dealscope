/**
 * PS-style monthly invoice generator.
 *
 * Produces invoices that match the legacy QB template USI uses today
 * (see scripts/sample-ahp-invoice.pdf as the canonical reference):
 *
 *   - Header: Date, Invoice #, P.O. (= "April 2026"), Rep (= "PS"),
 *     VIA (= "Best Way"), Terms (= "NET 30")
 *   - Body grouped by client location. Each location section has
 *     one line per product (Compute Node, Bitdefender, Liongard,
 *     TitanHQ) priced at the client-specific rate, then a per-
 *     location subtotal.
 *   - Global tail lines: Syncro Remote Access — billed per contact,
 *     not per location.
 *
 * Quantity sourcing
 * ─────────────────
 *   - Compute Node count per location = active hardware where
 *     billing_tier='full_compute_node' and location_id matches.
 *     Comes directly from the Syncro sync → hardware table.
 *   - Bitdefender / Liongard / TitanHQ per-location user counts are
 *     PASSED IN by the caller (the preview UI lets the operator
 *     override before generating). Default behavior when no per-
 *     location count is supplied: use the compute-node count for
 *     Bitdefender, and the same number for Liongard / TitanHQ as a
 *     starting point. Operator should review.
 *   - Syncro Remote contact count is GLOBAL (single line at bottom).
 *
 * The generator is pure (no Drizzle calls) — it just builds the
 * invoice + line objects. The caller persists them.
 */
import {
  PS_PRODUCT_TEMPLATES,
  resolveProductRate,
  type ClientPricingInputs,
  type PsProductKey,
} from "./ps-product-templates";

/* ============================================================================
 * Inputs
 * ========================================================================== */

export type PsMonthlyGeneratorInputs = {
  organizationId: string;
  clientId: string;
  clientSlug: string;
  clientName: string;
  /** "April 2026" → used as P.O. Number on the printed invoice and
   *  as the service-period header. */
  servicePeriodLabel: string;
  /** First and last day of the billing month — written to invoices.period_*. */
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  /** Date the invoice is issued (printed Date field). Defaults to today
   *  when the caller doesn't override. */
  issueDate: string;   // YYYY-MM-DD
  /** Due date (printed nowhere by itself; drives QB import). */
  dueDate: string;
  /** Per-location compute-node counts straight from hardware. */
  locationCounts: Array<{
    locationId: string;
    locationLabel: string;
    computeNodes: number;
  }>;
  /** Optional per-location overrides for non-compute products. When
   *  missing for a given (location, product), the generator falls
   *  back to the compute-node count. Operator-driven via the preview
   *  UI. */
  perLocationOverrides?: Record<
    string,
    Partial<Record<PsProductKey, number>>
  >;
  /** Global Syncro Remote contact count. 0 = skip the line. */
  syncroRemoteContacts: number;
  /** License rows for this client (vendor-joined) — drives the per-
   *  product rate lookup via ps-product-templates.ts. */
  clientPricing: ClientPricingInputs;
  /** Pre-allocated invoice number from the caller (so we can keep
   *  the same USI-YYYYMM-<SLUG> convention without coupling to a
   *  database round-trip). */
  invoiceNumber: string;
};

/* ============================================================================
 * Output
 * ========================================================================== */

export type PsMonthlyLine = {
  position: number;
  category: "support_baseline" | "license_third_party" | "service_recurring" | "other";
  locationId: string | null;
  sku: string | null;
  description: string;
  longDescription: string | null;
  quantity: number;
  unitRateCents: number;
  amountCents: number;
  isSectionHeader: boolean;
  sectionLabel: string | null;
  /** Audit: where this line's unit rate came from. */
  rateSource?:
    | "license_row"
    | "client_support_rate"
    | "client_rebill_rate"
    | "template_default";
  rateSourceLicenseId?: string;
};

export type PsMonthlyInvoiceDraft = {
  invoiceNumber: string;
  kind: "monthly_contract";
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  dueDate: string;
  poNumber: string;          // "April 2026"
  servicePeriodLabel: string; // "April 2026"
  rep: string;                // "PS"
  via: string;                // "Best Way"
  termsLabel: string;         // "NET 30"
  quantityBasis: string;      // "hardware"
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  lines: PsMonthlyLine[];
};

/* ============================================================================
 * Generator
 * ========================================================================== */

const RECURRING_PRODUCTS: PsProductKey[] = [
  "compute_node",
  "bitdefender_secure_plus",
  "liongard",
  "titanhq_plus",
];

export function buildPsMonthlyInvoice(
  input: PsMonthlyGeneratorInputs,
): PsMonthlyInvoiceDraft {
  const lines: PsMonthlyLine[] = [];
  let pos = 0;
  let subtotalCents = 0;

  // Sort locations alphabetically for deterministic output across runs.
  const sortedLocations = [...input.locationCounts].sort((a, b) =>
    a.locationLabel.localeCompare(b.locationLabel),
  );

  // Per-location sections — one section per location with compute >0.
  // Locations with zero compute nodes are skipped to match the legacy
  // template behavior (no empty subsection in the printed invoice).
  for (const loc of sortedLocations) {
    if (loc.computeNodes <= 0) continue;

    const overrides = input.perLocationOverrides?.[loc.locationId] ?? {};

    for (const key of RECURRING_PRODUCTS) {
      const template = PS_PRODUCT_TEMPLATES[key];
      // Quantity resolution per product type:
      //   - compute_node: always the hardware count
      //   - per_user products: override > compute-node count
      let qty: number;
      if (key === "compute_node") {
        qty = loc.computeNodes;
      } else {
        const override = overrides[key];
        qty = typeof override === "number" ? override : loc.computeNodes;
      }
      if (qty <= 0) continue;

      const rate = resolveProductRate(template, input.clientPricing);
      const amount = rate.cents * qty;
      subtotalCents += amount;

      lines.push({
        position: pos++,
        category: template.category,
        locationId: loc.locationId,
        sku: template.sku,
        description: template.description,
        longDescription: template.longDescription,
        quantity: qty,
        unitRateCents: rate.cents,
        amountCents: amount,
        isSectionHeader: false,
        sectionLabel: null,
        rateSource: rate.source,
        rateSourceLicenseId: rate.licenseId,
      });
    }
  }

  // Global Syncro Remote line at the bottom.
  if (input.syncroRemoteContacts > 0) {
    const template = PS_PRODUCT_TEMPLATES.syncro_remote;
    const rate = resolveProductRate(template, input.clientPricing);
    const amount = rate.cents * input.syncroRemoteContacts;
    subtotalCents += amount;
    lines.push({
      position: pos++,
      category: template.category,
      locationId: null,
      sku: template.sku,
      description: template.description,
      longDescription: template.longDescription,
      quantity: input.syncroRemoteContacts,
      unitRateCents: rate.cents,
      amountCents: amount,
      isSectionHeader: false,
      sectionLabel: null,
      rateSource: rate.source,
      rateSourceLicenseId: rate.licenseId,
    });
  }

  const taxCents = 0; // USI invoices have always been tax-exempt
  const totalCents = subtotalCents + taxCents;

  return {
    invoiceNumber: input.invoiceNumber,
    kind: "monthly_contract",
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    poNumber: input.servicePeriodLabel,
    servicePeriodLabel: input.servicePeriodLabel,
    rep: "PS",
    via: "Best Way",
    termsLabel: "NET 30",
    quantityBasis: "hardware",
    subtotalCents,
    taxCents,
    totalCents,
    lines,
  };
}

/**
 * Per-location subtotal helper for the preview UI + the DOCX renderer.
 * Returns a Map keyed by locationId (or null for the global section).
 */
export function locationSubtotals(
  lines: PsMonthlyLine[],
): Map<string | null, number> {
  const out = new Map<string | null, number>();
  for (const l of lines) {
    out.set(l.locationId, (out.get(l.locationId) ?? 0) + l.amountCents);
  }
  return out;
}
