/**
 * Invoice-number helpers. Format is TechOS-owned (not QB-assigned)
 * so every invoice is uniquely identifiable independent of QB import
 * state.
 *
 *   monthly_contract → USI-YYYYMM-<CLIENT_SLUG>
 *   hardware         → USI-HW-<ORDER_REF>            (e.g. USI-HW-ORD-1024)
 *   one_off          → USI-YYYYMM-<CLIENT_SLUG>-<NN> (NN per client/month)
 */
import "server-only";

function up(s: string, max: number): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, max);
}

export function monthlyInvoiceNumber(month: string, clientSlug: string): string {
  // month: "2026-05"
  const ym = month.replace("-", "");
  return `USI-${ym}-${up(clientSlug, 12)}`;
}

export function hardwareInvoiceNumber(orderRefCode: string): string {
  return `USI-HW-${up(orderRefCode, 24)}`;
}

export function oneOffInvoiceNumber(
  month: string,
  clientSlug: string,
  sequence: number,
): string {
  const ym = month.replace("-", "");
  const nn = String(sequence).padStart(2, "0");
  return `USI-${ym}-${up(clientSlug, 12)}-${nn}`;
}
