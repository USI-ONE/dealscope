"use client";

/**
 * "Generate from snapshots" button on /finance/billables.
 *
 * Two-step flow:
 *   1. Dry-run preview — calls the server action with dryRun=true and
 *      shows the candidate rows + totals in a dialog. Lets the operator
 *      sanity-check before any DB writes.
 *   2. Confirm — re-runs without dryRun, persists draft billables, and
 *      refreshes the page.
 *
 * Period is derived from the YYYY-MM month string passed in by the
 * billables page (so the dialog generates against the currently-viewed
 * month).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { generateBillablesFromSnapshots } from "@/server/actions/finance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type PreviewRow = {
  clientId: string;
  clientName: string | null;
  licenseId: string;
  productName: string;
  vendorName: string | null;
  seats: number;
  costTotalCents: number;
  rebillTotalCents: number;
  marginCents: number;
  skippedExisting: boolean;
};

export function GenerateBillablesButton({ month }: { month: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);

  const periodStart = `${month}-01`;
  const periodEnd = lastDayOfMonth(month);

  const runDryRun = () => {
    setOpen(true);
    setPreview(null);
    start(async () => {
      const r = await generateBillablesFromSnapshots({
        periodStart,
        periodEnd,
        dryRun: true,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        setOpen(false);
        return;
      }
      setPreview(r?.data?.rows ?? []);
    });
  };

  const confirm = () =>
    start(async () => {
      const r = await generateBillablesFromSnapshots({
        periodStart,
        periodEnd,
        dryRun: false,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      const d = r?.data;
      toast.success(
        `Created ${d?.created ?? 0} draft billable${d?.created === 1 ? "" : "s"}${d?.skipped ? ` · skipped ${d.skipped} already present` : ""}`,
      );
      setOpen(false);
      setPreview(null);
      router.refresh();
    });

  return (
    <>
      <Button
        onClick={runDryRun}
        size="sm"
        variant="outline"
        title="Auto-create draft billables for this month from the latest vendor seat snapshots."
      >
        <Sparkles className="mr-1.5 size-3.5" />
        Generate from snapshots
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-lg border bg-background shadow-lg">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="text-base font-semibold">
                  Generate billables for {month}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Draft billables seeded from the latest vendor seat
                  snapshots. Review below, then confirm to persist.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setOpen(false);
                  setPreview(null);
                }}
              >
                <X className="size-4" />
              </Button>
            </header>
            <div className="max-h-[60vh] overflow-y-auto">
              {pending && !preview ? (
                <div className="p-5 sm:p-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 size-4 animate-spin" />
                  Computing preview…
                </div>
              ) : preview && preview.length === 0 ? (
                <div className="p-5 sm:p-8 text-center text-sm text-muted-foreground">
                  No candidate billables. Either no vendor snapshots
                  exist yet, or every active license already has a
                  billable for this period.
                </div>
              ) : preview ? (
                <PreviewTable rows={preview} />
              ) : null}
            </div>
            <footer className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <div className="text-xs text-muted-foreground">
                {preview && (
                  <Summary rows={preview} />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    setPreview(null);
                  }}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={confirm}
                  disabled={pending || !preview || preview.filter((r) => !r.skippedExisting).length === 0}
                >
                  {pending ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : null}
                  Create drafts
                </Button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="px-4 py-2 font-medium">Client</th>
          <th className="px-4 py-2 font-medium">License</th>
          <th className="px-4 py-2 text-right font-medium">Seats</th>
          <th className="px-4 py-2 text-right font-medium">Cost</th>
          <th className="px-4 py-2 text-right font-medium">Rebill</th>
          <th className="px-4 py-2 text-right font-medium">Margin</th>
          <th className="px-4 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={`${r.licenseId}::${r.clientId}`}
            className={
              "border-b last:border-0 " +
              (r.skippedExisting ? "text-muted-foreground" : "")
            }
          >
            <td className="px-4 py-2">{r.clientName ?? "—"}</td>
            <td className="px-4 py-2">
              <div className="font-medium">{r.productName}</div>
              {r.vendorName && (
                <div className="text-[10px] text-muted-foreground">
                  {r.vendorName}
                </div>
              )}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">{r.seats}</td>
            <td className="px-4 py-2 text-right tabular-nums">
              ${(r.costTotalCents / 100).toFixed(2)}
            </td>
            <td className="px-4 py-2 text-right tabular-nums font-medium">
              ${(r.rebillTotalCents / 100).toFixed(2)}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">
              ${(r.marginCents / 100).toFixed(2)}
            </td>
            <td className="px-4 py-2">
              {r.skippedExisting && (
                <Badge variant="outline" className="text-[10px]">
                  exists
                </Badge>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Summary({ rows }: { rows: PreviewRow[] }) {
  const active = rows.filter((r) => !r.skippedExisting);
  const skipped = rows.length - active.length;
  const total = active.reduce((sum, r) => sum + r.rebillTotalCents, 0);
  return (
    <>
      {active.length} to create · {skipped} already present ·{" "}
      <strong>${(total / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>{" "}
      total rebill
    </>
  );
}

function lastDayOfMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  // Day 0 of the next month = last day of this month.
  const d = new Date(Date.UTC(y, m, 0));
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyymm}-${dd}`;
}
