"use client";

/**
 * Interactive composer for a PS-style monthly invoice.
 *
 * Server-rendered initial draft → operator can adjust per-(location ×
 * product) quantities and the global Syncro Remote count → "Refresh
 * preview" recomputes totals server-side → "Generate invoice" persists.
 *
 * Compute-node counts are AUTHORITATIVE (sourced from the hardware
 * table) — operator can't override them inline. To change those, edit
 * the hardware's location assignment on the client's Hardware tab.
 *
 * Bitdefender / Liongard / TitanHQ counts default to the location's
 * compute-node count but are fully editable until we wire per-location
 * vendor seat data (Phase 3 of the live-billing roadmap).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Receipt,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  generatePsInvoice,
  previewPsInvoice,
} from "@/server/actions/ps-invoices";

type LocationRow = {
  locationId: string;
  locationLabel: string;
  computeNodes: number;
};

type Draft = {
  invoiceNumber: string;
  servicePeriodLabel: string;
  poNumber: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  lines: Array<{
    locationId: string | null;
    sku: string | null;
    description: string;
    longDescription: string | null;
    quantity: number;
    unitRateCents: number;
    amountCents: number;
    rateSource?:
      | "license_row"
      | "client_support_rate"
      | "client_rebill_rate"
      | "template_default";
  }>;
};

type PsProductKey =
  | "compute_node"
  | "bitdefender_secure_plus"
  | "liongard"
  | "titanhq_plus"
  | "syncro_remote";

type OverrideMap = Record<string, Partial<Record<PsProductKey, number>>>;

const NON_COMPUTE_PRODUCTS: PsProductKey[] = [
  "bitdefender_secure_plus",
  "liongard",
  "titanhq_plus",
];

const PRODUCT_LABEL: Record<PsProductKey, string> = {
  compute_node: "Compute Node",
  bitdefender_secure_plus: "Bitdefender",
  liongard: "Liongard",
  titanhq_plus: "TitanHQ",
  syncro_remote: "Syncro Remote",
};

const fmtUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function PsInvoiceComposer({
  clientId,
  yyyymm,
  locationCounts,
  defaultDraft,
}: {
  clientId: string;
  yyyymm: string;
  locationCounts: LocationRow[];
  defaultDraft: Draft;
}) {
  const router = useRouter();
  const [previewing, startPreview] = useTransition();
  const [generating, startGenerate] = useTransition();
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [replace, setReplace] = useState(false);

  // Default overrides — Bitdefender / Liongard / TitanHQ start at the
  // compute count for each location.
  const [overrides, setOverrides] = useState<OverrideMap>(() => {
    const o: OverrideMap = {};
    for (const loc of locationCounts) {
      o[loc.locationId] = {
        bitdefender_secure_plus: loc.computeNodes,
        liongard: loc.computeNodes,
        titanhq_plus: loc.computeNodes,
      };
    }
    return o;
  });
  const [syncroRemote, setSyncroRemote] = useState<number>(0);

  const setOverride = (locId: string, key: PsProductKey, value: number) => {
    setOverrides((prev) => ({
      ...prev,
      [locId]: { ...(prev[locId] ?? {}), [key]: value },
    }));
  };

  const refresh = () =>
    startPreview(async () => {
      const r = await previewPsInvoice({
        clientId,
        yyyymm,
        perLocationOverrides: overrides,
        syncroRemoteContacts: syncroRemote,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      if (r?.data?.draft) {
        setDraft(r.data.draft as Draft);
        toast.success(
          `Preview refreshed — ${fmtUsd(r.data.draft.totalCents)} total`,
        );
      }
    });

  const commit = () =>
    startGenerate(async () => {
      const r = await generatePsInvoice({
        clientId,
        yyyymm,
        perLocationOverrides: overrides,
        syncroRemoteContacts: syncroRemote,
        replace,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      if (r?.data?.ok) {
        toast.success(
          `Invoice ${r.data.invoiceNumber} created — ${fmtUsd(r.data.totalCents)}`,
        );
        router.push(`/finance/invoices/${r.data.invoiceId}`);
      }
    });

  // Group lines by location for the preview table.
  const linesByLoc = new Map<string | null, Draft["lines"]>();
  for (const l of draft.lines) {
    const arr = linesByLoc.get(l.locationId) ?? [];
    arr.push(l);
    linesByLoc.set(l.locationId, arr);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      {/* Left column — preview */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>
              Per-location lines, then global Syncro Remote at the bottom.
              Rate <em>source</em> column shows whether the price came from a
              licenses row (client-specific override), the client's support
              rate, or the template default.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {draft.lines.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No billable lines yet. Compute-node counts come from the
                Hardware tab — make sure devices have a billing tier of
                "full compute node" and a location assigned.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 font-medium">Part #</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Rate src</th>
                    <th className="px-3 py-2 text-right font-medium">Unit</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(linesByLoc.entries()).map(([locId, ls]) => {
                    const locLabel =
                      locId === null
                        ? null
                        : locationCounts.find((c) => c.locationId === locId)
                            ?.locationLabel ?? "Location";
                    const subtotal = ls.reduce(
                      (s, l) => s + l.amountCents,
                      0,
                    );
                    return (
                      <>
                        {locLabel && (
                          <tr
                            key={`${locId}-header`}
                            className="border-b bg-muted/15"
                          >
                            <td
                              colSpan={6}
                              className="px-3 py-1.5 text-xs font-semibold tracking-wide"
                            >
                              ────── {locLabel} ──────
                            </td>
                          </tr>
                        )}
                        {ls.map((l, i) => (
                          <tr
                            key={`${locId}-${i}`}
                            className="border-b last:border-0 align-top"
                          >
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {l.quantity}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[11px]">
                              {l.sku}
                            </td>
                            <td className="px-3 py-1.5 whitespace-pre-line text-xs">
                              {l.longDescription ?? l.description}
                            </td>
                            <td className="px-3 py-1.5">
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase"
                              >
                                {l.rateSource === "license_row"
                                  ? "license"
                                  : l.rateSource === "client_support_rate"
                                    ? "client rate"
                                    : "default"}
                              </Badge>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {fmtUsd(l.unitRateCents)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                              {fmtUsd(l.amountCents)}
                            </td>
                          </tr>
                        ))}
                        {locLabel && (
                          <tr
                            key={`${locId}-subtotal`}
                            className="border-b font-medium"
                          >
                            <td className="px-3 py-1.5"></td>
                            <td className="px-3 py-1.5"></td>
                            <td
                              colSpan={3}
                              className="px-3 py-1.5 text-right text-xs"
                            >
                              Subtotal
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {fmtUsd(subtotal)}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2">
                    <td colSpan={5} className="px-3 py-2 text-right text-xs">
                      Subtotal
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtUsd(draft.subtotalCents)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="px-3 py-1 text-right text-xs">
                      Sales Tax 0.00%
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      {fmtUsd(draft.taxCents)}
                    </td>
                  </tr>
                  <tr className="bg-muted/30 font-bold">
                    <td colSpan={5} className="px-3 py-2 text-right">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtUsd(draft.totalCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right column — overrides + actions */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-location overrides</CardTitle>
            <CardDescription>
              Compute-node counts come from active hardware and are
              read-only here. Other product counts default to the compute
              count; edit any cell to override.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {locationCounts.map((loc) => (
              <div key={loc.locationId} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{loc.locationLabel}</span>
                  <span className="text-muted-foreground">
                    {loc.computeNodes} compute
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {NON_COMPUTE_PRODUCTS.map((key) => (
                    <div key={key}>
                      <Label className="text-[10px] text-muted-foreground">
                        {PRODUCT_LABEL[key]}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={overrides[loc.locationId]?.[key] ?? 0}
                        onChange={(e) =>
                          setOverride(
                            loc.locationId,
                            key,
                            Math.max(0, parseInt(e.target.value || "0", 10)),
                          )
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="border-t pt-3">
              <Label htmlFor="syncro-remote" className="text-xs">
                Global: Syncro Remote contacts
              </Label>
              <Input
                id="syncro-remote"
                type="number"
                min={0}
                value={syncroRemote}
                onChange={(e) =>
                  setSyncroRemote(
                    Math.max(0, parseInt(e.target.value || "0", 10)),
                  )
                }
                className="mt-1 h-8 text-xs"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Bills at the Syncro Remote rate (default $6/contact, or
                whatever is set on the Syncro license row for this client).
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <input
                id="replace"
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              <Label htmlFor="replace" className="text-xs">
                Replace existing invoice for this month (voids the prior
                one)
              </Label>
            </div>

            <Button
              onClick={refresh}
              disabled={previewing}
              variant="outline"
              className="w-full"
            >
              {previewing ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-3.5" />
              )}
              Refresh preview
            </Button>
            <Button
              onClick={commit}
              disabled={generating || draft.lines.length === 0}
              className="w-full"
            >
              {generating ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-3.5" />
              )}
              Generate invoice ({fmtUsd(draft.totalCents)})
            </Button>
          </CardContent>
        </Card>

        <p className="text-[10px] text-muted-foreground">
          After generation: download the PS-format DOCX via the{" "}
          <Receipt className="inline size-3" /> button on the invoice
          detail page. IIF export to QuickBooks lives on the same page.
        </p>
      </div>
    </div>
  );
}
