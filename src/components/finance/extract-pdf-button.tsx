"use client";

/**
 * Upload a vendor invoice PDF, Claude extracts the line items, operator
 * reviews + selects which to keep, we batch-create them via the
 * existing createBillLine action.
 *
 * Flow:
 *   1. File input → POST /api/finance/bills/{id}/extract
 *   2. Response payload (lines + summary + warnings) renders in a
 *      dialog with one row per line + a checkbox to include/skip
 *   3. "Create lines" loops createBillLine over the checked rows.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { createBillLine } from "@/server/actions/finance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ExtractionLine = {
  description: string;
  sku: string | null;
  quantity: number | null;
  unitCostCents: number | null;
  totalCents: number;
  periodStart: string | null;
  periodEnd: string | null;
  confidence: "high" | "medium" | "low";
};

type Extraction = {
  summary: {
    vendor: string | null;
    invoiceNumber: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    totalCents: number | null;
  };
  lines: ExtractionLine[];
  warnings: string[];
};

export function ExtractPdfButton({
  billId,
  defaultPeriod,
}: {
  billId: string;
  defaultPeriod: { start: string | null; end: string | null };
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [creating, startCreating] = useTransition();

  const openPicker = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so the same file can be re-picked
    setUploading(true);
    setExtraction(null);
    try {
      const fd = new FormData();
      fd.set("pdf", file);
      const r = await fetch(`/api/finance/bills/${billId}/extract`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        const msg =
          body?.error ?? body?.message ?? `Extract failed (HTTP ${r.status})`;
        toast.error(msg);
        return;
      }
      const data = (await r.json()) as Extraction;
      setExtraction(data);
      setChecked(data.lines.map(() => true));
      if (data.warnings.length > 0) {
        toast.warning(`${data.warnings.length} warning(s) — review before saving`);
      } else {
        toast.success(`Extracted ${data.lines.length} line${data.lines.length === 1 ? "" : "s"}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const persist = () => {
    if (!extraction) return;
    const toCreate = extraction.lines.filter((_, i) => checked[i]);
    if (toCreate.length === 0) {
      toast.info("Nothing selected");
      return;
    }
    startCreating(async () => {
      let ok = 0;
      let fail = 0;
      for (const line of toCreate) {
        const r = await createBillLine({
          billId,
          description: line.description,
          sku: line.sku ?? null,
          quantity: line.quantity ?? null,
          unitCostCents: line.unitCostCents ?? null,
          totalCents: line.totalCents,
          periodStart: line.periodStart ?? defaultPeriod.start ?? null,
          periodEnd: line.periodEnd ?? defaultPeriod.end ?? null,
        });
        if (r?.serverError) fail++;
        else ok++;
      }
      if (fail === 0) {
        toast.success(`Created ${ok} line${ok === 1 ? "" : "s"}`);
        setExtraction(null);
        router.refresh();
      } else {
        toast.warning(`${ok} created · ${fail} failed`);
      }
    });
  };

  return (
    <>
      <input
        type="file"
        ref={fileRef}
        accept="application/pdf"
        onChange={onFile}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={openPicker}
        disabled={uploading}
        title="Upload a PDF invoice and let Claude extract line items"
      >
        {uploading ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <FileUp className="mr-1.5 size-3.5" />
        )}
        {uploading ? "Extracting…" : "Upload PDF & extract"}
      </Button>

      {extraction && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-lg border bg-background shadow-lg">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Sparkles className="size-4 text-primary" />
                  Extracted from PDF
                </h2>
                <p className="text-xs text-muted-foreground">
                  Review and uncheck anything that looks wrong, then create the
                  lines. The PDF itself isn't stored — only this JSON.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setExtraction(null)}
              >
                <X className="size-4" />
              </Button>
            </header>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
              {/* Summary */}
              <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-xs md:grid-cols-5">
                <SummaryField label="Vendor" value={extraction.summary.vendor} />
                <SummaryField label="Invoice #" value={extraction.summary.invoiceNumber} />
                <SummaryField label="Period start" value={extraction.summary.periodStart} />
                <SummaryField label="Period end" value={extraction.summary.periodEnd} />
                <SummaryField
                  label="Total"
                  value={
                    extraction.summary.totalCents != null
                      ? `$${(extraction.summary.totalCents / 100).toFixed(2)}`
                      : null
                  }
                />
              </div>

              {/* Warnings */}
              {extraction.warnings.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-50/30 p-3 text-xs dark:bg-amber-950/20">
                  <div className="font-semibold text-amber-700 dark:text-amber-300">
                    Warnings
                  </div>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-800 dark:text-amber-200">
                    {extraction.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Lines */}
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-6"></th>
                    <th className="py-1 pr-2 font-medium">Description</th>
                    <th className="py-1 pr-2 font-medium">SKU</th>
                    <th className="py-1 pr-2 text-right font-medium">Qty</th>
                    <th className="py-1 pr-2 text-right font-medium">Unit</th>
                    <th className="py-1 pr-2 text-right font-medium">Total</th>
                    <th className="py-1 font-medium">Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {extraction.lines.map((l, i) => (
                    <tr key={i} className="border-b last:border-0 align-top">
                      <td className="py-1.5 pr-2">
                        <input
                          type="checkbox"
                          checked={checked[i] ?? true}
                          onChange={(e) =>
                            setChecked((prev) =>
                              prev.map((c, idx) => (idx === i ? e.target.checked : c)),
                            )
                          }
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <div>{l.description}</div>
                        {(l.periodStart || l.periodEnd) && (
                          <div className="text-[10px] text-muted-foreground">
                            {l.periodStart ?? "?"} → {l.periodEnd ?? "?"}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-xs text-muted-foreground">
                        {l.sku ?? "—"}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {l.quantity ?? "—"}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {l.unitCostCents != null
                          ? `$${(l.unitCostCents / 100).toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums font-medium">
                        ${(l.totalCents / 100).toFixed(2)}
                      </td>
                      <td className="py-1.5">
                        <Badge
                          variant={
                            l.confidence === "high"
                              ? "default"
                              : l.confidence === "medium"
                                ? "secondary"
                                : "outline"
                          }
                          className="text-[10px] uppercase"
                        >
                          {l.confidence}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="flex items-center justify-between border-t px-4 py-3 text-xs">
              <span className="text-muted-foreground">
                {checked.filter(Boolean).length} of {extraction.lines.length}{" "}
                selected
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExtraction(null)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button onClick={persist} size="sm" disabled={creating}>
                  {creating ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : null}
                  Create {checked.filter(Boolean).length} line
                  {checked.filter(Boolean).length === 1 ? "" : "s"}
                </Button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function SummaryField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}
