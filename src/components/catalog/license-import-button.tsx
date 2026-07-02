"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bulkImportLicenses } from "@/server/actions/bulk-catalog";
import { getCell } from "@/lib/csv/parse";
import { CsvImportModal } from "./csv-import-modal";

type LicenseRow = Parameters<typeof bulkImportLicenses>[0]["rows"][number];

const BILLING_PERIODS = new Set([
  "monthly",
  "annual",
  "per_seat_monthly",
  "per_seat_annual",
  "perpetual",
  "consumption",
]);
const STATUSES = new Set(["active", "expired", "lapsed", "draft"]);

function dollarsToCents(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function asInt(s: string): number | null {
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function asDate(s: string): string | null {
  if (!s) return null;
  // Accept YYYY-MM-DD as-is; try to coerce common alternatives.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function LicenseImportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="mr-1 size-3.5" /> Bulk import licenses
      </Button>
      <CsvImportModal<LicenseRow>
        open={open}
        onClose={() => setOpen(false)}
        title="Bulk import licenses"
        description="Create license rows in bulk. Vendor is matched by name/slug; client is optional — leave blank for the USI pool, then assign later from this page."
        exampleHeaders={[
          "product_name",
          "sku",
          "vendor_name",
          "client_name",
          "seats_total",
          "billing_period",
          "status",
          "starts_at",
          "renewal_date",
          "rebill_rate",
          "cost_basis",
          "markup_pct",
          "notes",
        ]}
        exampleRows={[
          [
            "Microsoft 365 Business Premium",
            "M365_BP",
            "Microsoft",
            "AHP",
            "120",
            "annual",
            "active",
            "2026-01-01",
            "2026-12-31",
            "26.40",
            "22.00",
            "20",
            "",
          ],
          [
            "SentinelOne Complete",
            "S1_C",
            "SentinelOne",
            "",
            "144",
            "annual",
            "active",
            "",
            "2026-12-31",
            "9.00",
            "7.50",
            "20",
            "Unassigned — USI pool",
          ],
        ]}
        rowAdapter={(r) => {
          const productName = getCell(r, "product_name", "product");
          if (!productName)
            return { ok: false, error: "Missing 'product_name'" };
          const billing = getCell(r, "billing_period", "period").toLowerCase();
          const billingPeriod = BILLING_PERIODS.has(billing)
            ? (billing as
                | "monthly"
                | "annual"
                | "per_seat_monthly"
                | "per_seat_annual"
                | "perpetual"
                | "consumption")
            : null;
          const statusRaw = getCell(r, "status").toLowerCase();
          const status = STATUSES.has(statusRaw)
            ? (statusRaw as "active" | "expired" | "lapsed" | "draft")
            : null;

          return {
            ok: true,
            value: {
              productName,
              sku: getCell(r, "sku") || null,
              vendorName: getCell(r, "vendor_name", "vendor") || null,
              vendorSlug: getCell(r, "vendor_slug") || null,
              clientName: getCell(r, "client_name", "client") || null,
              clientSlug: getCell(r, "client_slug") || null,
              seatsTotal: asInt(getCell(r, "seats_total", "seats")),
              billingPeriod,
              status,
              startsAt: asDate(getCell(r, "starts_at", "start_date")),
              renewalDate: asDate(
                getCell(r, "renewal_date", "renewal", "expires_at"),
              ),
              rebillRateCents: dollarsToCents(
                getCell(r, "rebill_rate", "rebill", "rebill_rate_usd"),
              ),
              costBasisCents: dollarsToCents(
                getCell(r, "cost_basis", "cost", "cost_basis_usd"),
              ),
              markupPct: asInt(getCell(r, "markup_pct", "markup")),
              notes: getCell(r, "notes") || null,
            },
          };
        }}
        submitter={async (rows, dryRun) => {
          const r = await bulkImportLicenses({ rows, dryRun });
          if (r?.serverError) {
            return {
              outcomes: [
                { rowIndex: -1, status: "error", message: r.serverError },
              ],
              summary: { created: 0, updated: 0, skipped: 0, error: 1 },
            };
          }
          return r?.data
            ? { outcomes: r.data.outcomes, summary: r.data.summary }
            : null;
        }}
      />
    </>
  );
}
