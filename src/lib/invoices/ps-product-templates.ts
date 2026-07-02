/**
 * PS-style invoice product templates.
 *
 * Each template is the canonical (SKU, description, billing basis,
 * default unit price) used by the PS monthly invoice generator. The
 * exact strings here are reproduced verbatim onto the printed invoice
 * so they match the legacy QB template that USI clients have been
 * receiving for years.
 *
 * Client-specific pricing
 * ───────────────────────
 * Per-client rates are looked up in this priority order:
 *
 *   1. `licenses` row for that (client, vendor, productName) →
 *      `rebillRateCents`. This is the data-driven override path —
 *      admins set client pricing by creating/editing the matching
 *      license row, which already has a UI on /licenses.
 *   2. For Compute Node specifically, fall back to
 *      `clients.supportRateFullComputeCents` (already a per-client
 *      field on the clients table).
 *   3. Template default cents (last resort, never used in prod for
 *      live clients — only for new ones not yet priced).
 *
 * Billing basis
 * ─────────────
 * - `per_compute_node` — qty = active full_compute_node hardware count
 *                       (per location for monthly contracts)
 * - `per_user` — qty = mailbox / user count (per location; operator
 *                override at generate time until we wire per-location
 *                user counts from M365 / Entra)
 * - `per_contact` — qty = global Syncro contact count (not per-loc)
 *
 * Add a new product? Append a template here, update the generator's
 * line-emit loop, and the DOCX builder picks it up automatically.
 */
export type ProductBillingBasis =
  | "per_compute_node"
  | "per_user"
  | "per_contact";

export type ProductTemplate = {
  /** Stable identifier used by the generator + admin overrides. */
  key:
    | "compute_node"
    | "bitdefender_secure_plus"
    | "liongard"
    | "titanhq_plus"
    | "syncro_remote";
  /** Part # printed on the invoice. */
  sku: string;
  /** Short description — the QB-mapping handle. */
  description: string;
  /** Multi-line bulleted body printed beneath the SKU. Lines are split
   *  on \n; bullet prefix "• " preserved verbatim. */
  longDescription: string;
  billingBasis: ProductBillingBasis;
  /** Vendor name to match against `licenses.vendor.name` when looking
   *  up the client-specific rate. Case-insensitive contains match. */
  vendorNameMatch: string | null;
  /** Product-name pattern to match the right license row (vs. e.g.
   *  Bitdefender's separate EDR-only line). Case-insensitive contains. */
  productNamePattern: string | null;
  /** Fallback unit price in cents. Only used when no client-specific
   *  rate is set anywhere. */
  defaultUnitCents: number;
  /** Invoice line category for QB mapping. */
  category: "support_baseline" | "license_third_party" | "service_recurring";
};

export const PS_PRODUCT_TEMPLATES = {
  compute_node: {
    key: "compute_node" as const,
    sku: "PS / Compute Node",
    description: "Contract IT Services for Endpoint/Computer - 1 Month.",
    longDescription: "Contract IT Services for Endpoint/Computer - 1 Month.",
    billingBasis: "per_compute_node" as const,
    vendorNameMatch: null, // USI's own service — never a vendor lookup
    productNamePattern: null,
    defaultUnitCents: 11000, // $110.00
    category: "support_baseline" as const,
  },
  bitdefender_secure_plus: {
    key: "bitdefender_secure_plus" as const,
    sku: "2765SEPSN012AAZZ",
    description: "Bitdefender GravityZone Cloud Security - Secure Plus Bundle, 1 month",
    longDescription:
      "Bitdefender GravityZone Cloud Security - Secure Plus Bundle, 1 month\n" +
      " - Bundle Includes: existing Core MSP solution + ATS + EDR + MDR Foundations",
    billingBasis: "per_compute_node" as const,
    vendorNameMatch: "bitdefender",
    productNamePattern: "secure plus",
    defaultUnitCents: 1000, // $10.00
    category: "license_third_party" as const,
  },
  liongard: {
    key: "liongard" as const,
    sku: "Liongard",
    description: "Liongard Asset Inventory",
    longDescription: "Liongard Asset Inventory",
    billingBasis: "per_user" as const,
    vendorNameMatch: "liongard",
    productNamePattern: null,
    defaultUnitCents: 300, // $3.00
    category: "license_third_party" as const,
  },
  titanhq_plus: {
    key: "titanhq_plus" as const,
    sku: "TitanHQ Plus",
    description: "TitanHQ Plus Cybersecurity Platform Protection",
    longDescription:
      "TitanHQ Plus Cybersecurity Platform Protection\n" +
      "• Phish • Spam • Security Awareness Training\n" +
      "• Monthly Subscription",
    billingBasis: "per_user" as const,
    vendorNameMatch: "titanhq",
    productNamePattern: null,
    defaultUnitCents: 350, // $3.50
    category: "license_third_party" as const,
  },
  syncro_remote: {
    key: "syncro_remote" as const,
    sku: "Syncro Remote",
    description: "Syncro Remote Access - per contact",
    longDescription: "Syncro Remote Access - per contact",
    billingBasis: "per_contact" as const,
    vendorNameMatch: "syncro",
    productNamePattern: "remote",
    defaultUnitCents: 600, // $6.00
    category: "service_recurring" as const,
  },
} satisfies Record<string, ProductTemplate>;

export type PsProductKey = keyof typeof PS_PRODUCT_TEMPLATES;

/**
 * Look up the per-client unit price for one product. Order:
 *
 *   1. `licenses` row matching (vendor name pattern, product pattern,
 *      client) → rebill_rate_cents
 *   2. (compute_node only) clients.supportRateFullComputeCents
 *   3. template.defaultUnitCents
 *
 * Returns { cents, source } so the preview UI can show where the
 * price came from.
 */
export type ResolvedRate = {
  cents: number;
  source:
    | "license_row"
    | "client_support_rate"
    | "client_rebill_rate"
    | "template_default";
  /** Optional handle to the license row if matched, for audit
   *  visibility. */
  licenseId?: string;
};

export type ClientPricingInputs = {
  /** All active license rows for this client, joined with their
   *  vendor name. */
  licenses: Array<{
    id: string;
    vendorName: string | null;
    productName: string;
    rebillRateCents: number | null;
  }>;
  /** From clients.supportRateFullComputeCents — used only as a fallback
   *  for compute_node. */
  clientSupportRateFullComputeCents: number | null;
  /** Per-client per-product rebill rates from the new columns on the
   *  clients table. Each key is a product key — when present (incl.
   *  0), it wins over the template default for that product. The
   *  license_row lookup still takes precedence because that's the
   *  per-license-row override path. */
  clientRebillRates?: Partial<Record<PsProductKey, number | null>>;
};

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().trim();

export function resolveProductRate(
  template: ProductTemplate,
  inputs: ClientPricingInputs,
): ResolvedRate {
  // 1. License-row match
  if (template.vendorNameMatch) {
    const vendorNeedle = norm(template.vendorNameMatch);
    const productNeedle = norm(template.productNamePattern);
    const matches = inputs.licenses.filter((l) => {
      if (!l.rebillRateCents) return false;
      if (!norm(l.vendorName).includes(vendorNeedle)) return false;
      if (productNeedle && !norm(l.productName).includes(productNeedle)) {
        return false;
      }
      return true;
    });
    // If multiple match (e.g. several BD license rows), pick the one
    // with the highest rebill rate — operators typically set the
    // headline product first.
    matches.sort((a, b) => (b.rebillRateCents ?? 0) - (a.rebillRateCents ?? 0));
    if (matches[0]) {
      return {
        cents: matches[0].rebillRateCents!,
        source: "license_row",
        licenseId: matches[0].id,
      };
    }
  }

  // 2. Per-client rebill rate (third-party products only — compute
  // node has its own dedicated path below).
  const perClientRate = inputs.clientRebillRates?.[template.key];
  if (template.key !== "compute_node" && perClientRate != null) {
    return { cents: perClientRate, source: "client_rebill_rate" };
  }

  // 3. Client support-rate fallback (compute node only)
  if (
    template.key === "compute_node" &&
    inputs.clientSupportRateFullComputeCents != null
  ) {
    return {
      cents: inputs.clientSupportRateFullComputeCents,
      source: "client_support_rate",
    };
  }

  // 4. Template default
  return { cents: template.defaultUnitCents, source: "template_default" };
}
