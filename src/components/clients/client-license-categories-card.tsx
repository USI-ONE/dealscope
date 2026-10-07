"use client";

/**
 * Per-client "Licenses by category" rollup.
 *
 * Read-only summary that lists every category this client has at least
 * one active license in, with the products + seat counts under each.
 * Sits above the existing Licenses card on /clients/[id] so an
 * operator can answer "what tools is this client running" without
 * scrolling through 30+ products.
 *
 * Drill-down: click a category header to expand its product list.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type LicenseCategory,
} from "@/lib/licenses/categorize";

export type LicenseForCategorySummary = {
  id: string;
  productName: string;
  vendorName: string | null;
  category: LicenseCategory;
  seatsTotal: number | null;
  rebillRateCents: number | null;
  /** How many devices currently consume a seat of this license.
   *  Driven by license_assignments.hardware_id. */
  consumingDeviceCount: number;
};

const fmtUsd = (cents: number | null) =>
  cents == null
    ? null
    : `$${(cents / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

export function ClientLicenseCategoriesCard({
  licenses,
}: {
  licenses: LicenseForCategorySummary[];
}) {
  const [expanded, setExpanded] = useState(true);
  const [open, setOpen] = useState<Set<LicenseCategory>>(new Set());

  // Group active licenses by category.
  const byCategory = new Map<LicenseCategory, LicenseForCategorySummary[]>();
  for (const l of licenses) {
    const arr = byCategory.get(l.category) ?? [];
    arr.push(l);
    byCategory.set(l.category, arr);
  }

  const categoriesPresent = CATEGORY_ORDER.filter((c) => byCategory.has(c));
  const totalCategories = categoriesPresent.length;
  const totalProducts = licenses.length;

  const toggleCategory = (c: LicenseCategory) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-start gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tag className="size-5 text-primary" />
              Licenses by category
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalProducts} active license{totalProducts === 1 ? "" : "s"} across{" "}
              {totalCategories} categor
              {totalCategories === 1 ? "y" : "ies"}.
              {!expanded && totalProducts > 0 && " Click to expand."}
            </p>
          </div>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-1">
          {totalProducts === 0 ? (
            <p className="text-sm text-muted-foreground">
              No licenses recorded for this client yet.
            </p>
          ) : (
            categoriesPresent.map((cat) => {
              const rows = byCategory.get(cat)!;
              const isOpen = open.has(cat);
              const totalSeats = rows.reduce(
                (s, r) => s + (r.seatsTotal ?? 0),
                0,
              );
              const totalConsuming = rows.reduce(
                (s, r) => s + r.consumingDeviceCount,
                0,
              );
              return (
                <div
                  key={cat}
                  className="rounded-md border bg-muted/10"
                >
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className="flex w-full items-center justify-between gap-3 p-2.5 text-left hover:bg-muted/20"
                  >
                    <div className="flex items-center gap-2">
                      {isOpen ? (
                        <ChevronDown className="size-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3.5 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">
                        {CATEGORY_LABEL[cat]}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {rows.length} product{rows.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                      {totalSeats > 0 && <span>{totalSeats} seats</span>}
                      {totalConsuming > 0 && (
                        <span>{totalConsuming} devices linked</span>
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t bg-background p-2.5">
                      <table className="w-full text-xs">
                        <thead className="text-left uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="py-1 font-medium">Product</th>
                            <th className="py-1 font-medium">Vendor</th>
                            <th className="py-1 text-right font-medium">Seats</th>
                            <th className="py-1 text-right font-medium">Devices</th>
                            <th className="py-1 text-right font-medium">Rebill</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((l) => (
                            <tr key={l.id} className="border-t">
                              <td className="py-1.5 font-medium">{l.productName}</td>
                              <td className="py-1.5 text-muted-foreground">
                                {l.vendorName ?? "—"}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {l.seatsTotal ?? "—"}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {l.consumingDeviceCount > 0
                                  ? l.consumingDeviceCount
                                  : "—"}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {fmtUsd(l.rebillRateCents) ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      )}
    </Card>
  );
}
